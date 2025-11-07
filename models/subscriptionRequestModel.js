const mongoose = require('mongoose');

const subscriptionRequestSchema = new mongoose.Schema({
  // Reference to the shop requesting subscription
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  
  // Reference to the shop owner
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Subscription plan requested
  planType: {
    type: String,
    enum: ['basic', 'premium', 'enterprise'],
    required: true,
    default: 'basic'
  },
  
  // Request status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  
  // Admin who processed the request
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  
  // Admin notes/reason for approval/rejection
  adminNotes: {
    type: String,
    trim: true
  },
  
  // Request details
  requestMessage: {
    type: String,
    trim: true
  },
  
  // Timestamps
  requestedAt: {
    type: Date,
    default: Date.now
  },
  
  processedAt: {
    type: Date
  },
  
  // Subscription duration (in months)
  duration: {
    type: Number,
    default: 1,
    min: 1,
    max: 12
  }
});

// Index for efficient querying
subscriptionRequestSchema.index({ shopId: 1 });
subscriptionRequestSchema.index({ ownerId: 1 });
subscriptionRequestSchema.index({ status: 1 });
subscriptionRequestSchema.index({ requestedAt: -1 });

module.exports = mongoose.model('SubscriptionRequest', subscriptionRequestSchema);

