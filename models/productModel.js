const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // Reference to the shop that owns this product
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  
  // Hierarchical product structure: Category → Brand → Item
  category: {
    type: String,
    required: true,
    trim: true
  },
  brand: {
    type: String,
    required: true,
    trim: true
  },
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  
  // Product basic information
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  
  // Product images (Cloudinary-backed)
  images: [{
    url: { type: String, trim: true },
    publicId: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Product status
  status: {
    type: String,
    enum: ['active', 'removed', 'flagged'],
    default: 'active'
  },
  
  // Reporting and moderation
  reportCount: {
    type: Number,
    default: 0
  },
  reportReasons: [{
    reason: String,
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reportedAt: { type: Date, default: Date.now }
  }],
  
  // Moderation details
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  moderationNotes: String,
  moderatedAt: Date,
  
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
productSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient querying
productSchema.index({ shopId: 1 });
productSchema.index({ status: 1 });
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ category: 1, brand: 1 });
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
