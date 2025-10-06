const Shop = require('../models/shopModel');
const Offer = require('../models/offerModel');
const Product = require('../models/productModel');
const UserBehavior = require('../models/userBehaviorModel');
const UserProfile = require('../models/userProfileModel');
const User = require('../models/userModel');
const { Matrix } = require('ml-matrix');
const { kmeans } = require('ml-kmeans');
const natural = require('natural');
const Sentiment = require('sentiment');

class RankingService {
  constructor() {
    this.sentiment = new Sentiment();
    this.tfidf = new natural.TfIdf();
    this.clusteringModels = new Map(); // Store clustering models
    this.rankingModels = new Map(); // Store ranking models
    this.featureWeights = {
      // Base feature weights
      rating: 0.25,
      distance: 0.20,
      price: 0.15,
      popularity: 0.15,
      recency: 0.10,
      category: 0.10,
      status: 0.05
    };
    this.modelUpdateInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.lastModelUpdate = new Date(0);
  }

  // ===== MAIN RANKING METHODS =====

  /**
   * Rank shops with advanced clustering-based re-ranking
   */
  async rankShops(userId, userLocation, filters = {}, limit = 20) {
    try {
      // Get initial candidate shops
      const candidates = await this.getCandidateShops(userLocation, filters);
      
      if (candidates.length === 0) {
        return [];
      }

      // Extract features for ranking
      const features = await this.extractShopFeatures(candidates, userId, userLocation);
      
      // Apply rule-based ranking first
      const ruleBasedScores = this.calculateRuleBasedScores(features);
      
      // Apply clustering-based re-ranking
      const clusteringScores = await this.applyClusteringReranking(features, userId);
      
      // Apply learn-to-rank model
      const ltrScores = await this.applyLearnToRank(features, userId);
      
      // Combine all scores with weights
      const finalScores = this.combineRankingScores(
        ruleBasedScores, 
        clusteringScores, 
        ltrScores, 
        features
      );

      // Sort and return ranked results
      const rankedShops = candidates
        .map((shop, index) => ({
          ...shop.toObject(),
          rankingScore: finalScores[index],
          features: features[index],
          ruleBasedScore: ruleBasedScores[index],
          clusteringScore: clusteringScores[index],
          ltrScore: ltrScores[index]
        }))
        .sort((a, b) => b.rankingScore - a.rankingScore)
        .slice(0, limit);

      // Track ranking performance
      await this.trackRankingPerformance(userId, rankedShops, 'shop');

      return rankedShops;
    } catch (error) {
      console.error('Error ranking shops:', error);
      throw error;
    }
  }

  /**
   * Rank offers with advanced clustering-based re-ranking
   */
  async rankOffers(userId, userLocation, filters = {}, limit = 20) {
    try {
      // Get initial candidate offers
      const candidates = await this.getCandidateOffers(userLocation, filters);
      
      if (candidates.length === 0) {
        return [];
      }

      // Extract features for ranking
      const features = await this.extractOfferFeatures(candidates, userId, userLocation);
      
      // Apply rule-based ranking first
      const ruleBasedScores = this.calculateRuleBasedScores(features);
      
      // Apply clustering-based re-ranking
      const clusteringScores = await this.applyClusteringReranking(features, userId);
      
      // Apply learn-to-rank model
      const ltrScores = await this.applyLearnToRank(features, userId);
      
      // Combine all scores with weights
      const finalScores = this.combineRankingScores(
        ruleBasedScores, 
        clusteringScores, 
        ltrScores, 
        features
      );

      // Sort and return ranked results
      const rankedOffers = candidates
        .map((offer, index) => ({
          ...offer.toObject(),
          rankingScore: finalScores[index],
          features: features[index],
          ruleBasedScore: ruleBasedScores[index],
          clusteringScore: clusteringScores[index],
          ltrScore: ltrScores[index]
        }))
        .sort((a, b) => b.rankingScore - a.rankingScore)
        .slice(0, limit);

      // Track ranking performance
      await this.trackRankingPerformance(userId, rankedOffers, 'offer');

      return rankedOffers;
    } catch (error) {
      console.error('Error ranking offers:', error);
      throw error;
    }
  }

