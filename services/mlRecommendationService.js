const UserBehavior = require('../models/userBehaviorModel');
const UserProfile = require('../models/userProfileModel');
const Recommendation = require('../models/recommendationModel');
const Product = require('../models/productModel');
const Shop = require('../models/shopModel');
const Offer = require('../models/offerModel');
const RankingService = require('./rankingService');
const { Matrix } = require('ml-matrix');
const natural = require('natural');
const Sentiment = require('sentiment');

class MLRecommendationService {
  constructor() {
    this.sentiment = new Sentiment();
    this.tfidf = new natural.TfIdf();
  }

  // ===== USER BEHAVIOR ANALYSIS =====
  
  /**
   * Track user behavior for ML analysis
   */
  async trackUserBehavior(userId, behaviorData) {
    try {
      const behavior = new UserBehavior({
        userId,
        ...behaviorData
      });
      
      await behavior.save();
      
      // Update user profile with new behavior
      await this.updateUserProfile(userId, behaviorData);
      
      return behavior;
    } catch (error) {
      console.error('Error tracking user behavior:', error);
      throw error;
    }
  }

  /**
   * Analyze user behavior patterns
   */
  async analyzeUserBehavior(userId, timeRange = 30) {
    try {
      const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
      
      const behaviors = await UserBehavior.find({
        userId,
        createdAt: { $gte: startDate }
      }).sort({ createdAt: -1 });

      const analysis = {
        totalBehaviors: behaviors.length,
        behaviorTypes: {},
        categories: {},
        timePatterns: {
          hours: new Array(24).fill(0),
          days: new Array(7).fill(0)
        },
        searchPatterns: {
          commonTerms: {},
          averageSearchesPerDay: 0
        },
        preferences: {
          categories: {},
          priceRange: { min: Infinity, max: 0 },
          averageDistance: 0
        }
      };

      // Analyze behavior patterns
      behaviors.forEach(behavior => {
        // Count behavior types
        analysis.behaviorTypes[behavior.behaviorType] = 
          (analysis.behaviorTypes[behavior.behaviorType] || 0) + 1;

        // Analyze categories
        if (behavior.metadata.productCategory) {
          analysis.categories[behavior.metadata.productCategory] = 
            (analysis.categories[behavior.metadata.productCategory] || 0) + 1;
        }

        // Time patterns
        if (behavior.metadata.timeOfDay !== undefined) {
          analysis.timePatterns.hours[behavior.metadata.timeOfDay]++;
        }
        if (behavior.metadata.dayOfWeek !== undefined) {
          analysis.timePatterns.days[behavior.metadata.dayOfWeek]++;
        }

        // Search patterns
        if (behavior.behaviorType === 'search_query' && behavior.metadata.searchQuery) {
          const terms = behavior.metadata.searchQuery.toLowerCase().split(' ');
          terms.forEach(term => {
            if (term.length > 2) {
              analysis.searchPatterns.commonTerms[term] = 
                (analysis.searchPatterns.commonTerms[term] || 0) + 1;
            }
          });
        }

        // Price preferences
        if (behavior.metadata.productPrice) {
          analysis.preferences.priceRange.min = Math.min(
            analysis.preferences.priceRange.min, 
            behavior.metadata.productPrice
          );
          analysis.preferences.priceRange.max = Math.max(
            analysis.preferences.priceRange.max, 
            behavior.metadata.productPrice
          );
        }

        // Distance preferences
        if (behavior.metadata.shopDistance) {
          analysis.preferences.averageDistance += behavior.metadata.shopDistance;
        }
      });

      // Calculate averages
      if (behaviors.length > 0) {
        analysis.searchPatterns.averageSearchesPerDay = 
          behaviors.filter(b => b.behaviorType === 'search_query').length / timeRange;
        analysis.preferences.averageDistance /= 
          behaviors.filter(b => b.metadata.shopDistance).length || 1;
      }

      return analysis;
    } catch (error) {
      console.error('Error analyzing user behavior:', error);
      throw error;
    }
  }

  // ===== COLLABORATIVE FILTERING =====

