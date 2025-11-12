const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // FCM token
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Platform information
  platform: {
    type: String,
    enum: ['android', 'ios', 'web'],
    required: true
  },
  
  // App version
  appVersion: {
    type: String,
    default: '1.0.0'
  },
  
  // Device information
  deviceInfo: {
    model: String,
    osVersion: String,
    manufacturer: String
  },
  
  // Notification preferences
  preferences: {
    newOffers: { type: Boolean, default: true },
    priceDrops: { type: Boolean, default: true },
    restocks: { type: Boolean, default: true },
    nearbyOffers: { type: Boolean, default: true },
    featuredOffers: { type: Boolean, default: true },
    specialDeals: { type: Boolean, default: true }
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Last used timestamp
  lastUsed: {
    type: Date,
    default: Date.now
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
deviceTokenSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  this.lastUsed = Date.now();
  next();
});

// Index for efficient querying
deviceTokenSchema.index({ userId: 1, isActive: 1 });
deviceTokenSchema.index({ token: 1 });

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);

