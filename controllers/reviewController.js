const Review = require('../models/reviewModel');
const User = require('../models/userModel');
const Shop = require('../models/shopModel');
const { logActivity } = require('./activityController');
const sentimentAnalysisService = require('../services/sentimentAnalysisService');

// Get all reviews with pagination and filtering
exports.getAllReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const { status, rating, shopId, search } = req.query;
    
    // Build filter object
    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (rating && rating !== 'all') {
      filter.rating = parseInt(rating);
    }
    if (shopId) {
      filter.shopId = shopId;
    }
    if (search) {
      filter.$or = [
        { comment: { $regex: search, $options: 'i' } }
      ];
    }
    
    const reviews = await Review.find(filter)
      .populate('userId', 'name email fullName')
      .populate('shopId', 'shopName licenseNumber')
      .populate('moderatedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Review.countDocuments(filter);
    
    // Transform reviews to match frontend expectations
    const transformedReviews = reviews.map(review => ({
      id: review._id,
      user: review.userId ? (review.userId.name || review.userId.fullName || 'Unknown User') : 'Unknown User',
      userEmail: review.userId ? review.userId.email : '',
      shop: review.shopId ? review.shopId.shopName : 'Unknown Shop',
      shopId: review.shopId ? review.shopId._id : null,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      reportCount: review.reportCount,
      date: review.createdAt.toISOString().split('T')[0],
      moderatedBy: review.moderatedBy,
      moderationNotes: review.moderationNotes,
      moderatedAt: review.moderatedAt,
      reportReasons: review.reportReasons,
      sentiment: review.sentiment || 'neutral',
      sentimentConfidence: review.sentimentConfidence || 0.5
    }));
    
    res.json({
      success: true,
      data: {
        reviews: transformedReviews,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalReviews: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Get all reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
};

// Get review by ID
exports.getReviewById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const review = await Review.findById(id)
      .populate('userId', 'name email fullName')
      .populate('shopId', 'shopName licenseNumber')
      .populate('moderatedBy', 'name email');
    
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }
    
    const transformedReview = {
      id: review._id,
      user: review.userId ? (review.userId.name || review.userId.fullName || 'Unknown User') : 'Unknown User',
      userEmail: review.userId ? review.userId.email : '',
      shop: review.shopId ? review.shopId.shopName : 'Unknown Shop',
      shopId: review.shopId ? review.shopId._id : null,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      reportCount: review.reportCount,
      date: review.createdAt.toISOString().split('T')[0],
      moderatedBy: review.moderatedBy,
      moderationNotes: review.moderationNotes,
      moderatedAt: review.moderatedAt,
      reportReasons: review.reportReasons
    };
    
    res.json({
      success: true,
      data: { review: transformedReview }
    });
    
  } catch (error) {
    console.error('Get review by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch review'
    });
  }
};

// Update review status (approve/remove/flag)
exports.updateReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!['active', 'flagged', 'removed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "active", "flagged", or "removed"'
      });
    }
    
    const review = await Review.findById(id)
      .populate('userId', 'name email fullName')
      .populate('shopId', 'shopName');
    
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }
    
    const previousStatus = review.status;
    review.status = status;
    review.moderatedBy = req.admin?.id;
    review.moderationNotes = notes;
    review.moderatedAt = new Date();
    
    await review.save();
    
    // Log the activity
    await logActivity({
      type: status === 'removed' ? 'review_removed' : 'review_flagged',
      description: `Review by ${review.userId ? (review.userId.name || review.userId.fullName) : 'Unknown User'} ${status === 'removed' ? 'removed' : 'flagged'} by admin`,
      userId: review.userId._id,
      shopId: review.shopId._id,
      adminId: req.admin?.id,
      metadata: {
        reviewId: review._id,
        userName: review.userId ? (review.userId.name || review.userId.fullName) : 'Unknown User',
        shopName: review.shopId.shopName,
        rating: review.rating,
        previousStatus,
        newStatus: status,
        moderationNotes: notes
      },
      severity: status === 'removed' ? 'high' : 'medium',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      message: `Review ${status === 'removed' ? 'removed' : 'status updated'} successfully`
    });
    
  } catch (error) {
    console.error('Update review status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update review status'
    });
  }
};

