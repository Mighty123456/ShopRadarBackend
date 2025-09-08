const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Notification content
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  
  // Target audience
  type: {
    type: String,
    enum: ['global', 'shopkeeper', 'shopper'],
    required: true
  },
  
  // Notification status
  status: {
    type: String,
    enum: ['draft', 'sent'],
    default: 'draft'
  },
  
  // Scheduling
  scheduledAt: Date,
  sentAt: Date,
  
  // Created by admin
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  
  // Delivery tracking
  deliveryStats: {
    totalSent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    opened: { type: Number, default: 0 }
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
notificationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient querying
notificationSchema.index({ type: 1 });
notificationSchema.index({ status: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
