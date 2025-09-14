const Shop = require('../models/shopModel');

const shopOwnershipMiddleware = async (req, res, next) => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    // Debug: Log user info
    console.log('Shop ownership middleware - User info:', {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role
    });

    // Find shop owned by this user
    const shop = await Shop.findOne({ ownerId: req.user.id });
    
    if (!shop) {
      console.log('No shop found for user:', req.user.id);
      return res.status(403).json({ 
        success: false,
        message: 'No shop found for this user. Please register a shop first.' 
      });
    }

    // Check if user role is shop
    if (req.user.role !== 'shop') {
      console.log('User role is not shop:', req.user.role);
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. This endpoint is only for shop owners.' 
      });
    }

    // Attach shop to request for use in controllers
    req.shop = shop;
    next();
  } catch (err) {
    console.error('Shop ownership middleware error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

module.exports = shopOwnershipMiddleware;
