const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  // Activity type and details
  type: {
    type: String,
    required: true,
    enum: [
      'user_registered',
      'user_login',
      'user_logout',
      'user_blocked',
      'user_unblocked',
      'user_deleted',
      'shop_registered',
      'shop_verified',
      'shop_rejected',
      'shop_activated',
      'shop_deactivated',
      'product_added',
      'product_created',
      'product_removed',
      'product_deleted',
      'product_updated',
      'review_posted',
      'review_flagged',
      'review_removed',
      'admin_login',
      'admin_action'
    ]
  },
  
  // Activity description
  description: {
    type: String,
    required: true
  },
  
  // Related entities
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: false
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: false
  },
  
  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Activity severity level
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  // Activity status
  status: {
    type: String,
    enum: ['success', 'warning', 'error'],
    default: 'success'
  },
  
  // IP address and user agent for security tracking
  ipAddress: String,
  userAgent: String,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient querying
activitySchema.index({ createdAt: -1 });
activitySchema.index({ type: 1 });
activitySchema.index({ userId: 1 });
activitySchema.index({ shopId: 1 });
activitySchema.index({ adminId: 1 });

// Static method to create activity
activitySchema.statics.createActivity = async function(activityData) {
  try {
    const activity = new this(activityData);
    await activity.save();
    return activity;
  } catch (error) {
    console.error('Error creating activity:', error);
    throw error;
  }
};

// Static method to get recent activities
activitySchema.statics.getRecentActivities = async function(limit = 50, filters = {}) {
  try {
    const query = {};
    
    if (filters.type) {
      query.type = filters.type;
    }
    
    if (filters.severity) {
      query.severity = filters.severity;
    }
    
    if (filters.status) {
      query.status = filters.status;
    }
    
    if (filters.dateFrom) {
      query.createdAt = { $gte: filters.dateFrom };
    }
    
    if (filters.dateTo) {
      query.createdAt = { ...query.createdAt, $lte: filters.dateTo };
    }
    
    const activities = await this.find(query)
      .populate('userId', 'name email')
      .populate('shopId', 'shopName licenseNumber')
      .populate('adminId', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit);
    
    return activities;
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    throw error;
  }
};

// Static method to get activity statistics
activitySchema.statics.getActivityStats = async function(timeframe = '24h') {
  try {
    let dateFilter = {};
    const now = new Date();
    
    switch (timeframe) {
      case '1h':
        dateFilter = { createdAt: { $gte: new Date(now.getTime() - 60 * 60 * 1000) } };
        break;
      case '24h':
        dateFilter = { createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } };
        break;
      case '7d':
        dateFilter = { createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } };
        break;
      case '30d':
        dateFilter = { createdAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } };
        break;
    }
    
    const stats = await this.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          severity: { $first: '$severity' }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    return stats;
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    throw error;
  }
};

module.exports = mongoose.model('Activity', activitySchema);
