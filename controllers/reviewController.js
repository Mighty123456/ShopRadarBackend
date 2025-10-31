const Review = require('../models/reviewModel');
const User = require('../models/userModel');
const Shop = require('../models/shopModel');
const { logActivity } = require('./activityController');

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
      reportReasons: review.reportReasons
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
    
    res.json({
      success: true,
      data: {
        totalReviews,
        activeReviews,
        flaggedReviews,
        removedReviews,
        newReviews,
        avgRating: Math.round(avgRating * 10) / 10,
        ratingDistribution
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

    // Create new review
    const review = new Review({
      userId,
      shopId,
      rating,
      comment: comment.trim()
    });

    await review.save();

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