// Get review statistics
exports.getReviewStats = async (req, res) => {
  try {
    const totalReviews = await Review.countDocuments();
    const activeReviews = await Review.countDocuments({ status: 'active' });
    const flaggedReviews = await Review.countDocuments({ status: 'flagged' });
    const removedReviews = await Review.countDocuments({ status: 'removed' });
    
    // Get reviews created in the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newReviews = await Review.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
    
    // Get average rating
    const avgRatingResult = await Review.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: null, avgRating: { $avg: '$rating' } } }
    ]);
    const avgRating = avgRatingResult.length > 0 ? avgRatingResult[0].avgRating : 0;
    
    // Get rating distribution
    const ratingDistribution = await Review.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get sentiment distribution
    const sentimentDistribution = await Review.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$sentiment',
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate average sentiment confidence
    const sentimentConfidenceStats = await Review.aggregate([
      { $match: { status: 'active', sentimentConfidence: { $exists: true } } },
      {
        $group: {
          _id: null,
          avgConfidence: { $avg: '$sentimentConfidence' }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        totalReviews,
        activeReviews,
        flaggedReviews,
        removedReviews,
        newReviews,
        avgRating: Math.round(avgRating * 10) / 10,
        ratingDistribution,
        sentimentDistribution: sentimentDistribution.reduce((acc, item) => {
          acc[item._id || 'neutral'] = item.count;
          return acc;
        }, { positive: 0, negative: 0, neutral: 0 }),
        avgSentimentConfidence: sentimentConfidenceStats.length > 0 
          ? Math.round(sentimentConfidenceStats[0].avgConfidence * 100) / 100 
          : 0
      }
    });
    
  } catch (error) {
    console.error('Get review stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch review statistics'
    });
  }
};

// Create a new review
exports.createReview = async (req, res) => {
  try {
    const { shopId, rating, comment } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!shopId || !rating || !comment) {
      return res.status(400).json({
        success: false,
        message: 'Shop ID, rating, and comment are required'
      });
    }

    // Validate rating range
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Check if shop exists
    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    // Check if user has already reviewed this shop
    const existingReview = await Review.findOne({ userId, shopId });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this shop'
      });
    }

    // Analyze sentiment using ML (Naive Bayes)
    const sentimentAnalysis = sentimentAnalysisService.analyzeSentiment(comment, rating);

    // Create new review
    const review = new Review({
      userId,
      shopId,
      rating,
      comment: comment.trim(),
      sentiment: sentimentAnalysis.sentiment,
      sentimentConfidence: sentimentAnalysis.confidence,
      sentimentScore: sentimentAnalysis.score,
      sentimentNormalizedScore: sentimentAnalysis.normalizedScore,
      sentimentAnalyzedAt: new Date()
    });

    await review.save();

    // Retrain model with new review (for continuous learning)
    sentimentAnalysisService.retrainWithReview(comment, sentimentAnalysis.sentiment, rating);

    // Update shop rating and review count
    await updateShopRating(shopId);

    // Log the activity
    await logActivity({
      type: 'review_created',
      description: `New review created for shop ${shop.shopName}`,
      userId: userId,
      shopId: shopId,
      metadata: {
        reviewId: review._id,
        rating: rating,
        shopName: shop.shopName
      },
      severity: 'low',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: {
        review: {
          id: review._id,
          rating: review.rating,
          comment: review.comment,
          status: review.status,
          createdAt: review.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create review'
    });
  }
};

// Update an existing review
exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    // Validate rating if provided
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Find the review
    const review = await Review.findById(id).populate('shopId', 'shopName');
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check if user owns this review
    if (review.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own reviews'
      });
    }

    // Update review fields
    if (rating !== undefined) review.rating = rating;
    if (comment !== undefined) review.comment = comment.trim();

    // Re-analyze sentiment if comment or rating changed
    if (rating !== undefined || comment !== undefined) {
      const newComment = comment !== undefined ? comment.trim() : review.comment;
      const newRating = rating !== undefined ? rating : review.rating;
      const sentimentAnalysis = sentimentAnalysisService.analyzeSentiment(newComment, newRating);
      
      review.sentiment = sentimentAnalysis.sentiment;
      review.sentimentConfidence = sentimentAnalysis.confidence;
      review.sentimentScore = sentimentAnalysis.score;
      review.sentimentNormalizedScore = sentimentAnalysis.normalizedScore;
      review.sentimentAnalyzedAt = new Date();
    }

    await review.save();

    // Update shop rating
    await updateShopRating(review.shopId);

    // Log the activity
    await logActivity({
      type: 'review_updated',
      description: `Review updated for shop ${review.shopId.shopName}`,
      userId: userId,
      shopId: review.shopId._id,
      metadata: {
        reviewId: review._id,
        rating: review.rating,
        shopName: review.shopId.shopName
      },
      severity: 'low',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Review updated successfully',
      data: {
        review: {
          id: review._id,
          rating: review.rating,
          comment: review.comment,
          status: review.status,
          updatedAt: review.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update review'
    });
  }
};

// Delete a review
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find the review
    const review = await Review.findById(id).populate('shopId', 'shopName');
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check if user owns this review
    if (review.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own reviews'
      });
    }

    const shopId = review.shopId._id;
    const shopName = review.shopId.shopName;

    // Delete the review
    await Review.findByIdAndDelete(id);

    // Update shop rating
    await updateShopRating(shopId);

    // Log the activity
    await logActivity({
      type: 'review_deleted',
      description: `Review deleted for shop ${shopName}`,
      userId: userId,
      shopId: shopId,
      metadata: {
        reviewId: id,
        shopName: shopName
      },
      severity: 'low',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });

  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete review'
    });
  }
};

