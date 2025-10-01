const express = require('express');
const router = express.Router();
const mlController = require('../controllers/mlController');
const authMiddleware = require('../middleware/authMiddleware');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');

// ===== USER ROUTES (Require Authentication) =====

// Behavior tracking
router.post('/track', authMiddleware, mlController.trackBehavior);

// User analytics
router.get('/analytics', authMiddleware, mlController.getUserAnalytics);

// Recommendations
router.get('/recommendations', authMiddleware, mlController.getRecommendations);
router.get('/recommendations/trending', authMiddleware, mlController.getTrendingRecommendations);
router.post('/recommendations/feedback', authMiddleware, mlController.feedbackRecommendation);

// User profile
router.get('/profile', authMiddleware, mlController.getUserProfile);
router.put('/profile', authMiddleware, mlController.updateUserProfile);

// ===== ADMIN ROUTES (Require Admin Authentication) =====

// System analytics
router.get('/admin/analytics', adminAuthMiddleware, mlController.getSystemAnalytics);

// Model performance
router.get('/admin/performance', adminAuthMiddleware, mlController.getModelPerformance);

// Model management
router.post('/admin/retrain', adminAuthMiddleware, mlController.retrainModels);

module.exports = router;
