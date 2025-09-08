const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  // Reference to the user who wrote the review
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Reference to the shop being reviewed
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  
  // Review content
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true,
    trim: true
  },
  
  // Review status
  status: {
    type: String,
    enum: ['active', 'flagged', 'removed'],
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
reviewSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient querying
reviewSchema.index({ userId: 1 });
reviewSchema.index({ shopId: 1 });
reviewSchema.index({ status: 1 });
reviewSchema.index({ createdAt: -1 });

// Ensure one review per user per shop
reviewSchema.index({ userId: 1, shopId: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
