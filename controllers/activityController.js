const Activity = require('../models/activityModel');
const User = require('../models/userModel');
const Shop = require('../models/shopModel');
const websocketService = require('../services/websocketService');

// Get recent activities with pagination
exports.getRecentActivities = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const { type, severity, status, dateFrom, dateTo } = req.query;
    
    const filters = {};
    if (type) filters.type = type;
    if (severity) filters.severity = severity;
    if (status) filters.status = status;
    if (dateFrom) filters.dateFrom = new Date(dateFrom);
    if (dateTo) filters.dateTo = new Date(dateTo);
    
    const activities = await Activity.getRecentActivities(limit + skip, filters);
    const paginatedActivities = activities.slice(skip, skip + limit);
    
    // Transform activities for frontend
    const transformedActivities = paginatedActivities.map(activity => ({
      id: activity._id,
      type: activity.type,
      description: activity.description,
      severity: activity.severity,
      status: activity.status,
      createdAt: activity.createdAt,
      timeAgo: getTimeAgo(activity.createdAt),
      user: activity.userId ? {
        id: activity.userId._id,
        name: activity.userId.name || activity.userId.fullName,
        email: activity.userId.email
      } : null,
      shop: activity.shopId ? {
        id: activity.shopId._id,
        name: activity.shopId.shopName,
        licenseNumber: activity.shopId.licenseNumber
      } : null,
      admin: activity.adminId ? {
        id: activity.adminId._id,
        name: activity.adminId.name,
        email: activity.adminId.email
      } : null,
      metadata: activity.metadata
    }));
    
    res.json({
      success: true,
      data: {
        activities: transformedActivities,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(activities.length / limit),
          totalActivities: activities.length,
          hasNext: page < Math.ceil(activities.length / limit),
          hasPrev: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Get recent activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activities'
    });
  }
};

// Get activity statistics
exports.getActivityStats = async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    const stats = await Activity.getActivityStats(timeframe);
    
    // Get total count for the timeframe
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
    
    const totalActivities = await Activity.countDocuments(dateFilter);
    
    res.json({
      success: true,
      data: {
        timeframe,
        totalActivities,
        activityTypes: stats,
        summary: {
          userActivities: stats.filter(s => s._id.includes('user')).reduce((sum, s) => sum + s.count, 0),
          shopActivities: stats.filter(s => s._id.includes('shop')).reduce((sum, s) => sum + s.count, 0),
          adminActivities: stats.filter(s => s._id.includes('admin')).reduce((sum, s) => sum + s.count, 0),
          productActivities: stats.filter(s => s._id.includes('product')).reduce((sum, s) => sum + s.count, 0),
          reviewActivities: stats.filter(s => s._id.includes('review')).reduce((sum, s) => sum + s.count, 0)
        }
      }
    });
    
  } catch (error) {
    console.error('Get activity stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity statistics'
    });
  }
};

// Create a new activity (for manual logging)
exports.createActivity = async (req, res) => {
  try {
    const { type, description, userId, shopId, metadata, severity, status } = req.body;
    
    if (!type || !description) {
      return res.status(400).json({
        success: false,
        message: 'Type and description are required'
      });
    }
    
    const activityData = {
      type,
      description,
      userId,
      shopId,
      adminId: req.admin?.id,
      metadata: metadata || {},
      severity: severity || 'medium',
      status: status || 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    };
    
    const activity = await Activity.createActivity(activityData);
    
    // Broadcast the new activity via WebSocket
    websocketService.broadcastActivity(activity);
    
    res.json({
      success: true,
      data: {
        activity: {
          id: activity._id,
          type: activity.type,
          description: activity.description,
          severity: activity.severity,
          status: activity.status,
          createdAt: activity.createdAt,
          timeAgo: getTimeAgo(activity.createdAt)
        }
      }
    });
    
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create activity'
    });
  }
};

// Get activity by ID
exports.getActivityById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const activity = await Activity.findById(id)
      .populate('userId', 'name email fullName')
      .populate('shopId', 'shopName licenseNumber')
      .populate('adminId', 'name email');
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }
    
    const transformedActivity = {
      id: activity._id,
      type: activity.type,
      description: activity.description,
      severity: activity.severity,
      status: activity.status,
      createdAt: activity.createdAt,
      timeAgo: getTimeAgo(activity.createdAt),
      user: activity.userId ? {
        id: activity.userId._id,
        name: activity.userId.name || activity.userId.fullName,
        email: activity.userId.email
      } : null,
      shop: activity.shopId ? {
        id: activity.shopId._id,
        name: activity.shopId.shopName,
        licenseNumber: activity.shopId.licenseNumber
      } : null,
      admin: activity.adminId ? {
        id: activity.adminId._id,
        name: activity.adminId.name,
        email: activity.adminId.email
      } : null,
      metadata: activity.metadata,
      ipAddress: activity.ipAddress,
      userAgent: activity.userAgent
    };
    
    res.json({
      success: true,
      data: { activity: transformedActivity }
    });
    
  } catch (error) {
    console.error('Get activity by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity'
    });
  }
};

// Helper function to calculate time ago
function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}

// Helper function to log activity (used by other controllers)
exports.logActivity = async (activityData) => {
  try {
    const activity = await Activity.createActivity(activityData);
    
    // Broadcast the new activity via WebSocket
    websocketService.broadcastActivity(activity);
    
    return activity;
  } catch (error) {
    console.error('Error logging activity:', error);
    throw error;
  }
};