// Get reviews for a specific shop
exports.getShopReviews = async (req, res) => {
  try {
    const { shopId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Check if shop exists
    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    // Get reviews for the shop
    const reviews = await Review.find({ shopId, status: 'active' })
      .populate('userId', 'fullName name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments({ shopId, status: 'active' });

    // Transform reviews
    const transformedReviews = reviews.map(review => ({
      id: review._id,
      user: review.userId ? (review.userId.fullName || review.userId.name || 'Anonymous') : 'Anonymous',
      rating: review.rating,
      comment: review.comment,
      date: review.createdAt.toISOString().split('T')[0],
      createdAt: review.createdAt,
      sentiment: review.sentiment || 'neutral',
      sentimentConfidence: review.sentimentConfidence || 0.5
    }));

    res.json({
      success: true,
      data: {
        reviews: transformedReviews,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalReviews: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        },
        shop: {
          id: shop._id,
          name: shop.shopName,
          rating: shop.rating,
          reviewCount: shop.reviewCount
        }
      }
    });

  } catch (error) {
    console.error('Get shop reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shop reviews'
    });
  }
};

// Get user's review for a specific shop
exports.getMyReviewForShop = async (req, res) => {
  try {
    const { shopId } = req.params;
    const userId = req.user.id;

    // Find the review for this user and shop
    const review = await Review.findOne({ userId, shopId, status: 'active' })
      .populate('shopId', 'shopName');

    if (!review) {
      return res.json({
        success: true,
        data: null // No review found
      });
    }

    // Transform review
    const transformedReview = {
      id: review._id,
      shop: review.shopId ? review.shopId.shopName : 'Unknown Shop',
      shopId: review.shopId ? review.shopId._id : null,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      date: review.createdAt.toISOString().split('T')[0],
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      sentiment: review.sentiment || 'neutral',
      sentimentConfidence: review.sentimentConfidence || 0.5
    };

    res.json({
      success: true,
      data: transformedReview
    });

  } catch (error) {
    console.error('Get my review for shop error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch review'
    });
  }
};

// Get user's own reviews
exports.getMyReviews = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get reviews for the user
    const reviews = await Review.find({ userId, status: 'active' })
      .populate('shopId', 'shopName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments({ userId, status: 'active' });

    // Transform reviews
    const transformedReviews = reviews.map(review => ({
      id: review._id,
      shop: review.shopId ? review.shopId.shopName : 'Unknown Shop',
      shopId: review.shopId ? review.shopId._id : null,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      date: review.createdAt.toISOString().split('T')[0],
      createdAt: review.createdAt
    }));

    res.json({
      success: true,
      data: {
        reviews: transformedReviews,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalReviews: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get my reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user reviews'
    });
  }
};

// Report a review
exports.reportReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Report reason is required'
      });
    }

    // Find the review
    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check if user already reported this review
    const alreadyReported = review.reportReasons.some(
      report => report.reportedBy && report.reportedBy.toString() === userId
    );

    if (alreadyReported) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this review'
      });
    }

    // Add report
    review.reportReasons.push({
      reason: reason.trim(),
      reportedBy: userId,
      reportedAt: new Date()
    });

    // Increment report count
    review.reportCount = (review.reportCount || 0) + 1;

    // Auto-flag if report count reaches threshold (e.g., 3)
    if (review.reportCount >= 3 && review.status === 'active') {
      review.status = 'flagged';
    }

    await review.save();

    // Log the activity
    await logActivity({
      type: 'review_reported',
      description: `Review reported by user`,
      userId: userId,
      shopId: review.shopId,
      metadata: {
        reviewId: review._id,
        reason: reason,
        reportCount: review.reportCount,
        autoFlagged: review.reportCount >= 3
      },
      severity: 'medium',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Review reported successfully',
      data: {
        reportCount: review.reportCount,
        autoFlagged: review.reportCount >= 3
      }
    });

  } catch (error) {
    console.error('Report review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to report review'
    });
  }
};

// Helper function to update shop rating
async function updateShopRating(shopId) {
  try {
    // Calculate average rating and count for the shop
    const ratingStats = await Review.aggregate([
      { $match: { shopId: shopId, status: 'active' } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 }
        }
      }
    ]);

    const averageRating = ratingStats.length > 0 ? ratingStats[0].averageRating : 0;
    const reviewCount = ratingStats.length > 0 ? ratingStats[0].reviewCount : 0;

    // Update shop with new rating and review count
    await Shop.findByIdAndUpdate(shopId, {
      rating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
      reviewCount: reviewCount
    });

    console.log(`Updated shop ${shopId} rating: ${averageRating}, count: ${reviewCount}`);
  } catch (error) {
    console.error('Error updating shop rating:', error);
  }
}