  /**
   * Find similar users based on behavior patterns
   */
  async findSimilarUsers(userId, limit = 10) {
    try {
      const userProfile = await UserProfile.findOne({ userId });
      if (!userProfile || !userProfile.mlFeatures.userEmbedding) {
        return [];
      }

      const similarUsers = await UserProfile.find({
        userId: { $ne: userId },
        'mlFeatures.userEmbedding': { $exists: true }
      }).limit(100); // Get more users for comparison

      const similarities = similarUsers.map(profile => {
        const similarity = this.calculateCosineSimilarity(
          userProfile.mlFeatures.userEmbedding,
          profile.mlFeatures.userEmbedding
        );
        return {
          userId: profile.userId,
          similarity,
          profile
        };
      }).sort((a, b) => b.similarity - a.similarity);

      return similarities.slice(0, limit);
    } catch (error) {
      console.error('Error finding similar users:', error);
      throw error;
    }
  }

  /**
   * Generate collaborative filtering recommendations
   */
  async getCollaborativeFilteringRecommendations(userId, limit = 20) {
    try {
      const similarUsers = await this.findSimilarUsers(userId, 5);

      const similarUserIds = similarUsers.map(u => u.userId);
      
      // Get behaviors of similar users
      const similarUserBehaviors = await UserBehavior.find({
        userId: { $in: similarUserIds },
        behaviorType: { $in: ['view_product', 'click_offer', 'add_to_favorites'] },
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      });

      // Get user's existing interactions
      const userBehaviors = await UserBehavior.find({
        userId,
        behaviorType: { $in: ['view_product', 'click_offer', 'add_to_favorites'] }
      });

      const userInteractedItems = new Set(
        userBehaviors.map(b => b.targetId.toString())
      );

      // Calculate item scores based on similar users' preferences
      const itemScores = {};
      similarUserBehaviors.forEach(behavior => {
        if (!userInteractedItems.has(behavior.targetId.toString())) {
          const userSimilarity = similarUsers.find(u => 
            u.userId.toString() === behavior.userId.toString()
          )?.similarity || 0;

          const itemId = behavior.targetId.toString();
          if (!itemScores[itemId]) {
            itemScores[itemId] = {
              score: 0,
              count: 0,
              targetType: behavior.targetType
            };
          }
          
          itemScores[itemId].score += userSimilarity * behavior.score;
          itemScores[itemId].count++;
        }
      });

      // Normalize scores and create recommendations
      let recommendations = Object.entries(itemScores)
        .map(([itemId, data]) => ({
          targetId: itemId,
          targetType: data.targetType,
          score: data.score / data.count, // Average score
          confidence: Math.min(data.count / similarUsers.length, 1)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      // Cold collaborative fallback: global popularity if no similar users or empty
      if (similarUsers.length === 0 || recommendations.length === 0) {
        const popular = await this.getPopularFallbackRecommendations(limit);
        recommendations = popular.map(p => ({
          targetId: p.targetId,
          targetType: p.targetType,
          score: p.score,
          confidence: 0.5,
        }));
      }

      return recommendations;
    } catch (error) {
      console.error('Error generating collaborative filtering recommendations:', error);
      throw error;
    }
  }

  // ===== CONTENT-BASED FILTERING =====

  /**
   * Generate content-based recommendations
   */
  async getContentBasedRecommendations(userId, limit = 20) {
    try {
      const userProfile = await UserProfile.findOne({ userId });
      if (!userProfile) {
        return [];
      }

      // Get user's preferred categories
      const preferredCategories = userProfile.preferences.categories
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5)
        .map(c => c.category);

      // Get user's price range
      const priceRange = userProfile.preferences.priceRange;

      // Find products in preferred categories
      const products = await Product.find({
        category: { $in: preferredCategories },
        price: { $gte: priceRange.min, $lte: priceRange.max },
        status: 'active'
      }).populate('shopId', 'shopName rating isLive');

      // Calculate content similarity scores
      const recommendations = products.map(product => {
        const categoryWeight = userProfile.preferences.categories
          .find(c => c.category === product.category)?.weight || 1;
        
        const priceScore = this.calculatePriceScore(product.price, priceRange);
        const ratingScore = (product.shopId?.rating || 0) / 5;
        const shopLiveScore = product.shopId?.isLive ? 1 : 0;

        const score = (categoryWeight * 0.4) + (priceScore * 0.3) + 
                     (ratingScore * 0.2) + (shopLiveScore * 0.1);

        return {
          targetId: product._id,
          targetType: 'product',
          score: Math.min(score / 10, 1), // Normalize to 0-1
          confidence: 0.7 // Content-based confidence
        };
      }).sort((a, b) => b.score - a.score).slice(0, limit);

      return recommendations;
    } catch (error) {
      console.error('Error generating content-based recommendations:', error);
      throw error;
    }
  }

  // ===== LOCATION-BASED RECOMMENDATIONS =====

  /**
   * Generate location-based recommendations
   */
  async getLocationBasedRecommendations(userId, userLocation, limit = 20) {
    try {
      const userProfile = await UserProfile.findOne({ userId });
      const maxDistance = userProfile?.preferences.maxDistance || 10;

      // Find nearby shops
      const nearbyShops = await Shop.find({
        verificationStatus: 'approved',
        isActive: true,
        isLive: true,
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [userLocation.longitude, userLocation.latitude]
            },
            $maxDistance: maxDistance * 1000 // Convert km to meters
          }
        }
      });

      if (nearbyShops.length === 0) {
        return [];
      }

      const shopIds = nearbyShops.map(shop => shop._id);

      // Get products from nearby shops
      const products = await Product.find({
        shopId: { $in: shopIds },
        status: 'active'
      }).populate('shopId', 'shopName rating location');

      // Get offers from nearby shops
      const offers = await Offer.find({
        shopId: { $in: shopIds },
        status: 'active',
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() }
      }).populate('productId', 'name category price')
        .populate('shopId', 'shopName rating location');

