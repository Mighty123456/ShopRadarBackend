const User = require('../models/userModel');

const updateLastActive = async (req, res, next) => {
  try {
    // Only update for authenticated users (not admin routes)
    if (req.user && req.user.id && !req.path.startsWith('/admin')) {
      await User.findByIdAndUpdate(req.user.id, {
        lastActive: new Date()
      });
    }
  } catch (error) {
    // Don't fail the request if lastActive update fails
    console.error('Error updating lastActive:', error);
  }
  
  next();
};

module.exports = updateLastActive;
