const Notification = require('../models/notificationModel');
const { logActivity } = require('./activityController');

// Get all notifications with pagination and filtering
exports.getAllNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const { type, status, search } = req.query;
    
    // Build filter object
    const filter = {};
    if (type && type !== 'all') {
      filter.type = type;
    }
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }
    
    const notifications = await Notification.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Notification.countDocuments(filter);
    
    // Transform notifications to match frontend expectations
    const transformedNotifications = notifications.map(notification => ({
      id: notification._id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      status: notification.status,
      createdDate: notification.createdAt.toISOString().split('T')[0],
      sentDate: notification.sentAt ? notification.sentAt.toISOString().split('T')[0] : undefined,
      scheduledAt: notification.scheduledAt ? notification.scheduledAt.toISOString().split('T')[0] : undefined,
      createdBy: notification.createdBy ? {
        id: notification.createdBy._id,
        name: notification.createdBy.name,
        email: notification.createdBy.email
      } : null,
      deliveryStats: notification.deliveryStats
    }));
    
    res.json({
      success: true,
      data: {
        notifications: transformedNotifications,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalNotifications: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Get all notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
};

// Get notification by ID
exports.getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findById(id)
      .populate('createdBy', 'name email');
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    const transformedNotification = {
      id: notification._id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      status: notification.status,
      createdDate: notification.createdAt.toISOString().split('T')[0],
      sentDate: notification.sentAt ? notification.sentAt.toISOString().split('T')[0] : undefined,
      scheduledAt: notification.scheduledAt ? notification.scheduledAt.toISOString().split('T')[0] : undefined,
      createdBy: notification.createdBy ? {
        id: notification.createdBy._id,
        name: notification.createdBy.name,
        email: notification.createdBy.email
      } : null,
      deliveryStats: notification.deliveryStats
    };
    
    res.json({
      success: true,
      data: { notification: transformedNotification }
    });
    
  } catch (error) {
    console.error('Get notification by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification'
    });
  }
};

// Create new notification
exports.createNotification = async (req, res) => {
  try {
    const { title, message, type, scheduledAt } = req.body;
    
    if (!title || !message || !type) {
      return res.status(400).json({
        success: false,
        message: 'Title, message, and type are required'
      });
    }
    
    if (!['global', 'shopkeeper', 'shopper'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid type. Must be "global", "shopkeeper", or "shopper"'
      });
    }
    
    const notificationData = {
      title,
      message,
      type,
      createdBy: req.admin?.id,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined
    };
    
    const notification = new Notification(notificationData);
    await notification.save();
    
    // Log the activity
    await logActivity({
      type: 'admin_action',
      description: `Notification "${title}" created by admin`,
      adminId: req.admin?.id,
      metadata: {
        notificationId: notification._id,
        notificationTitle: title,
        notificationType: type,
        scheduledAt: scheduledAt
      },
      severity: 'medium',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      data: {
        notification: {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          status: notification.status,
          createdDate: notification.createdAt.toISOString().split('T')[0],
          scheduledAt: notification.scheduledAt ? notification.scheduledAt.toISOString().split('T')[0] : undefined
        }
      }
    });
    
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create notification'
    });
  }
};

// Update notification
exports.updateNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, type, scheduledAt } = req.body;
    
    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    if (notification.status === 'sent') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update a notification that has already been sent'
      });
    }
    
    notification.title = title || notification.title;
    notification.message = message || notification.message;
    notification.type = type || notification.type;
    notification.scheduledAt = scheduledAt ? new Date(scheduledAt) : notification.scheduledAt;
    
    await notification.save();
    
    // Log the activity
    await logActivity({
      type: 'admin_action',
      description: `Notification "${notification.title}" updated by admin`,
      adminId: req.admin?.id,
      metadata: {
        notificationId: notification._id,
        notificationTitle: notification.title,
        notificationType: notification.type
      },
      severity: 'medium',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      message: 'Notification updated successfully'
    });
    
  } catch (error) {
    console.error('Update notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification'
    });
  }
};

// Send notification
exports.sendNotification = async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    if (notification.status === 'sent') {
      return res.status(400).json({
        success: false,
        message: 'Notification has already been sent'
      });
    }
    
    // Update notification status
    notification.status = 'sent';
    notification.sentAt = new Date();
    await notification.save();
    
    // Log the activity
    await logActivity({
      type: 'admin_action',
      description: `Notification "${notification.title}" sent by admin`,
      adminId: req.admin?.id,
      metadata: {
        notificationId: notification._id,
        notificationTitle: notification.title,
        notificationType: notification.type,
        sentAt: notification.sentAt
      },
      severity: 'high',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      message: 'Notification sent successfully'
    });
    
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification'
    });
  }
};

// Get notification statistics
exports.getNotificationStats = async (req, res) => {
  try {
    const totalNotifications = await Notification.countDocuments();
    const draftNotifications = await Notification.countDocuments({ status: 'draft' });
    const sentNotifications = await Notification.countDocuments({ status: 'sent' });
    
    // Get notifications by type
    const typeStats = await Notification.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Get notifications created in the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newNotifications = await Notification.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
    
    res.json({
      success: true,
      data: {
        totalNotifications,
        draftNotifications,
        sentNotifications,
        newNotifications,
        typeStats
      }
    });
    
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification statistics'
    });
  }
};
