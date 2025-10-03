const RankingService = require('../services/rankingService');
const UserBehavior = require('../models/userBehaviorModel');
const UserProfile = require('../models/userProfileModel');

class RankingController {
  
  /**
   * Rank shops with advanced ML-based ranking
   */
  async rankShops(req, res) {
    try {
      const { userId } = req.user;
      const { 
        latitude, 
        longitude, 
        category, 
        minRating, 
        maxDistance = 10,
        limit = 20 
      } = req.query;

      // Validate required parameters
      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Latitude and longitude are required'
        });
      }

      const userLocation = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude)
      };

      const filters = {
        category,
        minRating: minRating ? parseFloat(minRating) : undefined,
        maxDistance: parseFloat(maxDistance)
      };

      // Get ranked shops
      const rankedShops = await RankingService.rankShops(
        userId, 
        userLocation, 
        filters, 
        parseInt(limit)
      );

      // Track the ranking request
      await this.trackRankingRequest(userId, 'shop', filters, rankedShops.length);

      res.json({
        success: true,
        data: {
          shops: rankedShops,
          total: rankedShops.length,
          filters: filters,
          rankingInfo: {
            algorithm: 'hybrid_ml_ranking',
            features: ['rating', 'distance', 'popularity', 'user_preferences', 'clustering', 'learn_to_rank'],
            timestamp: new Date()
          }
        }
      });

    } catch (error) {
      console.error('Error in rankShops:', error);
      res.status(500).json({
        success: false,
        message: 'Error ranking shops',
        error: error.message
      });
    }
  }

  /**
   * Rank offers with advanced ML-based ranking
   */
  async rankOffers(req, res) {
    try {
      const { userId } = req.user;
      const { 
        latitude, 
        longitude, 
        category, 
        minDiscount, 
        maxDistance = 10,
        limit = 20 
      } = req.query;

      // Validate required parameters
      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Latitude and longitude are required'
        });
      }

      const userLocation = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude)
      };

      const filters = {
        category,
        minDiscount: minDiscount ? parseFloat(minDiscount) : undefined,
        maxDistance: parseFloat(maxDistance)
      };

      // Get ranked offers
      const rankedOffers = await RankingService.rankOffers(
        userId, 
        userLocation, 
        filters, 
        parseInt(limit)
      );

      // Track the ranking request
      await this.trackRankingRequest(userId, 'offer', filters, rankedOffers.length);

      res.json({
        success: true,
        data: {
          offers: rankedOffers,
          total: rankedOffers.length,
          filters: filters,
          rankingInfo: {
            algorithm: 'hybrid_ml_ranking',
            features: ['discount', 'distance', 'shop_rating', 'user_preferences', 'clustering', 'learn_to_rank'],
            timestamp: new Date()
          }
        }
      });

    } catch (error) {
      console.error('Error in rankOffers:', error);
      res.status(500).json({
        success: false,
        message: 'Error ranking offers',
        error: error.message
      });
    }
  }

  /**
   * Get ranking performance metrics for a user
   */
  async getRankingMetrics(req, res) {
    try {
      const { userId } = req.user;
      const { itemType = 'shop', timeRange = 7 } = req.query;

      const metrics = await RankingService.calculateRankingMetrics(
        userId, 
        itemType, 
        parseInt(timeRange)
      );

      res.json({
        success: true,
        data: {
          metrics,
          itemType,
          timeRange: parseInt(timeRange),
          timestamp: new Date()
        }
      });

    } catch (error) {
      console.error('Error getting ranking metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting ranking metrics',
        error: error.message
      });
    }
  }

  /**
   * Retrain ranking models (admin endpoint)
   */
  async retrainModels(req, res) {
    try {
      // Check if user is admin
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      // Start retraining in background
      RankingService.retrainModels()
        .then(() => {
          console.log('Model retraining completed successfully');
        })
        .catch((error) => {
          console.error('Model retraining failed:', error);
        });

      res.json({
        success: true,
        message: 'Model retraining started',
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error starting model retraining:', error);
      res.status(500).json({
        success: false,
        message: 'Error starting model retraining',
        error: error.message
      });
    }
  }

  /**
   * Get ranking model status (admin endpoint)
   */
  async getModelStatus(req, res) {
    try {
      // Check if user is admin
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const status = {
        clusteringModels: RankingService.clusteringModels.size,
        rankingModels: RankingService.rankingModels.size,
        lastUpdate: RankingService.lastModelUpdate,
        nextUpdate: new Date(RankingService.lastModelUpdate.getTime() + RankingService.modelUpdateInterval),
        modelUpdateInterval: RankingService.modelUpdateInterval
      };

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      console.error('Error getting model status:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting model status',
        error: error.message
      });
    }
  }

  /**
   * Track user interaction with ranked items
   */
  async trackInteraction(req, res) {
    try {
      const { userId } = req.user;
      const { 
        itemId, 
        itemType, 
        behaviorType, 
        rank, 
        score 
      } = req.body;

      // Validate required fields
      if (!itemId || !itemType || !behaviorType) {
        return res.status(400).json({
          success: false,
          message: 'itemId, itemType, and behaviorType are required'
        });
      }

      // Track the interaction
      const behavior = new UserBehavior({
        userId,
        targetId: itemId,
        targetType: itemType,
        behaviorType,
        metadata: {
          rank: rank || null,
          rankingScore: score || null,
          timestamp: new Date()
        }
      });

      await behavior.save();

      res.json({
        success: true,
        message: 'Interaction tracked successfully',
        data: {
          behaviorId: behavior._id,
          timestamp: behavior.createdAt
        }
      });

    } catch (error) {
      console.error('Error tracking interaction:', error);
      res.status(500).json({
        success: false,
        message: 'Error tracking interaction',
        error: error.message
      });
    }
  }

  /**
   * Get personalized ranking explanation
   */
  async getRankingExplanation(req, res) {
    try {
      const { userId } = req.user;
      const { itemId, itemType } = req.query;

      if (!itemId || !itemType) {
        return res.status(400).json({
          success: false,
          message: 'itemId and itemType are required'
        });
      }

      // Get user profile for explanation
      const userProfile = await UserProfile.findOne({ userId });
      
      // Get recent user behaviors for context
      const recentBehaviors = await UserBehavior.find({
        userId,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }).sort({ createdAt: -1 }).limit(10);

      const explanation = {
        userPreferences: userProfile ? {
          categories: userProfile.preferences.categories.slice(0, 5),
          priceRange: userProfile.preferences.priceRange,
          maxDistance: userProfile.preferences.maxDistance
        } : null,
        recentActivity: recentBehaviors.map(behavior => ({
          type: behavior.behaviorType,
          targetType: behavior.targetType,
          timestamp: behavior.createdAt
        })),
        rankingFactors: {
          personalization: 'Based on your preferences and behavior history',
          location: 'Distance from your current location',
          quality: 'Shop ratings and verification status',
          popularity: 'How popular this item is with other users',
          recency: 'How recently this item was added or updated'
        },
        algorithm: 'Hybrid ML Ranking with Clustering and Learn-to-Rank'
      };

      res.json({
        success: true,
        data: explanation
      });

    } catch (error) {
      console.error('Error getting ranking explanation:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting ranking explanation',
        error: error.message
      });
    }
  }

  /**
   * A/B test ranking algorithms
   */
  async getABTestRanking(req, res) {
    try {
      const { userId } = req.user;
      const { 
        latitude, 
        longitude, 
        itemType = 'shop',
        limit = 20 
      } = req.query;

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Latitude and longitude are required'
        });
      }

      const userLocation = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude)
      };

      // Determine A/B test variant
      const variant = this.getABVariant(userId);
      
      let rankedItems;
      if (variant === 'A') {
        // Control group - rule-based ranking
        rankedItems = await this.getRuleBasedRanking(userId, userLocation, itemType, parseInt(limit));
      } else {
        // Treatment group - ML-based ranking
        if (itemType === 'shop') {
          rankedItems = await RankingService.rankShops(userId, userLocation, {}, parseInt(limit));
        } else {
          rankedItems = await RankingService.rankOffers(userId, userLocation, {}, parseInt(limit));
        }
      }

      // Track A/B test participation
      await this.trackABTestParticipation(userId, variant, itemType);

      res.json({
        success: true,
        data: {
          items: rankedItems,
          total: rankedItems.length,
          abTest: {
            variant,
            algorithm: variant === 'A' ? 'rule_based' : 'ml_based',
            timestamp: new Date()
          }
        }
      });

    } catch (error) {
      console.error('Error in A/B test ranking:', error);
      res.status(500).json({
        success: false,
        message: 'Error in A/B test ranking',
        error: error.message
      });
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Track ranking request for analytics
   */
  async trackRankingRequest(userId, itemType, filters, resultCount) {
    try {
      const behavior = new UserBehavior({
        userId,
        behaviorType: 'ranking_request',
        targetType: itemType,
        metadata: {
          filters: JSON.stringify(filters),
          resultCount,
          timestamp: new Date()
        }
      });

      await behavior.save();
    } catch (error) {
      console.error('Error tracking ranking request:', error);
    }
  }

  /**
   * Get A/B test variant for user
   */
  getABVariant(userId) {
    // Consistent 50/50 bucket by hashing userId
    const str = String(userId || '');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return (Math.abs(hash) % 2) === 0 ? 'A' : 'B';
  }

  /**
   * Get rule-based ranking (control group)
   */
  async getRuleBasedRanking(userId, userLocation, itemType, limit) {
    try {
      // Simple rule-based ranking implementation
      if (itemType === 'shop') {
        const shops = await RankingService.getCandidateShops(userLocation, {});
        const features = await RankingService.extractShopFeatures(shops, userId, userLocation);
        const scores = RankingService.calculateRuleBasedScores(features);
        
        return shops
          .map((shop, index) => ({
            ...shop.toObject(),
            rankingScore: scores[index],
            algorithm: 'rule_based'
          }))
          .sort((a, b) => b.rankingScore - a.rankingScore)
          .slice(0, limit);
      } else {
        const offers = await RankingService.getCandidateOffers(userLocation, {});
        const features = await RankingService.extractOfferFeatures(offers, userId, userLocation);
        const scores = RankingService.calculateRuleBasedScores(features);
        
        return offers
          .map((offer, index) => ({
            ...offer.toObject(),
            rankingScore: scores[index],
            algorithm: 'rule_based'
          }))
          .sort((a, b) => b.rankingScore - a.rankingScore)
          .slice(0, limit);
      }
    } catch (error) {
      console.error('Error in rule-based ranking:', error);
      return [];
    }
  }

  /**
   * Track A/B test participation
   */
  async trackABTestParticipation(userId, variant, itemType) {
    try {
      const behavior = new UserBehavior({
        userId,
        behaviorType: 'ab_test_participation',
        targetType: itemType,
        metadata: {
          variant,
          testType: 'ranking_algorithm',
          timestamp: new Date()
        }
      });

      await behavior.save();
    } catch (error) {
      console.error('Error tracking A/B test participation:', error);
    }
  }
}

module.exports = new RankingController();
