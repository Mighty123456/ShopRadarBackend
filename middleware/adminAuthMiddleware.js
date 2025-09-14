const jwt = require('jsonwebtoken');
const Admin = require('../models/adminModel');
const config = require('../config/config');

const adminAuthMiddleware = async (req, res, next) => {
  try {
    console.log('Admin auth middleware called for:', req.path);
    const authHeader = req.headers.authorization;
    console.log('Auth header:', authHeader ? 'Present' : 'Missing');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No valid auth header found');
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const token = authHeader.substring(7);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      
      if (decoded.type !== 'admin') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token type'
        });
      }

      const admin = await Admin.findById(decoded.id).select('-password');
      
      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Token is invalid - admin not found'
        });
      }

      if (!admin.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      if (admin.passwordChangedAt) {
        const changedTimestamp = parseInt(admin.passwordChangedAt.getTime() / 1000, 10);
        
        if (decoded.iat < changedTimestamp) {
          return res.status(401).json({
            success: false,
            message: 'Token is invalid - password was changed'
          });
        }
      }

      req.admin = {
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role
      };

      next();

    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      } else {
        return res.status(401).json({
          success: false,
          message: 'Token verification failed'
        });
      }
    }

  } catch (error) {
    console.error('Admin auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = adminAuthMiddleware;
