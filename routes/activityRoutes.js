const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');

// All activity routes require admin authentication
router.use(adminAuthMiddleware);

// Get recent activities with pagination and filtering
router.get('/recent', activityController.getRecentActivities);

// Get activity statistics
router.get('/stats', activityController.getActivityStats);

// Get activity by ID
router.get('/:id', activityController.getActivityById);

// Create a new activity (for manual logging)
router.post('/', activityController.createActivity);

module.exports = router;