  /**
   * Simple rule-aligned ranking to mirror frontend visitPriorityScore
   * Factors: distance, rating, offers, open status (isLive), review count
   */
  async rankShopsSimple(userId, userLocation, filters = {}, limit = 20) {
    try {
      const candidates = await this.getCandidateShops(userLocation, filters);
      if (candidates.length === 0) return [];

      const scores = await Promise.all(candidates.map(async (shop) => {
        const distanceKm = userLocation && shop.location?.coordinates
          ? this.calculateDistance(userLocation, shop.location.coordinates)
          : 0;

        // Distance factor
        let score = 0;
        if (distanceKm > 0) {
          if (distanceKm < 1.0) score += 40.0;
          else if (distanceKm < 5.0) score += 30.0;
          else if (distanceKm < 10.0) score += 20.0;
          else if (distanceKm < 20.0) score += 10.0;
          else score += 5.0;
        } else {
          score += 15.0;
        }

        // Rating factor (max 25)
        const rating = Number(shop.rating || 0);
        score += (Math.max(0, Math.min(rating, 5)) / 5.0) * 25.0;

        // Offers factor: +15 baseline if any active offer, plus up to +10 for best percent
        let bestDiscount = 0;
        try {
          const now = new Date();
          const offers = await Offer.find({
            shopId: shop._id,
            status: 'active',
            startDate: { $lte: now },
            endDate: { $gte: now }
          }).select('discountType discountValue');
          if (offers && offers.length > 0) {
            score += 15.0;
            for (const off of offers) {
              if (String(off.discountType).toLowerCase() === 'percentage') {
                bestDiscount = Math.max(bestDiscount, Number(off.discountValue || 0));
              }
            }
            score += (Math.max(0, Math.min(bestDiscount, 100)) / 100.0) * 10.0;
          }
        } catch (_) { /* ignore offer failures */ }

        // Open/Live status factor
        if (shop.isLive === true) {
          score += 10.0;
        }

        // Review count factor (max 5)
        const reviewCount = Number(shop.reviewCount || 0);
        score += Math.max(0, Math.min(reviewCount / 100.0, 5.0));

        // Provide reason tags similar to frontend
        const reasons = [];
        if (distanceKm > 0 && distanceKm < 1.0) reasons.push('Very close');
        else if (distanceKm > 0 && distanceKm < 5.0) reasons.push('Close by');
        if (rating >= 4.0) reasons.push('Highly rated');
        else if (rating >= 3.0) reasons.push('Good rating');
        if (bestDiscount > 0) reasons.push('Has offers');
        if (shop.isLive === true) reasons.push('Open now');
        if (reviewCount > 10) reasons.push('Popular');

        return { shop, score, reasons: reasons.length ? reasons.join(' • ') : 'Available' };
      }));

      return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ shop, score, reasons }) => ({
          ...shop.toObject(),
          rankingScore: score,
          rankingReason: reasons,
          algorithm: 'visit_priority_score'
        }));
    } catch (error) {
      console.error('Error in rankShopsSimple:', error);
      return [];
    }
  }

  // ===== CANDIDATE GENERATION =====

  /**
   * Get candidate shops based on location and filters
   */
  async getCandidateShops(userLocation, filters) {
    const query = {
      verificationStatus: 'approved',
      isActive: true,
      isLive: true
    };

    // Add category filter if specified
    if (filters.category) {
      query.category = filters.category;
    }

    // Add rating filter if specified
    if (filters.minRating) {
      query.rating = { $gte: filters.minRating };
    }

    const shops = await Shop.find(query)
      .populate('ownerId', 'name email')
      .limit(100); // Get more candidates for better ranking

    // Filter by distance if location provided
    if (userLocation && filters.maxDistance) {
      return shops.filter(shop => {
        if (!shop.location || !shop.location.coordinates) return false;
        const distance = this.calculateDistance(
          userLocation,
          shop.location.coordinates
        );
        return distance <= filters.maxDistance;
      });
    }

    return shops;
  }

  /**
   * Get candidate offers based on location and filters
   */
  async getCandidateOffers(userLocation, filters) {
    const query = {
      status: 'active',
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    };

    // Add category filter if specified
    if (filters.category) {
      query.category = filters.category;
    }

    // Add discount filter if specified
    if (filters.minDiscount) {
      query.discountValue = { $gte: filters.minDiscount };
    }

    const offers = await Offer.find(query)
      .populate('shopId', 'shopName rating location verificationStatus isActive isLive')
      .populate('productId', 'name category price')
      .limit(100); // Get more candidates for better ranking

    // Filter by shop location and status
    const validOffers = offers.filter(offer => {
      const shop = offer.shopId;
      if (!shop || shop.verificationStatus !== 'approved' || !shop.isActive || !shop.isLive) {
        return false;
      }

      if (userLocation && filters.maxDistance && shop.location && shop.location.coordinates) {
        const distance = this.calculateDistance(
          userLocation,
          shop.location.coordinates
        );
        return distance <= filters.maxDistance;
      }

      return true;
    });

    return validOffers;
  }

  // ===== FEATURE EXTRACTION =====

  /**
   * Extract comprehensive features for shop ranking
   */
  async extractShopFeatures(shops, userId, userLocation) {
    const features = [];

    for (const shop of shops) {
      const feature = {
        // Basic shop features
        rating: shop.rating || 0,
        reviewCount: shop.reviewCount || 0,
        isLive: shop.isLive ? 1 : 0,
        isActive: shop.isActive ? 1 : 0,
        
        // Location features
        distance: userLocation ? this.calculateDistance(
          userLocation,
          shop.location?.coordinates || [0, 0]
        ) : 0,
        
        // Temporal features
        ageInDays: Math.floor((Date.now() - shop.createdAt) / (1000 * 60 * 60 * 24)),
        lastUpdated: Math.floor((Date.now() - shop.updatedAt) / (1000 * 60 * 60 * 24)),
        
        // Popularity features
        popularityScore: await this.calculateShopPopularity(shop._id),
        
        // User-specific features
        userInteractionScore: await this.calculateUserInteractionScore(userId, shop._id, 'shop'),
        
        // Category features
        categoryScore: await this.calculateCategoryScore(userId, shop.category || 'Other'),
        
        // Price features
        avgPriceScore: await this.calculateAveragePriceScore(shop._id, userId),
        
        // Quality features
        verificationScore: shop.verificationStatus === 'approved' ? 1 : 0,
        locationVerified: shop.isLocationVerified ? 1 : 0,
        
        // Behavioral features
        clickThroughRate: await this.calculateClickThroughRate(shop._id, 'shop'),
        conversionRate: await this.calculateConversionRate(shop._id, 'shop')
      };

      features.push(feature);
    }

    return features;
  }

  /**
   * Extract comprehensive features for offer ranking
   */
  async extractOfferFeatures(offers, userId, userLocation) {
    const features = [];

    for (const offer of offers) {
      const shop = offer.shopId;
      const product = offer.productId;
      
      const feature = {
        // Basic offer features
        discountValue: offer.discountValue || 0,
        discountType: offer.discountType === 'Percentage' ? 1 : 0,
        daysRemaining: Math.max(0, Math.floor((offer.endDate - Date.now()) / (1000 * 60 * 60 * 24))),
        usageRate: offer.maxUses > 0 ? offer.currentUses / offer.maxUses : 0,
        
        // Shop features
        shopRating: shop?.rating || 0,
        shopReviewCount: shop?.reviewCount || 0,
        shopIsLive: shop?.isLive ? 1 : 0,
        
        // Location features
        distance: userLocation && shop?.location?.coordinates ? 
          this.calculateDistance(userLocation, shop.location.coordinates) : 0,
        
        // Product features
        productPrice: product?.price || 0,
        productCategory: await this.encodeCategory(product?.category || 'Other'),
        
        // Offer-specific features
        offerAge: Math.floor((Date.now() - offer.createdAt) / (1000 * 60 * 60 * 24)),
        
        // Popularity features
        offerPopularity: await this.calculateOfferPopularity(offer._id),
        
        // User-specific features
        userInteractionScore: await this.calculateUserInteractionScore(userId, offer._id, 'offer'),
        categoryScore: await this.calculateCategoryScore(userId, offer.category),
        
        // Behavioral features
        clickThroughRate: await this.calculateClickThroughRate(offer._id, 'offer'),
        conversionRate: await this.calculateConversionRate(offer._id, 'offer'),
        
        // Quality features
        shopVerificationScore: shop?.verificationStatus === 'approved' ? 1 : 0,
        shopLocationVerified: shop?.isLocationVerified ? 1 : 0
      };

      features.push(feature);
    }

    return features;
  }

  // ===== RULE-BASED RANKING =====

  /**
   * Calculate rule-based scores using traditional ranking factors
   */
  calculateRuleBasedScores(features) {
    return features.map(feature => {
      let score = 0;
      
      // Rating component (0-1)
      score += (feature.rating / 5) * this.featureWeights.rating;
      
      // Distance component (0-1, closer is better)
      const maxDistance = 50; // km
      const distanceScore = Math.max(0, 1 - (feature.distance / maxDistance));
      score += distanceScore * this.featureWeights.distance;
      
      // Price component (0-1, based on user preferences)
      if (feature.productPrice) {
        const priceScore = this.calculatePriceScore(feature.productPrice, { min: 0, max: 1000 });
        score += priceScore * this.featureWeights.price;
      }
      
      // Popularity component (0-1)
      if (feature.popularityScore !== undefined) {
        score += Math.min(feature.popularityScore, 1) * this.featureWeights.popularity;
      }
      
      // Recency component (0-1, newer is better)
      const maxAge = 365; // days
      const recencyScore = Math.max(0, 1 - (feature.ageInDays || feature.offerAge || 0) / maxAge);
      score += recencyScore * this.featureWeights.recency;
      
      // Category component (0-1)
      if (feature.categoryScore !== undefined) {
        score += feature.categoryScore * this.featureWeights.category;
      }
      
      // Status component (0-1)
      const statusScore = (feature.isLive || feature.shopIsLive || 0) * 0.5 + 
                         (feature.isActive || feature.shopVerificationScore || 0) * 0.5;
      score += statusScore * this.featureWeights.status;
      
      return Math.min(score, 1); // Normalize to 0-1
    });
  }

  // ===== CLUSTERING-BASED RE-RANKING =====

  /**
   * Apply clustering-based re-ranking to improve results
   */
  async applyClusteringReranking(features, userId) {
    try {
      // Check if we need to update clustering models
      await this.updateClusteringModelsIfNeeded();

      // Get user cluster
      const userCluster = await this.getUserCluster(userId);
      
      // Get clustering model for this user cluster
      const clusteringModel = this.clusteringModels.get(`cluster_${userCluster}`);
      
      if (!clusteringModel) {
        // Fallback to rule-based scores if no clustering model
        return this.calculateRuleBasedScores(features);
      }

      // Convert features to matrix format
      const featureMatrix = this.featuresToMatrix(features);
      
      // Apply clustering-based scoring
      const clusterScores = this.applyClusteringScoring(featureMatrix, clusteringModel, userCluster);
      
      return clusterScores;
    } catch (error) {
      console.error('Error in clustering-based re-ranking:', error);
      // Fallback to rule-based scores
      return this.calculateRuleBasedScores(features);
    }
  }

  /**
   * Train clustering models for different user segments
   */
  async trainClusteringModels() {
    try {
      console.log('Training clustering models...');
      
      // Get user behavior data for clustering
      const userBehaviors = await UserBehavior.find({
        createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
      }).limit(10000);

      if (userBehaviors.length < 100) {
        console.log('Insufficient data for clustering training');
        return;
      }

      // Extract user features for clustering
      const userFeatures = await this.extractUserFeaturesForClustering(userBehaviors);
      
      // Perform k-means clustering
      const k = 5; // Number of clusters
      const { centroids, clusters } = kmeans(userFeatures, k, {
        initialization: 'kmeans++',
        maxIterations: 100
      });

      // Store clustering models
      for (let i = 0; i < k; i++) {
        const clusterFeatures = userFeatures.filter((_, index) => clusters[index] === i);
        const clusterModel = {
          centroid: centroids[i],
          features: clusterFeatures,
          size: clusterFeatures.length,
          trainedAt: new Date()
        };
        
        this.clusteringModels.set(`cluster_${i}`, clusterModel);
      }

      console.log(`Trained ${k} clustering models`);
    } catch (error) {
      console.error('Error training clustering models:', error);
    }
  }

  /**
   * Get user cluster assignment
   */
  async getUserCluster(userId) {
    try {
      const userProfile = await UserProfile.findOne({ userId });
      if (!userProfile || !userProfile.mlFeatures?.userEmbedding) {
        return 0; // Default cluster
      }

      // Find closest cluster centroid
      let bestCluster = 0;
      let minDistance = Infinity;

      for (const [clusterKey, model] of this.clusteringModels) {
        const clusterId = parseInt(clusterKey.split('_')[1]);
        const distance = this.calculateEuclideanDistance(
          userProfile.mlFeatures.userEmbedding,
          model.centroid
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          bestCluster = clusterId;
        }
      }

      return bestCluster;
    } catch (error) {
      console.error('Error getting user cluster:', error);
      return 0; // Default cluster
    }
  }

  /**
   * Apply clustering-based scoring
   */
  applyClusteringScoring(featureMatrix, clusteringModel, userCluster) {
    const scores = [];
    
    for (let i = 0; i < featureMatrix.rows; i++) {
      const featureVector = featureMatrix.getRow(i);
      
      // Calculate similarity to cluster centroid
      const similarity = this.calculateCosineSimilarity(featureVector, clusteringModel.centroid);
      
      // Calculate distance-based score
      const distance = this.calculateEuclideanDistance(featureVector, clusteringModel.centroid);
      const distanceScore = Math.exp(-distance / 10); // Exponential decay
      
      // Combine similarity and distance scores
      const clusterScore = (similarity * 0.6) + (distanceScore * 0.4);
      
      scores.push(Math.max(0, Math.min(clusterScore, 1)));
    }
    
    return scores;
  }

  // ===== LEARN-TO-RANK PIPELINE =====

  /**
   * Apply learn-to-rank model for advanced ranking
   */
  async applyLearnToRank(features, userId) {
    try {
      // Check if we need to update ranking models
      await this.updateRankingModelsIfNeeded();

      // Get user-specific ranking model
      const userCluster = await this.getUserCluster(userId);
      const rankingModel = this.rankingModels.get(`ranking_${userCluster}`);
      
      if (!rankingModel) {
        // Fallback to rule-based scores if no ranking model
        return this.calculateRuleBasedScores(features);
      }

      // Apply learned ranking model
      const ltrScores = this.applyLearnedRanking(features, rankingModel);
      
      return ltrScores;
    } catch (error) {
      console.error('Error in learn-to-rank:', error);
      // Fallback to rule-based scores
      return this.calculateRuleBasedScores(features);
    }
  }

  /**
   * Train learn-to-rank models using gradient boosting approach
   */
  async trainRankingModels() {
    try {
      console.log('Training learn-to-rank models...');
      
      // Get training data from user interactions
      const trainingData = await this.prepareRankingTrainingData();
      
      if (trainingData.length < 100) {
        console.log('Insufficient training data for learn-to-rank');
        return;
      }

      // Train models for each user cluster
      for (const [clusterKey, clusteringModel] of this.clusteringModels) {
        const clusterId = parseInt(clusterKey.split('_')[1]);
        
        // Filter training data for this cluster
        const clusterTrainingData = trainingData.filter(data => 
          data.userCluster === clusterId
        );

        if (clusterTrainingData.length < 50) {
          continue; // Skip if insufficient data
        }

        // Train gradient boosting model for this cluster
        const rankingModel = await this.trainGradientBoostingModel(clusterTrainingData);
        
        this.rankingModels.set(`ranking_${clusterId}`, rankingModel);
      }

      console.log(`Trained ${this.rankingModels.size} ranking models`);
    } catch (error) {
      console.error('Error training ranking models:', error);
    }
  }

  /**
   * Prepare training data for learn-to-rank
   */
  async prepareRankingTrainingData() {
    const trainingData = [];
    
    // Get user interactions with relevance scores
    const interactions = await UserBehavior.find({
      behaviorType: { $in: ['view_product', 'view_shop', 'click_offer', 'add_to_favorites', 'purchase_product'] },
      createdAt: { $gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) }
    }).limit(5000);

    for (const interaction of interactions) {
      // Get user cluster
      const userCluster = await this.getUserCluster(interaction.userId);
      
      // Extract features for the interacted item
      let features;
      if (interaction.targetType === 'shop') {
        const shop = await Shop.findById(interaction.targetId);
        if (shop) {
          features = await this.extractShopFeatures([shop], interaction.userId, null);
        }
      } else if (interaction.targetType === 'offer') {
        const offer = await Offer.findById(interaction.targetId).populate('shopId productId');
        if (offer) {
          features = await this.extractOfferFeatures([offer], interaction.userId, null);
        }
      }

      if (features && features.length > 0) {
        // Calculate relevance score based on interaction type
        const relevanceScore = this.calculateRelevanceScore(interaction.behaviorType);
        
        trainingData.push({
          features: features[0],
          relevanceScore,
          userCluster,
          userId: interaction.userId,
          targetId: interaction.targetId,
          targetType: interaction.targetType
        });
      }
    }

    return trainingData;
  }

  /**
   * Train gradient boosting model for ranking
   */
  async trainGradientBoostingModel(trainingData) {
    // Simplified gradient boosting implementation
    // In production, you might want to use a more sophisticated library
    
    const model = {
      trees: [],
      learningRate: 0.1,
      maxDepth: 6,
      trainedAt: new Date()
    };

    // Extract features and labels
    const features = trainingData.map(d => this.flattenFeatures(d.features));
    const labels = trainingData.map(d => d.relevanceScore);

    // Train multiple decision trees (simplified)
    for (let i = 0; i < 10; i++) {
      const tree = this.trainDecisionTree(features, labels);
      model.trees.push(tree);
      
      // Update residuals for next iteration
      for (let j = 0; j < labels.length; j++) {
        const prediction = this.predictWithTree(features[j], tree);
        labels[j] -= model.learningRate * prediction;
      }
    }

    return model;
  }

  /**
   * Apply learned ranking model
   */
  applyLearnedRanking(features, rankingModel) {
    const scores = [];
    
    for (const feature of features) {
      const flattenedFeatures = this.flattenFeatures(feature);
      let score = 0;
      
      // Apply all trees in the ensemble
      for (const tree of rankingModel.trees) {
        score += this.predictWithTree(flattenedFeatures, tree);
      }
      
      scores.push(Math.max(0, Math.min(score, 1)));
    }
    
    return scores;
  }

  // ===== SCORE COMBINATION =====

  /**
   * Combine different ranking scores with adaptive weights
   */
  combineRankingScores(ruleBasedScores, clusteringScores, ltrScores, features) {
    const finalScores = [];
    
    for (let i = 0; i < ruleBasedScores.length; i++) {
      // Adaptive weights based on data quality
      const dataQuality = this.assessDataQuality(features[i]);
      
      let weights;
      if (dataQuality > 0.8) {
        // High quality data - trust ML models more
        weights = { ruleBased: 0.2, clustering: 0.3, ltr: 0.5 };
      } else if (dataQuality > 0.5) {
        // Medium quality data - balanced approach
        weights = { ruleBased: 0.3, clustering: 0.35, ltr: 0.35 };
      } else {
        // Low quality data - trust rule-based more
        weights = { ruleBased: 0.5, clustering: 0.25, ltr: 0.25 };
      }
      
      const finalScore = 
        (ruleBasedScores[i] * weights.ruleBased) +
        (clusteringScores[i] * weights.clustering) +
        (ltrScores[i] * weights.ltr);
      
      finalScores.push(Math.max(0, Math.min(finalScore, 1)));
    }
    
    return finalScores;
  }

  // ===== CONTINUOUS MODEL UPDATES =====

  /**
   * Update clustering models if needed
   */
  async updateClusteringModelsIfNeeded() {
    const now = new Date();
    if (now - this.lastModelUpdate > this.modelUpdateInterval) {
      await this.trainClusteringModels();
      this.lastModelUpdate = now;
    }
  }

  /**
   * Update ranking models if needed
   */
  async updateRankingModelsIfNeeded() {
    const now = new Date();
    if (now - this.lastModelUpdate > this.modelUpdateInterval) {
      await this.trainRankingModels();
      this.lastModelUpdate = now;
    }
  }

  /**
   * Trigger immediate model retraining
   */
  async retrainModels() {
    console.log('Starting immediate model retraining...');
    await Promise.all([
      this.trainClusteringModels(),
      this.trainRankingModels()
    ]);
    this.lastModelUpdate = new Date();
    console.log('Model retraining completed');
  }

  // ===== UTILITY METHODS =====

  /**
   * Calculate shop popularity score
   */
  async calculateShopPopularity(shopId) {
    const behaviors = await UserBehavior.find({
      targetId: shopId,
      targetType: 'shop',
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });

    const totalInteractions = behaviors.length;
    const uniqueUsers = new Set(behaviors.map(b => b.userId.toString())).size;
    
    return Math.min(totalInteractions / 100, 1); // Normalize to 0-1
  }

  /**
   * Calculate offer popularity score
   */
  async calculateOfferPopularity(offerId) {
    const behaviors = await UserBehavior.find({
      targetId: offerId,
      targetType: 'offer',
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });

    const totalInteractions = behaviors.length;
    return Math.min(totalInteractions / 50, 1); // Normalize to 0-1
  }

  /**
   * Calculate user interaction score
   */
  async calculateUserInteractionScore(userId, targetId, targetType) {
    const behaviors = await UserBehavior.find({
      userId,
      targetId,
      targetType
    });

    let score = 0;
    behaviors.forEach(behavior => {
      switch (behavior.behaviorType) {
        case 'view_product':
        case 'view_shop':
          score += 1;
          break;
        case 'click_offer':
          score += 2;
          break;
        case 'add_to_favorites':
          score += 3;
          break;
        case 'purchase_product':
          score += 5;
          break;
      }
    });

    return Math.min(score / 10, 1); // Normalize to 0-1
  }

  /**
   * Calculate category score based on user preferences
   */
  async calculateCategoryScore(userId, category) {
    const userProfile = await UserProfile.findOne({ userId });
    if (!userProfile) return 0.5;

    const categoryPref = userProfile.preferences.categories.find(
      c => c.category === category
    );
    
    return categoryPref ? Math.min(categoryPref.weight / 10, 1) : 0.5;
  }

  /**
   * Calculate average price score for shop
   */
  async calculateAveragePriceScore(shopId, userId) {
    const products = await Product.find({ shopId, status: 'active' });
    if (products.length === 0) return 0.5;

    const avgPrice = products.reduce((sum, p) => sum + p.price, 0) / products.length;
    const userProfile = await UserProfile.findOne({ userId });
    
    if (!userProfile) return 0.5;
    
    return this.calculatePriceScore(avgPrice, userProfile.preferences.priceRange);
  }

  /**
   * Calculate click-through rate
   */
  async calculateClickThroughRate(targetId, targetType) {
    const views = await UserBehavior.countDocuments({
      targetId,
      targetType,
      behaviorType: targetType === 'shop' ? 'view_shop' : 'view_product'
    });

    const clicks = await UserBehavior.countDocuments({
      targetId,
      targetType,
      behaviorType: 'click_offer'
    });

    return views > 0 ? clicks / views : 0;
  }

  /**
   * Calculate conversion rate
   */
  async calculateConversionRate(targetId, targetType) {
    const interactions = await UserBehavior.countDocuments({
      targetId,
      targetType,
      behaviorType: { $in: ['view_product', 'view_shop', 'click_offer'] }
    });

    const conversions = await UserBehavior.countDocuments({
      targetId,
      targetType,
      behaviorType: 'purchase_product'
    });

    return interactions > 0 ? conversions / interactions : 0;
  }

  /**
   * Calculate price score based on user preferences
   */
  calculatePriceScore(price, priceRange) {
    if (price < priceRange.min || price > priceRange.max) return 0;
    
    const range = priceRange.max - priceRange.min;
    if (range === 0) return 1;
    
    const normalizedPrice = (price - priceRange.min) / range;
    return 1 - Math.abs(normalizedPrice - 0.5) * 2;
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

  /**
   * Convert degrees to radians
   */
  toRadians(degrees) {
    return degrees * (Math.PI/180);
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
   * Calculate Euclidean distance between two vectors
   */
  calculateEuclideanDistance(vecA, vecB) {
    if (vecA.length !== vecB.length) return Infinity;
    
    let sum = 0;
    for (let i = 0; i < vecA.length; i++) {
      sum += Math.pow(vecA[i] - vecB[i], 2);
    }
    
    return Math.sqrt(sum);
  }

  /**
   * Convert features to matrix format
   */
  featuresToMatrix(features) {
    const rows = features.length;
    const cols = Object.keys(features[0]).length;
    const matrix = new Matrix(rows, cols);
    
    features.forEach((feature, rowIndex) => {
      const values = Object.values(feature);
      values.forEach((value, colIndex) => {
        matrix.set(rowIndex, colIndex, value || 0);
      });
    });
    
    return matrix;
  }

  /**
   * Extract user features for clustering
   */
  async extractUserFeaturesForClustering(userBehaviors) {
    const userFeatures = new Map();
    
    userBehaviors.forEach(behavior => {
      const userId = behavior.userId.toString();
      if (!userFeatures.has(userId)) {
        userFeatures.set(userId, {
          userId,
          totalBehaviors: 0,
          behaviorTypes: {},
          categories: {},
          avgScore: 0,
          totalScore: 0
        });
      }
      
      const features = userFeatures.get(userId);
      features.totalBehaviors++;
      features.totalScore += behavior.score;
      features.avgScore = features.totalScore / features.totalBehaviors;
      
      features.behaviorTypes[behavior.behaviorType] = 
        (features.behaviorTypes[behavior.behaviorType] || 0) + 1;
      
      if (behavior.metadata?.productCategory) {
        features.categories[behavior.metadata.productCategory] = 
          (features.categories[behavior.metadata.productCategory] || 0) + 1;
      }
    });
    
    // Convert to array and normalize
    return Array.from(userFeatures.values()).map(features => {
      const vector = [
        features.totalBehaviors / 100, // Normalize
        features.avgScore / 10, // Normalize
        Object.keys(features.behaviorTypes).length / 10, // Normalize
        Object.keys(features.categories).length / 10 // Normalize
      ];
      
      return vector;
    });
  }

  /**
   * Calculate relevance score based on interaction type
   */
  calculateRelevanceScore(behaviorType) {
    switch (behaviorType) {
      case 'view_product':
      case 'view_shop':
        return 0.2;
      case 'click_offer':
        return 0.5;
      case 'add_to_favorites':
        return 0.8;
      case 'purchase_product':
        return 1.0;
      default:
        return 0.1;
    }
  }

  /**
   * Flatten features object to array
   */
  flattenFeatures(features) {
    return Object.values(features).map(value => 
      typeof value === 'number' ? value : 0
    );
  }

  /**
   * Train a simple decision tree (simplified implementation)
   */
  trainDecisionTree(features, labels) {
    // Simplified decision tree implementation
    // In production, use a proper decision tree library
    
    const tree = {
      feature: 0,
      threshold: 0.5,
      left: null,
      right: null,
      prediction: 0
    };
    
    // Find best split
    let bestGini = Infinity;
    for (let featureIndex = 0; featureIndex < features[0].length; featureIndex++) {
      const values = features.map(f => f[featureIndex]).sort((a, b) => a - b);
      
      for (let i = 1; i < values.length; i++) {
        const threshold = (values[i-1] + values[i]) / 2;
        const gini = this.calculateGini(features, labels, featureIndex, threshold);
        
        if (gini < bestGini) {
          bestGini = gini;
          tree.feature = featureIndex;
          tree.threshold = threshold;
        }
      }
    }
    
    // Calculate prediction for this node
    tree.prediction = labels.reduce((sum, label) => sum + label, 0) / labels.length;
    
    return tree;
  }

  /**
   * Calculate Gini impurity
   */
  calculateGini(features, labels, featureIndex, threshold) {
    const left = [];
    const right = [];
    
    features.forEach((feature, index) => {
      if (feature[featureIndex] <= threshold) {
        left.push(labels[index]);
      } else {
        right.push(labels[index]);
      }
    });
    
    const leftGini = this.giniImpurity(left);
    const rightGini = this.giniImpurity(right);
    
    return (left.length / labels.length) * leftGini + 
           (right.length / labels.length) * rightGini;
  }

  /**
   * Calculate Gini impurity for a set of labels
   */
  giniImpurity(labels) {
    if (labels.length === 0) return 0;
    
    const counts = {};
    labels.forEach(label => {
      counts[label] = (counts[label] || 0) + 1;
    });
    
    let gini = 1;
    Object.values(counts).forEach(count => {
      gini -= Math.pow(count / labels.length, 2);
    });
    
    return gini;
  }

  /**
   * Predict with decision tree
   */
  predictWithTree(features, tree) {
    if (tree.left === null && tree.right === null) {
      return tree.prediction;
    }
    
    if (features[tree.feature] <= tree.threshold) {
      return tree.left ? this.predictWithTree(features, tree.left) : tree.prediction;
    } else {
      return tree.right ? this.predictWithTree(features, tree.right) : tree.prediction;
    }
  }

  /**
   * Assess data quality for adaptive weighting
   */
  assessDataQuality(features) {
    let qualityScore = 0;
    let totalChecks = 0;
    
    // Check for missing values
    const values = Object.values(features);
    const missingCount = values.filter(v => v === null || v === undefined || v === 0).length;
    qualityScore += 1 - (missingCount / values.length);
    totalChecks++;
    
    // Check for reasonable ranges
    if (features.rating >= 0 && features.rating <= 5) qualityScore += 1;
    if (features.distance >= 0 && features.distance <= 100) qualityScore += 1;
    if (features.popularityScore >= 0 && features.popularityScore <= 1) qualityScore += 1;
    totalChecks += 3;
    
    return qualityScore / totalChecks;
  }

  /**
   * Encode category as numerical value
   */
  async encodeCategory(category) {
    const categories = [
      'Food & Dining', 'Electronics & Gadgets', 'Fashion & Clothing',
      'Health & Beauty', 'Home & Garden', 'Sports & Fitness',
      'Books & Education', 'Automotive', 'Entertainment', 'Services', 'Other'
    ];
    
    return categories.indexOf(category) / categories.length;
  }

  /**
   * Track ranking performance for evaluation
   */
  async trackRankingPerformance(userId, rankedItems, itemType) {
    try {
      // Store ranking results for evaluation
      const rankingData = {
        userId,
        itemType,
        rankedItems: rankedItems.map((item, index) => ({
          itemId: item._id,
          rank: index + 1,
          score: item.rankingScore,
          ruleBasedScore: item.ruleBasedScore,
          clusteringScore: item.clusteringScore,
          ltrScore: item.ltrScore
        })),
        timestamp: new Date()
      };
      
      // In production, you might want to store this in a separate collection
      console.log(`Ranking performance tracked for user ${userId}:`, {
        itemType,
        itemCount: rankedItems.length,
        avgScore: rankedItems.reduce((sum, item) => sum + item.rankingScore, 0) / rankedItems.length
      });
    } catch (error) {
      console.error('Error tracking ranking performance:', error);
    }
  }

  // ===== EVALUATION METRICS =====

  /**
   * Calculate ranking evaluation metrics
   */
  async calculateRankingMetrics(userId, itemType, timeRange = 7) {
    try {
      const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
      
      // Get user interactions in the time range
      const interactions = await UserBehavior.find({
        userId,
        targetType: itemType,
        createdAt: { $gte: startDate }
      });

      if (interactions.length === 0) {
        return { ndcg: 0, precision: 0, recall: 0, f1: 0 };
      }

      // Calculate NDCG (Normalized Discounted Cumulative Gain)
      const ndcg = await this.calculateNDCG(interactions, itemType);
      
      // Calculate Precision@K
      const precision = await this.calculatePrecision(interactions, itemType);
      
      // Calculate Recall@K
      const recall = await this.calculateRecall(interactions, itemType);
      
      // Calculate F1 Score
      const f1 = (2 * precision * recall) / (precision + recall) || 0;

      return {
        ndcg: Math.round(ndcg * 100) / 100,
        precision: Math.round(precision * 100) / 100,
        recall: Math.round(recall * 100) / 100,
        f1: Math.round(f1 * 100) / 100,
        totalInteractions: interactions.length
      };
    } catch (error) {
      console.error('Error calculating ranking metrics:', error);
      return { ndcg: 0, precision: 0, recall: 0, f1: 0 };
    }
  }

  /**
   * Calculate NDCG for ranking evaluation
   */
  async calculateNDCG(interactions, itemType) {
    // Simplified NDCG calculation
    // In production, you'd want a more sophisticated implementation
    
    const relevanceScores = interactions.map(interaction => 
      this.calculateRelevanceScore(interaction.behaviorType)
    );
    
    // Calculate DCG
    let dcg = 0;
    relevanceScores.forEach((score, index) => {
      dcg += score / Math.log2(index + 2);
    });
    
    // Calculate IDCG (ideal DCG)
    const sortedScores = relevanceScores.sort((a, b) => b - a);
    let idcg = 0;
    sortedScores.forEach((score, index) => {
      idcg += score / Math.log2(index + 2);
    });
    
    return idcg > 0 ? dcg / idcg : 0;
  }

  /**
   * Calculate Precision@K
   */
  async calculatePrecision(interactions, itemType) {
    const relevantInteractions = interactions.filter(interaction => 
      ['click_offer', 'add_to_favorites', 'purchase_product'].includes(interaction.behaviorType)
    );
    
    return relevantInteractions.length / interactions.length;
  }

  /**
   * Calculate Recall@K
   */
  async calculateRecall(interactions, itemType) {
    // This would need to be compared against all possible relevant items
    // Simplified implementation
    const relevantInteractions = interactions.filter(interaction => 
      ['click_offer', 'add_to_favorites', 'purchase_product'].includes(interaction.behaviorType)
    );
    
    // Assume we're looking at top 20 results
    const k = 20;
    return Math.min(relevantInteractions.length / k, 1);
  }
}

module.exports = new RankingService();
