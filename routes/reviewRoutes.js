const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');
const authMiddleware = require('../middleware/authMiddleware');

// Public routes (no authentication required)
// Get reviews for a specific shop
router.get('/shop/:shopId', reviewController.getShopReviews);

// User routes (require user authentication)
router.use(authMiddleware);

// Create a new review
router.post('/', reviewController.createReview);

// Update a review
router.put('/:id', reviewController.updateReview);

// Delete a review
router.delete('/:id', reviewController.deleteReview);

// Admin routes (require admin authentication)
router.use('/admin', adminAuthMiddleware);

// Get all reviews with pagination and filtering
router.get('/admin/all', reviewController.getAllReviews);

// Get review statistics
router.get('/admin/stats', reviewController.getReviewStats);

// Get review by ID
router.get('/admin/:id', reviewController.getReviewById);

// Update review status
router.put('/admin/:id/status', reviewController.updateReviewStatus);

module.exports = router;
