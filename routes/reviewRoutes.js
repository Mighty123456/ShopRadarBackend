const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');

// All review routes require admin authentication
router.use(adminAuthMiddleware);

// Get all reviews with pagination and filtering
router.get('/admin/all', reviewController.getAllReviews);

// Get review statistics
router.get('/admin/stats', reviewController.getReviewStats);

// Get review by ID
router.get('/admin/:id', reviewController.getReviewById);

// Update review status
router.put('/admin/:id/status', reviewController.updateReviewStatus);

module.exports = router;
