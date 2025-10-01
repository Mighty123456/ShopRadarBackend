const UserBehavior = require('../models/userBehaviorModel');
const UserProfile = require('../models/userProfileModel');
const Recommendation = require('../models/recommendationModel');
const Product = require('../models/productModel');
const Shop = require('../models/shopModel');
const Offer = require('../models/offerModel');

class MLAnalyticsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // ===== USER BEHAVIOR ANALYTICS =====

  /**
   * Get comprehensive user behavior analytics
   */
  async getUserBehaviorAnalytics(userId, timeRange = 30) {
    try {
      const cacheKey = `user_behavior_${userId}_${timeRange}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
      
      const [
        behaviors,
        userProfile,
        recommendations
      ] = await Promise.all([
        UserBehavior.find({
          userId,
          createdAt: { $gte: startDate }
        }).sort({ createdAt: -1 }),
        UserProfile.findOne({ userId }),
        Recommendation.find({
          userId,
          createdAt: { $gte: startDate }
        })
      ]);

      const analytics = {
        // Basic metrics
        totalBehaviors: behaviors.length,
        totalRecommendations: recommendations.length,
        profileCompleteness: userProfile?.profileCompleteness || 0,
        
        // Behavior patterns
        behaviorPatterns: this.analyzeBehaviorPatterns(behaviors),
        
        // Engagement metrics
        engagement: this.calculateEngagementMetrics(behaviors, recommendations),
        
        // Preference analysis
        preferences: this.analyzeUserPreferences(behaviors, userProfile),
        
        // Recommendation performance
        recommendationPerformance: this.analyzeRecommendationPerformance(recommendations),
        
        // Time-based insights
        timeInsights: this.analyzeTimePatterns(behaviors),
        
        // Category insights
        categoryInsights: this.analyzeCategoryPreferences(behaviors),
        
        // Location insights
        locationInsights: this.analyzeLocationPatterns(behaviors),
        
        // Search insights
        searchInsights: this.analyzeSearchPatterns(behaviors),
        
        // Predictive insights
        predictiveInsights: await this.generatePredictiveInsights(userId, behaviors, userProfile)
      };

      this.setCache(cacheKey, analytics);
      return analytics;
    } catch (error) {
      console.error('Error getting user behavior analytics:', error);
      throw error;
    }
  }

  /**
   * Analyze behavior patterns
   */
  analyzeBehaviorPatterns(behaviors) {
    const patterns = {
      behaviorTypes: {},
      frequency: {
        daily: 0,
        weekly: 0,
        monthly: 0
      },
      trends: {
        increasing: false,
        decreasing: false,
        stable: false
      }
    };

    // Count behavior types
    behaviors.forEach(behavior => {
      patterns.behaviorTypes[behavior.behaviorType] = 
        (patterns.behaviorTypes[behavior.behaviorType] || 0) + 1;
    });

    // Calculate frequency
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    patterns.frequency.daily = behaviors.filter(b => b.createdAt >= oneDayAgo).length;
    patterns.frequency.weekly = behaviors.filter(b => b.createdAt >= oneWeekAgo).length;
    patterns.frequency.monthly = behaviors.filter(b => b.createdAt >= oneMonthAgo).length;

    // Analyze trends
    const halfPoint = Math.floor(behaviors.length / 2);
    const firstHalf = behaviors.slice(0, halfPoint).length;
    const secondHalf = behaviors.slice(halfPoint).length;

    if (secondHalf > firstHalf * 1.2) {
      patterns.trends.increasing = true;
    } else if (secondHalf < firstHalf * 0.8) {
      patterns.trends.decreasing = true;
    } else {
      patterns.trends.stable = true;
    }

    return patterns;
  }

  /**
   * Calculate engagement metrics
   */
  calculateEngagementMetrics(behaviors, recommendations) {
    const totalBehaviors = behaviors.length;
    const totalRecommendations = recommendations.length;
    
    const clickedRecommendations = recommendations.filter(r => r.userFeedback?.clicked).length;
    const likedRecommendations = recommendations.filter(r => r.userFeedback?.liked).length;
    const dismissedRecommendations = recommendations.filter(r => r.userFeedback?.dismissed).length;

    return {
      totalBehaviors,
      totalRecommendations,
      clickThroughRate: totalRecommendations > 0 ? clickedRecommendations / totalRecommendations : 0,
      likeRate: totalRecommendations > 0 ? likedRecommendations / totalRecommendations : 0,
      dismissalRate: totalRecommendations > 0 ? dismissedRecommendations / totalRecommendations : 0,
      engagementScore: this.calculateEngagementScore(behaviors, recommendations)
    };
  }

  /**
   * Calculate overall engagement score
   */
  calculateEngagementScore(behaviors, recommendations) {
    let score = 0;
    
    // Base score from behavior frequency
    score += Math.min(behaviors.length * 0.1, 5);
    
    // Bonus for diverse behavior types
    const uniqueBehaviorTypes = new Set(behaviors.map(b => b.behaviorType)).size;
    score += uniqueBehaviorTypes * 0.5;
    
    // Bonus for recommendation interaction
    const interactedRecommendations = recommendations.filter(r => 
      r.userFeedback?.clicked || r.userFeedback?.liked
    ).length;
    score += interactedRecommendations * 0.3;
    
    // Penalty for dismissals
    const dismissedRecommendations = recommendations.filter(r => 
      r.userFeedback?.dismissed
    ).length;
    score -= dismissedRecommendations * 0.2;
    
    return Math.max(0, Math.min(score, 10));
  }

  /**
   * Analyze user preferences
   */
  analyzeUserPreferences(behaviors, userProfile) {
    const preferences = {
      categories: {},
      priceRange: { min: Infinity, max: 0 },
      timePreferences: {
        hours: new Array(24).fill(0),
        days: new Array(7).fill(0)
      },
      locationPreferences: []
    };

    // Analyze from behaviors
    behaviors.forEach(behavior => {
      if (behavior.metadata?.productCategory) {
        preferences.categories[behavior.metadata.productCategory] = 
          (preferences.categories[behavior.metadata.productCategory] || 0) + 1;
      }

      if (behavior.metadata?.productPrice) {
        preferences.priceRange.min = Math.min(preferences.priceRange.min, behavior.metadata.productPrice);
        preferences.priceRange.max = Math.max(preferences.priceRange.max, behavior.metadata.productPrice);
      }

      if (behavior.metadata?.timeOfDay !== undefined) {
        preferences.timePreferences.hours[behavior.metadata.timeOfDay]++;
      }

      if (behavior.metadata?.dayOfWeek !== undefined) {
        preferences.timePreferences.days[behavior.metadata.dayOfWeek]++;
      }

      if (behavior.metadata?.location) {
        preferences.locationPreferences.push(behavior.metadata.location);
      }
    });

    // Merge with user profile preferences
    if (userProfile) {
      userProfile.preferences.categories.forEach(cat => {
        preferences.categories[cat.category] = 
          (preferences.categories[cat.category] || 0) + cat.weight;
      });

      if (userProfile.preferences.priceRange.min < preferences.priceRange.min) {
        preferences.priceRange.min = userProfile.preferences.priceRange.min;
      }
      if (userProfile.preferences.priceRange.max > preferences.priceRange.max) {
        preferences.priceRange.max = userProfile.preferences.priceRange.max;
      }
    }

    // Normalize price range
    if (preferences.priceRange.min === Infinity) {
      preferences.priceRange.min = 0;
    }

    return preferences;
  }

  /**
   * Analyze recommendation performance
   */
  analyzeRecommendationPerformance(recommendations) {
    const total = recommendations.length;
    if (total === 0) {
      return {
        totalRecommendations: 0,
        clickThroughRate: 0,
        likeRate: 0,
        dismissalRate: 0,
        averageScore: 0,
        averageConfidence: 0
      };
    }

    const clicked = recommendations.filter(r => r.userFeedback?.clicked).length;
    const liked = recommendations.filter(r => r.userFeedback?.liked).length;
    const dismissed = recommendations.filter(r => r.userFeedback?.dismissed).length;

    const averageScore = recommendations.reduce((sum, r) => sum + r.score, 0) / total;
    const averageConfidence = recommendations.reduce((sum, r) => sum + r.confidence, 0) / total;

    return {
      totalRecommendations: total,
      clickThroughRate: clicked / total,
      likeRate: liked / total,
      dismissalRate: dismissed / total,
      averageScore,
      averageConfidence
    };
  }

  /**
   * Analyze time patterns
   */
  analyzeTimePatterns(behaviors) {
    const timeInsights = {
      peakHours: [],
      peakDays: [],
      seasonalPatterns: {},
      sessionPatterns: {
        averageSessionDuration: 0,
        averageBehaviorsPerSession: 0
      }
    };

    // Analyze hourly patterns
    const hourCounts = new Array(24).fill(0);
    behaviors.forEach(behavior => {
      if (behavior.metadata?.timeOfDay !== undefined) {
        hourCounts[behavior.metadata.timeOfDay]++;
      }
    });

    const maxHourCount = Math.max(...hourCounts);
    timeInsights.peakHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter(item => item.count >= maxHourCount * 0.8)
      .map(item => item.hour);

    // Analyze daily patterns
    const dayCounts = new Array(7).fill(0);
    behaviors.forEach(behavior => {
      if (behavior.metadata?.dayOfWeek !== undefined) {
        dayCounts[behavior.metadata.dayOfWeek]++;
      }
    });

    const maxDayCount = Math.max(...dayCounts);
    timeInsights.peakDays = dayCounts
      .map((count, day) => ({ day, count }))
      .filter(item => item.count >= maxDayCount * 0.8)
      .map(item => item.day);

    // Analyze seasonal patterns
    behaviors.forEach(behavior => {
      if (behavior.metadata?.season) {
        timeInsights.seasonalPatterns[behavior.metadata.season] = 
          (timeInsights.seasonalPatterns[behavior.metadata.season] || 0) + 1;
      }
    });

    return timeInsights;
  }

  /**
   * Analyze category preferences
   */
  analyzeCategoryPreferences(behaviors) {
    const categoryInsights = {
      topCategories: [],
      categoryTrends: {},
      categoryDiversity: 0
    };

    const categoryCounts = {};
    behaviors.forEach(behavior => {
      if (behavior.metadata?.productCategory) {
        categoryCounts[behavior.metadata.productCategory] = 
          (categoryCounts[behavior.metadata.productCategory] || 0) + 1;
      }
    });

    // Get top categories
    categoryInsights.topCategories = Object.entries(categoryCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    // Calculate diversity (Shannon entropy)
    const total = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);
    if (total > 0) {
      categoryInsights.categoryDiversity = Object.values(categoryCounts)
        .reduce((entropy, count) => {
          const p = count / total;
          return entropy - (p * Math.log2(p));
        }, 0);
    }

    return categoryInsights;
  }

  /**
   * Analyze location patterns
   */
  analyzeLocationPatterns(behaviors) {
    const locationInsights = {
      frequentLocations: [],
      averageDistance: 0,
      locationDiversity: 0
    };

    const locationCounts = {};
    let totalDistance = 0;
    let distanceCount = 0;

    behaviors.forEach(behavior => {
      if (behavior.metadata?.location) {
        const key = `${behavior.metadata.location.coordinates[0]},${behavior.metadata.location.coordinates[1]}`;
        locationCounts[key] = (locationCounts[key] || 0) + 1;
      }

      if (behavior.metadata?.shopDistance) {
        totalDistance += behavior.metadata.shopDistance;
        distanceCount++;
      }
    });

    // Get frequent locations
    locationInsights.frequentLocations = Object.entries(locationCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([location, count]) => ({ location, count }));

    // Calculate average distance
    if (distanceCount > 0) {
      locationInsights.averageDistance = totalDistance / distanceCount;
    }

    // Calculate location diversity
    locationInsights.locationDiversity = Object.keys(locationCounts).length;

    return locationInsights;
  }

  /**
   * Analyze search patterns
   */
  analyzeSearchPatterns(behaviors) {
    const searchInsights = {
      commonTerms: [],
      searchFrequency: 0,
      searchDiversity: 0,
      searchTrends: {}
    };

    const searchBehaviors = behaviors.filter(b => b.behaviorType === 'search_query');
    searchInsights.searchFrequency = searchBehaviors.length;

    const termCounts = {};
    const uniqueTerms = new Set();

    searchBehaviors.forEach(behavior => {
      if (behavior.metadata?.searchQuery) {
        const terms = behavior.metadata.searchQuery.toLowerCase().split(' ');
        terms.forEach(term => {
          if (term.length > 2) {
            termCounts[term] = (termCounts[term] || 0) + 1;
            uniqueTerms.add(term);
          }
        });
      }
    });

    // Get common terms
    searchInsights.commonTerms = Object.entries(termCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([term, count]) => ({ term, count }));

    // Calculate diversity
    searchInsights.searchDiversity = uniqueTerms.size;

    return searchInsights;
  }

  /**
   * Generate predictive insights
   */
  async generatePredictiveInsights(userId, behaviors, userProfile) {
    const insights = {
      predictedInterests: [],
      recommendedActions: [],
      riskFactors: [],
      opportunities: []
    };

    // Predict interests based on recent behavior
    const recentBehaviors = behaviors.slice(0, 10);
    const categoryCounts = {};
    recentBehaviors.forEach(behavior => {
      if (behavior.metadata?.productCategory) {
        categoryCounts[behavior.metadata.productCategory] = 
          (categoryCounts[behavior.metadata.productCategory] || 0) + 1;
      }
    });

    insights.predictedInterests = Object.entries(categoryCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([category, count]) => ({ category, confidence: count / recentBehaviors.length }));

    // Generate recommendations based on patterns
    if (behaviors.length < 5) {
      insights.recommendedActions.push({
        action: 'Complete your profile',
        reason: 'More data needed for better recommendations',
        priority: 'high'
      });
    }

    if (userProfile?.profileCompleteness < 50) {
      insights.recommendedActions.push({
        action: 'Add more preferences',
        reason: 'Profile completeness is low',
        priority: 'medium'
      });
    }

    // Identify risk factors
    const recentDismissals = behaviors.filter(b => 
      b.behaviorType === 'dismiss_recommendation'
    ).length;
    
    if (recentDismissals > behaviors.length * 0.5) {
      insights.riskFactors.push({
        factor: 'High dismissal rate',
        description: 'User is dismissing many recommendations',
        impact: 'medium'
      });
    }

    // Identify opportunities
    const searchBehaviors = behaviors.filter(b => b.behaviorType === 'search_query');
    if (searchBehaviors.length > 0) {
      insights.opportunities.push({
        opportunity: 'Search optimization',
        description: 'User searches frequently - optimize search results',
        potential: 'high'
      });
    }

    return insights;
  }

  // ===== CACHE MANAGEMENT =====

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = new MLAnalyticsService();
