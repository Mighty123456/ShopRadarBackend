const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Recommendation type
  recommendationType: {
    type: String,
    enum: [
      'collaborative_filtering',
      'content_based',
      'location_based',
      'trending',
      'similar_users',
      'hybrid'
    ],
    required: true
  },
  
  // Target entity
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  
  targetType: {
    type: String,
    enum: ['product', 'shop', 'offer'],
    required: true
  },
  
  // Recommendation score (0-1)
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  
  // Recommendation confidence
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  
  // Recommendation metadata
  metadata: {
    // Algorithm parameters
    algorithm: String,
    algorithmVersion: String,
    
    // Similarity scores
    userSimilarity: Number,
    itemSimilarity: Number,
    locationSimilarity: Number,
    
    // Feature weights
    featureWeights: {
      userBehavior: Number,
      contentSimilarity: Number,
      locationProximity: Number,
      popularity: Number,
      recency: Number
    },
    
    // Context
    context: {
      userLocation: {
        type: { type: String, enum: ['Point'] },
        coordinates: [Number]
      },
      timeOfDay: Number,
      dayOfWeek: Number,
      season: String
    },
    
    // Explanation for recommendation
    explanation: String,
    reasonCodes: [String]
  },
  
  // Recommendation status
  status: {
    type: String,
    enum: ['active', 'shown', 'clicked', 'dismissed', 'expired'],
    default: 'active'
  },
  
  // User feedback
  userFeedback: {
    clicked: { type: Boolean, default: false },
    liked: { type: Boolean, default: false },
    dismissed: { type: Boolean, default: false },
    feedbackDate: Date
  },
  
  // Expiration
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
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
recommendationSchema.index({ userId: 1, status: 1, score: -1 });
recommendationSchema.index({ recommendationType: 1, score: -1 });
recommendationSchema.index({ targetType: 1, targetId: 1 });
recommendationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Update timestamps
recommendationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for recommendation age in hours
recommendationSchema.virtual('ageInHours').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60));
});

// Virtual for is expired
recommendationSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date();
});

// Ensure virtual fields are serialized
recommendationSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Recommendation', recommendationSchema);
