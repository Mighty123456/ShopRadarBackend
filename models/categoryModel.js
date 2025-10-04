const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  // Reference to the shop that owns this category
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  
  // Category information
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  
  // Brands within this category
  brands: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Category status
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
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

// Update the updatedAt field before saving
categorySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient querying
categorySchema.index({ shopId: 1 });
categorySchema.index({ name: 1 });
categorySchema.index({ status: 1 });
categorySchema.index({ createdAt: -1 });

// Ensure unique category names per shop
categorySchema.index({ shopId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Category', categorySchema);
