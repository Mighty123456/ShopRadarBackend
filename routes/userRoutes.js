const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');

// Admin routes for user management (require admin authentication)
router.get('/admin/all', adminAuthMiddleware, userController.getAllUsers);
router.get('/admin/stats', adminAuthMiddleware, userController.getUserStats);
router.get('/admin/active', adminAuthMiddleware, userController.getActiveUsers);
router.get('/admin/:id', adminAuthMiddleware, userController.getUserById);
router.put('/admin/:id/status', adminAuthMiddleware, userController.updateUserStatus);
router.delete('/admin/:id', adminAuthMiddleware, userController.deleteUser);

module.exports = router;
