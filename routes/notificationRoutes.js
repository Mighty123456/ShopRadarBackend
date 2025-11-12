const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');
const authMiddleware = require('../middleware/authMiddleware');

// Public route for device registration (requires user authentication)
router.post('/register-device', authMiddleware, notificationController.registerDevice);

// Admin routes - require admin authentication
router.get('/admin/all', adminAuthMiddleware, notificationController.getAllNotifications);
router.get('/admin/stats', adminAuthMiddleware, notificationController.getNotificationStats);
router.get('/admin/:id', adminAuthMiddleware, notificationController.getNotificationById);
router.post('/admin', adminAuthMiddleware, notificationController.createNotification);
router.put('/admin/:id', adminAuthMiddleware, notificationController.updateNotification);
router.post('/admin/:id/send', adminAuthMiddleware, notificationController.sendNotification);

module.exports = router;
