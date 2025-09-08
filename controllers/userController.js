const User = require('../models/userModel');
const Shop = require('../models/shopModel');
const { logActivity } = require('../controllers/activityController');

// Get all users with pagination and filtering
exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const { type, status, search } = req.query;
    
    // Build filter object
    const filter = {};
    if (type && type !== 'all') {
      filter.role = type === 'shopkeeper' ? 'shop' : 'customer';
    }
    
    // For status filtering, check if user is active
    if (status && status !== 'all') {
      filter.isActive = status === 'active';
    }
    
    // For search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const users = await User.find(filter)
      .select('-password -otp')
      .populate('shopId', 'name licenseNumber verificationStatus isActive')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await User.countDocuments(filter);
    
    // Transform users to match frontend expectations
    const transformedUsers = users.map(user => ({
      id: user._id,
      name: user.fullName || user.name || 'N/A',
      email: user.email,
      type: user.role === 'shop' ? 'shopkeeper' : 'shopper',
      status: user.isActive ? 'active' : 'blocked',
      joinedDate: user.createdAt.toISOString().split('T')[0],
      lastActive: user.createdAt.toISOString().split('T')[0], // You can add lastActive field later
      shopInfo: user.shopId ? {
        name: user.shopId.name,
        licenseNumber: user.shopId.licenseNumber,
        verificationStatus: user.shopId.verificationStatus,
        isActive: user.shopId.isActive
      } : null
    }));
    
    res.json({
      success: true,
      data: {
        users: transformedUsers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalUsers: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id)
      .select('-password -otp')
      .populate('shopId', 'name licenseNumber verificationStatus isActive location');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const transformedUser = {
      id: user._id,
      name: user.fullName || user.name || 'N/A',
      email: user.email,
      type: user.role === 'shop' ? 'shopkeeper' : 'shopper',
      status: user.isActive ? 'active' : 'blocked',
      joinedDate: user.createdAt.toISOString().split('T')[0],
      lastActive: user.createdAt.toISOString().split('T')[0],
      isEmailVerified: user.isEmailVerified,
      shopInfo: user.shopId ? {
        name: user.shopId.name,
        licenseNumber: user.shopId.licenseNumber,
        verificationStatus: user.shopId.verificationStatus,
        isActive: user.shopId.isActive,
        location: user.shopId.location
      } : null
    };
    
    res.json({
      success: true,
      user: transformedUser
    });
    
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
};

// Update user status (block/unblock)
exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['active', 'blocked'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "active" or "blocked"'
      });
    }
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Update the user's active status
    user.isActive = status === 'active';
    await user.save();
    
    // Log the activity
    await logActivity({
      type: status === 'active' ? 'user_unblocked' : 'user_blocked',
      description: `User ${user.name || user.email} ${status === 'active' ? 'unblocked' : 'blocked'} by admin`,
      userId: user._id,
      adminId: req.admin?.id,
      metadata: {
        previousStatus: status === 'active' ? 'blocked' : 'active',
        newStatus: status,
        userEmail: user.email
      },
      severity: 'high',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      message: `User ${status === 'active' ? 'unblocked' : 'blocked'} successfully`
    });
    
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
};

// Get user statistics
exports.getUserStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalShoppers = await User.countDocuments({ role: 'customer' });
    const totalShopkeepers = await User.countDocuments({ role: 'shop' });
    const verifiedUsers = await User.countDocuments({ isEmailVerified: true });
    
    // Get users created in the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newUsers = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        totalShoppers,
        totalShopkeepers,
        verifiedUsers,
        newUsers,
        unverifiedUsers: totalUsers - verifiedUsers
      }
    });
    
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics'
    });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // If user is a shop owner, also delete their shop
    if (user.role === 'shop' && user.shopId) {
      await Shop.findByIdAndDelete(user.shopId);
    }
    
    await User.findByIdAndDelete(id);
    
    // Log the activity
    await logActivity({
      type: 'user_deleted',
      description: `User ${user.name || user.email} deleted by admin`,
      userId: user._id,
      adminId: req.admin?.id,
      metadata: {
        userEmail: user.email,
        userRole: user.role,
        shopDeleted: user.role === 'shop' && user.shopId ? true : false
      },
      severity: 'critical',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};
