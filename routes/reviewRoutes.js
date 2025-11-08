const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');
const authMiddleware = require('../middleware/authMiddleware');

// Public routes (no authentication required)
// Get reviews for a specific shop (alternative route)
router.get('/shop/:shopId', reviewController.getShopReviews);

// Create/update a review for a shop (authenticated users)
router.post('/shops/:shopId/reviews', authMiddleware, reviewController.createOrUpdateReview);

// Delete own review
router.delete('/shops/:shopId/reviews', authMiddleware, reviewController.deleteReview);

// Public: list reviews for a shop
router.get('/shops/:shopId/reviews', reviewController.getShopReviews);

// Public: rating summary for a shop
router.get('/shops/:shopId/ratings', reviewController.getShopRatingSummary);

// User routes (require user authentication)
router.use(authMiddleware);

// Get user's own reviews
router.get('/my-reviews', reviewController.getMyReviews);

// Get user's review for a specific shop
router.get('/shop/:shopId/my-review', reviewController.getMyReviewForShop);

// Create a new review
router.post('/', reviewController.createReview);

// Update a review
router.put('/:id', reviewController.updateReview);

// Delete a review
router.delete('/:id', reviewController.deleteReview);

// Report a review
router.post('/:id/report', reviewController.reportReview);

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
