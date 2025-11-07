const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  // Reference to the shop that owns this offer
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  
  // Reference to the product this offer applies to
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  
  // Offer basic information
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  
  // Offer category for filtering
  category: {
    type: String,
    enum: [
      'Food & Dining',
      'Electronics & Gadgets', 
      'Fashion & Clothing',
      'Health & Beauty',
      'Home & Garden',
      'Sports & Fitness',
      'Books & Education',
      'Automotive',
      'Entertainment',
      'Services',
      'Other'
    ],
    required: true,
    default: 'Other'
  },
  
  // Discount details
  discountType: {
    type: String,
    enum: ['Percentage', 'Fixed Amount'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Offer validity
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  
  // Usage limits
  maxUses: {
    type: Number,
    default: 0, // 0 means unlimited
    min: 0
  },
  currentUses: {
    type: Number,
    default: 0
  },
  
  // Offer status
  status: {
    type: String,
    enum: ['active', 'inactive', 'expired'],
    default: 'active'
  },
  
  // Promotion status - only subscribed shopkeepers can promote offers
  isPromoted: {
    type: Boolean,
    default: false
  },
  
  promotedAt: {
    type: Date
  },
  
  promotionExpiresAt: {
    type: Date
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

// Update timestamps and enforce status transitions before saving
offerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();

  const now = new Date();

  // Enforce expired if past endDate
  if (this.endDate < now) {
    this.status = 'expired';
  }

  next();
});

// Index for efficient querying
offerSchema.index({ shopId: 1 });
offerSchema.index({ productId: 1 });
offerSchema.index({ status: 1 });
offerSchema.index({ category: 1 });
offerSchema.index({ startDate: 1, endDate: 1 });
offerSchema.index({ discountValue: 1 });
// Compound indexes for common query patterns
offerSchema.index({ status: 1, shopId: 1, startDate: 1, endDate: 1 }); // For featured offers query
offerSchema.index({ status: 1, createdAt: -1 }); // For sorting by newest

// Virtual for checking if offer is currently valid
offerSchema.virtual('isValid').get(function() {
  const now = new Date();
  return this.status === 'active' && 
         now >= this.startDate && 
         now <= this.endDate &&
         (this.maxUses === 0 || this.currentUses < this.maxUses);
});

// Virtual for calculating discounted price
offerSchema.virtual('discountedPrice').get(function() {
  // This would need the product price to calculate
  // We'll handle this in the controller
  return null;
});

module.exports = mongoose.model('Offer', offerSchema);
