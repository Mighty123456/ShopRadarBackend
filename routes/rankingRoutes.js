const express = require('express');
const router = express.Router();
const RankingController = require('../controllers/rankingController');
const authMiddleware = require('../middleware/authMiddleware');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');

// Apply authentication middleware to all ranking routes
router.use(authMiddleware);

// ===== MAIN RANKING ENDPOINTS =====

/**
 * @route GET /api/ranking/shops
 * @desc Rank shops with advanced ML-based ranking
 * @access Private
 * @query latitude, longitude, category, minRating, maxDistance, limit
 */
router.get('/shops', RankingController.rankShops);
// Simple rule-aligned variant (mirrors frontend visitPriorityScore)
router.get('/shops-simple', RankingController.rankShopsSimple);

/**
 * @route GET /api/ranking/offers
 * @desc Rank offers with advanced ML-based ranking
 * @access Private
 * @query latitude, longitude, category, minDiscount, maxDistance, limit
 */
router.get('/offers', RankingController.rankOffers);

// ===== RANKING ANALYTICS =====

/**
 * @route GET /api/ranking/metrics
 * @desc Get ranking performance metrics for a user
 * @access Private
 * @query itemType, timeRange
 */
router.get('/metrics', RankingController.getRankingMetrics);

/**
 * @route GET /api/ranking/explanation
 * @desc Get personalized ranking explanation
 * @access Private
 * @query itemId, itemType
 */
router.get('/explanation', RankingController.getRankingExplanation);

// ===== INTERACTION TRACKING =====

/**
 * @route POST /api/ranking/interaction
 * @desc Track user interaction with ranked items
 * @access Private
 * @body itemId, itemType, behaviorType, rank, score
 */
router.post('/interaction', RankingController.trackInteraction);

// ===== A/B TESTING =====

/**
 * @route GET /api/ranking/ab-test
 * @desc A/B test ranking algorithms
 * @access Private
 * @query latitude, longitude, itemType, limit
 */
router.get('/ab-test', RankingController.getABTestRanking);

// ===== ADMIN ENDPOINTS =====

/**
 * @route POST /api/ranking/admin/retrain
 * @desc Retrain ranking models (admin only)
 * @access Admin
 */
router.post('/admin/retrain', adminAuthMiddleware, RankingController.retrainModels);

/**
 * @route GET /api/ranking/admin/status
 * @desc Get ranking model status (admin only)
 * @access Admin
 */
router.get('/admin/status', adminAuthMiddleware, RankingController.getModelStatus);

module.exports = router;
