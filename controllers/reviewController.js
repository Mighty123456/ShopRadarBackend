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
