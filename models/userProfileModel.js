const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // User preferences
  preferences: {
    // Category preferences (weighted)
    categories: [{
      category: String,
      weight: { type: Number, default: 1, min: 0, max: 10 }
    }],
    
    // Price preferences
    priceRange: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 10000 }
    },
    
    // Distance preferences
    maxDistance: { type: Number, default: 10 }, // in km
    
    // Rating preferences
    minRating: { type: Number, default: 0, min: 0, max: 5 },
    
    // Time preferences
    preferredTimes: [{
      dayOfWeek: { type: Number, min: 0, max: 6 },
      startTime: { type: Number, min: 0, max: 23 },
      endTime: { type: Number, min: 0, max: 23 }
    }],
    
    // Location preferences
    preferredLocations: [{
      name: String,
      location: {
        type: { type: String, enum: ['Point'] },
        coordinates: [Number] // [longitude, latitude]
      },
      weight: { type: Number, default: 1 }
    }]
  },
  
  // User behavior patterns
  behaviorPatterns: {
    // Most active times
    activeHours: [Number], // 0-23
    
    // Most active days
    activeDays: [Number], // 0-6
    
    // Search patterns
    commonSearchTerms: [{
      term: String,
      frequency: Number,
      lastUsed: Date
    }],
    
    // Browsing patterns
    averageSessionDuration: Number, // in minutes
    averageSearchesPerSession: Number,
    averageProductsViewedPerSession: Number,
    
    // Interaction patterns
    clickThroughRate: Number,
    conversionRate: Number,
    bounceRate: Number
  },
  
  // User segments
  segments: {
    // Behavioral segments
    userType: {
      type: String,
      enum: ['browser', 'searcher', 'bargain_hunter', 'loyal_customer', 'new_user'],
      default: 'new_user'
    },
    
    // Value segments
    customerValue: {
      type: String,
      enum: ['low', 'medium', 'high', 'vip'],
      default: 'low'
    },
    
    // Engagement segments
    engagementLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low'
    },
    
    // Location segments
    locationType: {
      type: String,
      enum: ['urban', 'suburban', 'rural'],
      default: 'urban'
    }
  },
  
  // ML features
  mlFeatures: {
    // User embedding (for collaborative filtering)
    userEmbedding: [Number],
    
    // Feature vectors
    categoryVector: [Number],
    priceVector: [Number],
    locationVector: [Number],
    timeVector: [Number],
    
    // Similarity scores with other users
    similarUsers: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      similarity: Number,
      lastUpdated: Date
    }],
    
    // Clustering information
    clusterId: String,
    clusterConfidence: Number
  },
  
  // Recommendation history
  recommendationHistory: {
    totalRecommendations: { type: Number, default: 0 },
    clickedRecommendations: { type: Number, default: 0 },
    likedRecommendations: { type: Number, default: 0 },
    dismissedRecommendations: { type: Number, default: 0 },
    
    // Performance metrics
    clickThroughRate: { type: Number, default: 0 },
    likeRate: { type: Number, default: 0 },
    dismissalRate: { type: Number, default: 0 }
  },
  
  // Last activity
  lastActivity: {
    lastLogin: Date,
    lastSearch: Date,
    lastProductView: Date,
    lastRecommendationView: Date
  },
  
  // Profile completeness
  profileCompleteness: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient querying
// Note: `unique: true` on userId already creates an index; avoid duplicating it here
userProfileSchema.index({ 'segments.userType': 1 });
userProfileSchema.index({ 'segments.customerValue': 1 });
userProfileSchema.index({ 'preferences.preferredLocations.location': '2dsphere' });
userProfileSchema.index({ 'mlFeatures.clusterId': 1 });

// Update timestamps
userProfileSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for profile age in days
userProfileSchema.virtual('profileAgeInDays').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual for is active user
userProfileSchema.virtual('isActiveUser').get(function() {
  const daysSinceLastActivity = Math.floor((Date.now() - this.lastActivity.lastLogin) / (1000 * 60 * 60 * 24));
  return daysSinceLastActivity <= 30; // Active if logged in within 30 days
});

// Ensure virtual fields are serialized
userProfileSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('UserProfile', userProfileSchema);
