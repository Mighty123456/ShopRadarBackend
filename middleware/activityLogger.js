const Activity = require('../models/activityModel');

// Middleware to automatically log activities
const activityLogger = (activityType, options = {}) => {
  return async (req, res, next) => {
    // Store original res.json to intercept the response
    const originalJson = res.json;
    
    res.json = function(data) {
      // Log activity after successful response
      if (data && data.success !== false) {
        logActivity(req, activityType, options, data);
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };
    
    next();
  };
};

// Function to log activity
const logActivity = async (req, activityType, options, responseData) => {
  try {
    const activityData = {
      type: activityType,
      description: options.description || getDefaultDescription(activityType, req, responseData),
      userId: options.userId || extractUserId(req, responseData),
      shopId: options.shopId || extractShopId(req, responseData),
      adminId: req.admin?.id,
      metadata: {
        ...options.metadata,
        method: req.method,
        url: req.originalUrl,
        responseData: options.includeResponse ? responseData : undefined
      },
      severity: options.severity || 'medium',
      status: responseData.success === false ? 'error' : 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    };
    
    await Activity.createActivity(activityData);
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

// Helper function to get default description
const getDefaultDescription = (activityType, req, responseData) => {
  const descriptions = {
    'user_registered': 'New user registered',
    'user_login': 'User logged in',
    'user_logout': 'User logged out',
    'user_blocked': 'User blocked by admin',
    'user_unblocked': 'User unblocked by admin',
    'user_deleted': 'User deleted by admin',
    'shop_registered': 'New shop registered',
    'shop_verified': 'Shop verified by admin',
    'shop_rejected': 'Shop rejected by admin',
    'shop_activated': 'Shop activated',
    'shop_deactivated': 'Shop deactivated',
    'admin_login': 'Admin logged in',
    'admin_action': 'Admin performed action'
  };
  
  return descriptions[activityType] || 'System activity';
};

// Helper function to extract user ID from request or response
const extractUserId = (req, responseData) => {
  // Try to get from request params
  if (req.params.userId) return req.params.userId;
  if (req.params.id && req.originalUrl.includes('/users/')) return req.params.id;
  
  // Try to get from request body
  if (req.body.userId) return req.body.userId;
  
  // Try to get from response data
  if (responseData && responseData.data && responseData.data.userId) {
    return responseData.data.userId;
  }
  
  return null;
};

// Helper function to extract shop ID from request or response
const extractShopId = (req, responseData) => {
  // Try to get from request params
  if (req.params.shopId) return req.params.shopId;
  if (req.params.id && req.originalUrl.includes('/shops/')) return req.params.id;
  
  // Try to get from request body
  if (req.body.shopId) return req.body.shopId;
  
  // Try to get from response data
  if (responseData && responseData.data && responseData.data.shopId) {
    return responseData.data.shopId;
  }
  
  return null;
};

// Specific activity loggers for common operations
const logUserActivity = (activityType, options = {}) => {
  return activityLogger(activityType, {
    ...options,
    severity: options.severity || 'medium'
  });
};

const logShopActivity = (activityType, options = {}) => {
  return activityLogger(activityType, {
    ...options,
    severity: options.severity || 'high'
  });
};

const logAdminActivity = (activityType, options = {}) => {
  return activityLogger(activityType, {
    ...options,
    severity: options.severity || 'high'
  });
};

module.exports = {
  activityLogger,
  logUserActivity,
  logShopActivity,
  logAdminActivity,
  logActivity
};
