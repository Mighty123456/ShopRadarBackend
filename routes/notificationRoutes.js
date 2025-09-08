const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');

// All notification routes require admin authentication
router.use(adminAuthMiddleware);

// Get all notifications with pagination and filtering
router.get('/admin/all', notificationController.getAllNotifications);

// Get notification statistics
router.get('/admin/stats', notificationController.getNotificationStats);

// Get notification by ID
router.get('/admin/:id', notificationController.getNotificationById);

// Create new notification
router.post('/admin', notificationController.createNotification);

// Update notification
router.put('/admin/:id', notificationController.updateNotification);

// Send notification
router.post('/admin/:id/send', notificationController.sendNotification);

module.exports = router;
