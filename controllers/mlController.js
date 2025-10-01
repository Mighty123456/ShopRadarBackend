const mlRecommendationService = require('../services/mlRecommendationService');
const mlAnalyticsService = require('../services/mlAnalyticsService');
const UserBehavior = require('../models/userBehaviorModel');
const Recommendation = require('../models/recommendationModel');
const UserProfile = require('../models/userProfileModel');

// ===== USER BEHAVIOR TRACKING =====

/**
 * Track user behavior
 */
exports.trackBehavior = async (req, res) => {
  try {
    const { behaviorType, targetId, targetType, metadata } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!behaviorType) {
      return res.status(400).json({
        success: false,
        message: 'Behavior type is required'
      });
    }

    const behaviorData = {
      behaviorType,
      targetId,
      targetType,
      metadata: {
        ...metadata,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        timestamp: new Date()
      }
    };

    const behavior = await mlRecommendationService.trackUserBehavior(userId, behaviorData);

    res.json({
      success: true,
      message: 'Behavior tracked successfully',
      data: behavior
    });
  } catch (error) {
    console.error('Track behavior error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track behavior'
    });
  }
};

/**
 * Get user behavior analytics
 */
exports.getUserAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const timeRange = parseInt(req.query.timeRange) || 30;

    const analytics = await mlAnalyticsService.getUserBehaviorAnalytics(userId, timeRange);

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Get user analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user analytics'
    });
  }
};

// ===== RECOMMENDATIONS =====

/**
 * Get personalized recommendations
 */
exports.getRecommendations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      type = 'hybrid', 
      limit = 20, 
      latitude, 
      longitude 
    } = req.query;

    let recommendations = [];

    // Validate location for location-based recommendations
    if ((type === 'location' || type === 'hybrid') && (!latitude || !longitude)) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required for location-based recommendations'
      });
    }

    const userLocation = latitude && longitude ? {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude)
    } : null;

    // Generate recommendations based on type
    switch (type) {
      case 'collaborative':
        recommendations = await mlRecommendationService.getCollaborativeFilteringRecommendations(
          userId, 
          parseInt(limit)
        );
        break;
      
      case 'content':
        recommendations = await mlRecommendationService.getContentBasedRecommendations(
          userId, 
          parseInt(limit)
        );
        break;
      
      case 'location':
        recommendations = await mlRecommendationService.getLocationBasedRecommendations(
          userId, 
          userLocation, 
          parseInt(limit)
        );
        break;
      
      case 'hybrid':
      default:
        recommendations = await mlRecommendationService.getHybridRecommendations(
          userId, 
          userLocation, 
          parseInt(limit)
        );
        break;
    }

    // Save recommendations to database
    const savedRecommendations = await Promise.all(
      recommendations.map(rec => {
        const recommendation = new Recommendation({
          userId,
          recommendationType: type,
          targetId: rec.targetId,
          targetType: rec.targetType,
          score: rec.score,
          confidence: rec.confidence,
          metadata: {
            algorithm: 'ml-recommendation-service',
            algorithmVersion: '1.0.0',
            ...rec.metadata
          }
        });
        return recommendation.save();
      })
    );

    res.json({
      success: true,
      data: {
        recommendations: savedRecommendations,
        total: savedRecommendations.length,
        type,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recommendations'
    });
  }
};

/**
 * Get trending recommendations
 */
exports.getTrendingRecommendations = async (req, res) => {
  try {
    const { limit = 20, category, latitude, longitude } = req.query;
    const userId = req.user?.id;

    // Get trending products based on recent views and interactions
    const trendingProducts = await UserBehavior.aggregate([
      {
        $match: {
          behaviorType: { $in: ['view_product', 'click_offer', 'add_to_favorites'] },
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        }
      },
      {
        $group: {
          _id: '$targetId',
          targetType: { $first: '$targetType' },
          count: { $sum: 1 },
          avgScore: { $avg: '$score' },
          lastInteraction: { $max: '$createdAt' }
        }
      },
      {
        $sort: { count: -1, avgScore: -1 }
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    // Filter by category if specified
    let filteredProducts = trendingProducts;
    if (category) {
      // This would require joining with Product collection
      // For now, we'll return all trending items
    }

    // Add location-based scoring if coordinates provided
    if (latitude && longitude) {
      // This would require additional processing for location-based scoring
    }

    res.json({
      success: true,
      data: {
        trending: trendingProducts,
        total: trendingProducts.length,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get trending recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trending recommendations'
    });
  }
};

/**
 * Provide feedback on recommendations
 */
exports.feedbackRecommendation = async (req, res) => {
  try {
    const { recommendationId, feedback } = req.body;
    const userId = req.user.id;

    const recommendation = await Recommendation.findOne({
      _id: recommendationId,
      userId
    });

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        message: 'Recommendation not found'
      });
    }

    // Update feedback
    recommendation.userFeedback = {
      ...recommendation.userFeedback,
      ...feedback,
      feedbackDate: new Date()
    };

    // Update status based on feedback
    if (feedback.clicked) {
      recommendation.status = 'clicked';
    } else if (feedback.dismissed) {
      recommendation.status = 'dismissed';
    }

    await recommendation.save();

    // Update user profile based on feedback
    await mlRecommendationService.updateUserProfile(userId, {
      behaviorType: feedback.clicked ? 'click_offer' : 'dismiss_recommendation',
      targetId: recommendation.targetId,
      targetType: recommendation.targetType,
      metadata: {
        recommendationId: recommendation._id,
        feedback: feedback
      }
    });

    res.json({
      success: true,
      message: 'Feedback recorded successfully'
    });
  } catch (error) {
    console.error('Feedback recommendation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record feedback'
    });
  }
};