      // Calculate location-based scores
      const recommendations = [];

      // Add products
      products.forEach(product => {
        const distance = this.calculateDistance(
          userLocation,
          product.shopId.location.coordinates
        );
        const distanceScore = Math.max(0, 1 - (distance / maxDistance));
        const ratingScore = (product.shopId.rating || 0) / 5;

        recommendations.push({
          targetId: product._id,
          targetType: 'product',
          score: (distanceScore * 0.6) + (ratingScore * 0.4),
          confidence: 0.8,
          metadata: {
            distance: distance,
            shopName: product.shopId.shopName
          }
        });
      });

      // Add offers
      offers.forEach(offer => {
        const distance = this.calculateDistance(
          userLocation,
          offer.shopId.location.coordinates
        );
        const distanceScore = Math.max(0, 1 - (distance / maxDistance));
        const discountScore = Math.min(offer.discountValue / 50, 1); // Normalize discount

        recommendations.push({
          targetId: offer._id,
          targetType: 'offer',
          score: (distanceScore * 0.4) + (discountScore * 0.6),
          confidence: 0.9,
          metadata: {
            distance: distance,
            shopName: offer.shopId.shopName,
            discount: offer.discountValue
          }
        });
      });

      return recommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      console.error('Error generating location-based recommendations:', error);
      throw error;
    }
  }

  // ===== RANKING-ENHANCED RECOMMENDATIONS =====

  /**
   * Generate ranking-enhanced shop recommendations
   */
  async getRankingEnhancedShopRecommendations(userId, userLocation, filters = {}, limit = 20) {
    try {
      // Use the advanced ranking service for shops
      const rankedShops = await RankingService.rankShops(userId, userLocation, filters, limit);
      
      // Convert to recommendation format
      const recommendations = rankedShops.map(shop => {
        const rawScore = Number(shop.rankingScore);
        const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(rawScore, 1)) : 0;
        return {
          targetId: shop._id,
          targetType: 'shop',
          score,
        confidence: 0.9, // High confidence for ranking-based recommendations
        sources: ['ranking_enhanced'],
        metadata: {
          shopName: shop.shopName,
          rating: shop.rating,
          distance: shop.features?.distance,
          rankingBreakdown: {
              ruleBased: Number.isFinite(shop.ruleBasedScore) ? shop.ruleBasedScore : 0,
              clustering: Number.isFinite(shop.clusteringScore) ? shop.clusteringScore : 0,
              learnToRank: Number.isFinite(shop.ltrScore) ? shop.ltrScore : 0
          }
        }
        };
      }).sort((a, b) => b.score - a.score);

      return recommendations;
    } catch (error) {
      console.error('Error generating ranking-enhanced shop recommendations:', error);
      // Fallback to hybrid recommendations
      return this.getHybridRecommendations(userId, userLocation, limit);
    }
  }

  /**
   * Generate ranking-enhanced offer recommendations
   */
  async getRankingEnhancedOfferRecommendations(userId, userLocation, filters = {}, limit = 20) {
    try {
      // Use the advanced ranking service for offers
      const rankedOffers = await RankingService.rankOffers(userId, userLocation, filters, limit);
      
      // Convert to recommendation format
      const recommendations = rankedOffers.map(offer => {
        const rawScore = Number(offer.rankingScore);
        const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(rawScore, 1)) : 0;
        return {
          targetId: offer._id,
          targetType: 'offer',
          score,
        confidence: 0.9, // High confidence for ranking-based recommendations
        sources: ['ranking_enhanced'],
        metadata: {
          title: offer.title,
          discountValue: offer.discountValue,
          shopName: offer.shopId?.shopName,
          distance: offer.features?.distance,
          rankingBreakdown: {
              ruleBased: Number.isFinite(offer.ruleBasedScore) ? offer.ruleBasedScore : 0,
              clustering: Number.isFinite(offer.clusteringScore) ? offer.clusteringScore : 0,
              learnToRank: Number.isFinite(offer.ltrScore) ? offer.ltrScore : 0
          }
        }
        };
      }).sort((a, b) => b.score - a.score);

      return recommendations;
    } catch (error) {
      console.error('Error generating ranking-enhanced offer recommendations:', error);
      // Fallback to hybrid recommendations
      return this.getHybridRecommendations(userId, userLocation, limit);
    }
  }

  /**
   * Generate comprehensive recommendations with ranking
   */
  async getComprehensiveRecommendations(userId, userLocation, filters = {}, limit = 20) {
    try {
      const [shopRecommendations, offerRecommendations] = await Promise.all([
        this.getRankingEnhancedShopRecommendations(userId, userLocation, filters, Math.ceil(limit * 0.6)),
        this.getRankingEnhancedOfferRecommendations(userId, userLocation, filters, Math.ceil(limit * 0.4))
      ]);

      // Combine and sort by score
      const allRecommendations = [...shopRecommendations, ...offerRecommendations]
        .map(r => ({
          ...r,
          score: Number.isFinite(Number(r.score)) ? Math.max(0, Math.min(Number(r.score), 1)) : 0
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return allRecommendations;
    } catch (error) {
      console.error('Error generating comprehensive recommendations:', error);
      // Fallback to hybrid recommendations
      return this.getHybridRecommendations(userId, userLocation, limit);
    }
  }

  // ===== HYBRID RECOMMENDATIONS =====

  /**
   * Generate hybrid recommendations combining all methods
   */
  async getHybridRecommendations(userId, userLocation, limit = 20) {
    try {
      const variant = this.getABVariant(userId); // 'A' or 'B'
      const [collaborative, contentBased, locationBased] = await Promise.all([
        this.getCollaborativeFilteringRecommendations(userId, limit),
        this.getContentBasedRecommendations(userId, limit),
        this.getLocationBasedRecommendations(userId, userLocation, limit)
      ]);

      // Combine recommendations with weights
      const combinedRecommendations = new Map();

      // A/B weight sets
      const weights = variant === 'B'
        ? { cf: 0.4, cb: 0.3, loc: 0.3 }
        : { cf: 0.3, cb: 0.4, loc: 0.3 };

      // Add collaborative filtering
      collaborative.forEach(rec => {
        const key = `${rec.targetType}_${rec.targetId}`;
        if (!combinedRecommendations.has(key)) {
          combinedRecommendations.set(key, {
            targetId: rec.targetId,
            targetType: rec.targetType,
            score: 0,
            confidence: 0,
            sources: []
          });
        }
        const combined = combinedRecommendations.get(key);
        combined.score += rec.score * weights.cf;
        combined.confidence += rec.confidence * weights.cf;
        combined.sources.push('collaborative');
      });

      // Add content-based
      contentBased.forEach(rec => {
        const key = `${rec.targetType}_${rec.targetId}`;
        if (!combinedRecommendations.has(key)) {
          combinedRecommendations.set(key, {
            targetId: rec.targetId,
            targetType: rec.targetType,
            score: 0,
            confidence: 0,
            sources: []
          });
        }
        const combined = combinedRecommendations.get(key);
        combined.score += rec.score * weights.cb;
        combined.confidence += rec.confidence * weights.cb;
        combined.sources.push('content');
      });

      // Add location-based
      locationBased.forEach(rec => {
        const key = `${rec.targetType}_${rec.targetId}`;
        if (!combinedRecommendations.has(key)) {
          combinedRecommendations.set(key, {
            targetId: rec.targetId,
            targetType: rec.targetType,
            score: 0,
            confidence: 0,
            sources: []
          });
        }
        const combined = combinedRecommendations.get(key);
        combined.score += rec.score * weights.loc;
        combined.confidence += rec.confidence * weights.loc;
        combined.sources.push('location');
        if (rec.metadata) {
          combined.metadata = rec.metadata;
        }
      });

      // Normalize confidence and sort
      let finalRecommendations = Array.from(combinedRecommendations.values())
        .map(rec => ({
          ...rec,
          confidence: Math.min(rec.confidence, 1)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      // Cold-start fallback if empty
      if (!finalRecommendations.length) {
        const fallback = await this.getPopularFallbackRecommendations(limit);
        finalRecommendations = fallback.map(f => ({
          targetId: f.targetId,
          targetType: f.targetType,
          score: f.score,
          confidence: 0.5,
          sources: ['fallback'],
          variant,
        }));
      } else {
        finalRecommendations = finalRecommendations.map(r => ({ ...r, variant }));
      }

      return finalRecommendations;
    } catch (error) {
      console.error('Error generating hybrid recommendations:', error);
      throw error;
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Update user profile based on behavior
   */
  async updateUserProfile(userId, behaviorData) {
    try {
      let userProfile = await UserProfile.findOne({ userId });
      
      if (!userProfile) {
        userProfile = new UserProfile({ userId });
      }

      // Update preferences based on behavior
      if (behaviorData.metadata?.productCategory) {
        const categoryPref = userProfile.preferences.categories.find(
          c => c.category === behaviorData.metadata.productCategory
        );
        if (categoryPref) {
          categoryPref.weight = Math.min(categoryPref.weight + 0.1, 10);
        } else {
          userProfile.preferences.categories.push({
            category: behaviorData.metadata.productCategory,
            weight: 1
          });
        }
      }

      // Update price preferences
      if (behaviorData.metadata?.productPrice) {
        const price = behaviorData.metadata.productPrice;
        userProfile.preferences.priceRange.min = Math.min(
          userProfile.preferences.priceRange.min, price
        );
        userProfile.preferences.priceRange.max = Math.max(
          userProfile.preferences.priceRange.max, price
        );
      }

      // Update last activity
      userProfile.lastActivity.lastLogin = new Date();
      if (behaviorData.behaviorType === 'search_query') {
        userProfile.lastActivity.lastSearch = new Date();
      }
      if (behaviorData.behaviorType === 'view_product') {
        userProfile.lastActivity.lastProductView = new Date();
      }

      await userProfile.save();
    } catch (error) {
      console.error('Error updating user profile:', error);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  calculateCosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate price score based on user preferences
   */
  calculatePriceScore(price, priceRange) {
    if (price < priceRange.min || price > priceRange.max) return 0;
    
    const range = priceRange.max - priceRange.min;
    if (range === 0) return 1;
    
    const normalizedPrice = (price - priceRange.min) / range;
    return 1 - Math.abs(normalizedPrice - 0.5) * 2; // Higher score for prices in middle of range
  }

  // ===== A/B and Cold-Start Helpers =====

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

  async getPopularFallbackRecommendations(limit = 20) {
    // Popularity based on recent behaviors across all users
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const behaviors = await UserBehavior.find({
      createdAt: { $gte: since },
      behaviorType: { $in: ['view_product', 'click_offer', 'add_to_favorites'] }
    }).select('targetId targetType behaviorType');

    const scores = {};
    behaviors.forEach(b => {
      const key = `${b.targetType}_${b.targetId}`;
      if (!scores[key]) scores[key] = { targetType: b.targetType, targetId: b.targetId.toString(), score: 0 };
      // Weight actions: favorite > click > view
      const w = b.behaviorType === 'add_to_favorites' ? 3 : (b.behaviorType === 'click_offer' ? 2 : 1);
      scores[key].score += w;
    });

    return Object.values(scores)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Calculate distance between two coordinates
   */
  calculateDistance(coord1, coord2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(coord2[1] - coord1.latitude);
    const dLon = this.toRadians(coord2[0] - coord1.longitude);
    const lat1 = this.toRadians(coord1.latitude);
    const lat2 = this.toRadians(coord2[1]);

    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI/180);
  }
}

module.exports = new MLRecommendationService();
