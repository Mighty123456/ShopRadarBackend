const mongoose = require('mongoose');

const userBehaviorSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Behavior tracking
  behaviorType: {
    type: String,
    enum: [
      'view_product',
      'view_shop',
      'search_query',
      'click_offer',
      'add_to_favorites',
      'remove_from_favorites',
      'share_product',
      'review_product',
      'purchase_product',
      'visit_shop',
      'compare_products',
      'filter_search',
      'sort_results'
    ],
    required: true
  },
  
  // Target entities
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false // Can be product, shop, or offer ID
  },
  
  targetType: {
    type: String,
    enum: ['product', 'shop', 'offer', 'search'],
    required: false
  },
  
  // Behavior metadata
  metadata: {
    // Search queries
    searchQuery: String,
    searchFilters: {
      category: String,
      priceRange: { min: Number, max: Number },
      distance: Number,
      rating: Number
    },
    
    // Product interactions
    productCategory: String,
    productPrice: Number,
    productRating: Number,
    
    // Shop interactions
    shopCategory: String,
    shopRating: Number,
    shopDistance: Number,
    
    // Session data
    sessionId: String,
    deviceType: String,
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: [Number] // [longitude, latitude]
    },
    
    // Time-based data
    timeOfDay: Number, // 0-23
    dayOfWeek: Number, // 0-6
    season: String, // spring, summer, fall, winter
    
    // Additional context
    referrer: String,
    userAgent: String,
    ipAddress: String
  },
  
  // Behavior scoring
  score: {
    type: Number,
    default: 1,
    min: 0,
    max: 10
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient querying
userBehaviorSchema.index({ userId: 1, createdAt: -1 });
userBehaviorSchema.index({ behaviorType: 1, createdAt: -1 });
userBehaviorSchema.index({ targetType: 1, targetId: 1 });
userBehaviorSchema.index({ 'metadata.location': '2dsphere' });

// Virtual for behavior age in days
userBehaviorSchema.virtual('ageInDays').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Ensure virtual fields are serialized
userBehaviorSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('UserBehavior', userBehaviorSchema);