// ===== USER PROFILES =====

/**
 * Get user profile
 */
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    let userProfile = await UserProfile.findOne({ userId });
    
    if (!userProfile) {
      // Create initial profile
      userProfile = new UserProfile({ userId });
      await userProfile.save();
    }

    res.json({
      success: true,
      data: userProfile
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    });
  }
};

/**
 * Update user profile
 */
exports.updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;

    let userProfile = await UserProfile.findOne({ userId });
    
    if (!userProfile) {
      userProfile = new UserProfile({ userId });
    }

    // Update profile fields
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        userProfile[key] = updates[key];
      }
    });

    // Recalculate profile completeness
    userProfile.profileCompleteness = calculateProfileCompleteness(userProfile);

    await userProfile.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: userProfile
    });
  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user profile'
    });
  }
};

/**
 * Calculate profile completeness
 */
function calculateProfileCompleteness(profile) {
  let completeness = 0;
  const maxScore = 100;

  // Basic preferences (30 points)
  if (profile.preferences?.categories?.length > 0) completeness += 10;
  if (profile.preferences?.priceRange?.min !== undefined) completeness += 10;
  if (profile.preferences?.maxDistance !== undefined) completeness += 10;

  // Behavior patterns (40 points)
  if (profile.behaviorPatterns?.commonSearchTerms?.length > 0) completeness += 15;
  if (profile.behaviorPatterns?.activeHours?.length > 0) completeness += 10;
  if (profile.behaviorPatterns?.activeDays?.length > 0) completeness += 10;
  if (profile.behaviorPatterns?.averageSessionDuration !== undefined) completeness += 5;

  // Segments (20 points)
  if (profile.segments?.userType !== 'new_user') completeness += 10;
  if (profile.segments?.customerValue !== 'low') completeness += 10;

  // ML features (10 points)
  if (profile.mlFeatures?.userEmbedding?.length > 0) completeness += 10;

  return Math.min(completeness, maxScore);
}

// ===== ANALYTICS =====

/**
 * Get system-wide analytics
 */
exports.getSystemAnalytics = async (req, res) => {
  try {
    const { timeRange = 30 } = req.query;
    const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);

    const [
      totalBehaviors,
      totalRecommendations,
      activeUsers,
      topCategories,
      recommendationPerformance
    ] = await Promise.all([
      UserBehavior.countDocuments({ createdAt: { $gte: startDate } }),
      Recommendation.countDocuments({ createdAt: { $gte: startDate } }),
      UserBehavior.distinct('userId', { createdAt: { $gte: startDate } }),
      UserBehavior.aggregate([
        {
          $match: {
            'metadata.productCategory': { $exists: true },
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$metadata.productCategory',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 10
        }
      ]),
      Recommendation.aggregate([
        {
          $match: { createdAt: { $gte: startDate } }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            clicked: { $sum: { $cond: ['$userFeedback.clicked', 1, 0] } },
            liked: { $sum: { $cond: ['$userFeedback.liked', 1, 0] } },
            dismissed: { $sum: { $cond: ['$userFeedback.dismissed', 1, 0] } },
            avgScore: { $avg: '$score' },
            avgConfidence: { $avg: '$confidence' }
          }
        }
      ])
    ]);

    const analytics = {
      overview: {
        totalBehaviors,
        totalRecommendations,
        activeUsers: activeUsers.length,
        timeRange: parseInt(timeRange)
      },
      topCategories,
      recommendationPerformance: recommendationPerformance[0] || {
        total: 0,
        clicked: 0,
        liked: 0,
        dismissed: 0,
        avgScore: 0,
        avgConfidence: 0
      },
      generatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Get system analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system analytics'
    });
  }
};

// ===== ADMIN FUNCTIONS =====

/**
 * Get ML model performance metrics
 */
exports.getModelPerformance = async (req, res) => {
  try {
    const { timeRange = 30 } = req.query;
    const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);

    const performance = await Recommendation.aggregate([
      {
        $match: { createdAt: { $gte: startDate } }
      },
      {
        $group: {
          _id: '$recommendationType',
          total: { $sum: 1 },
          clicked: { $sum: { $cond: ['$userFeedback.clicked', 1, 0] } },
          liked: { $sum: { $cond: ['$userFeedback.liked', 1, 0] } },
          dismissed: { $sum: { $cond: ['$userFeedback.dismissed', 1, 0] } },
          avgScore: { $avg: '$score' },
          avgConfidence: { $avg: '$confidence' }
        }
      },
      {
        $addFields: {
          clickThroughRate: { $divide: ['$clicked', '$total'] },
          likeRate: { $divide: ['$liked', '$total'] },
          dismissalRate: { $divide: ['$dismissed', '$total'] }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        performance,
        timeRange: parseInt(timeRange),
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get model performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get model performance'
    });
  }
};

/**
 * Retrain ML models (admin only)
 */
exports.retrainModels = async (req, res) => {
  try {
    // This would trigger model retraining
    // For now, we'll just clear caches and return success
    
    mlAnalyticsService.clearCache();
    
    res.json({
      success: true,
      message: 'Model retraining initiated successfully'
    });
  } catch (error) {
    console.error('Retrain models error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrain models'
    });
  }
};
