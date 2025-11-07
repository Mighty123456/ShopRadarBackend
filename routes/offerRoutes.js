const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');
const authMiddleware = require('../middleware/authMiddleware');
const shopOwnershipMiddleware = require('../middleware/shopOwnershipMiddleware');
const requireApprovedShop = require('../middleware/requireApprovedShop');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');

// Public routes (no authentication required)
router.get('/featured', offerController.getFeaturedOffers);
router.get('/shop/:shopId', offerController.getShopOffers);
router.get('/filtered', offerController.getFilteredOffers);

// Admin routes (require admin authentication) - must come BEFORE shop routes
router.get('/admin/all', adminAuthMiddleware, offerController.getAllOffers);
router.get('/admin/stats', adminAuthMiddleware, offerController.getOfferStats);
router.get('/admin/:id', adminAuthMiddleware, offerController.getOfferById);
router.put('/admin/:id/status', adminAuthMiddleware, offerController.updateOfferStatus);

// Apply authentication and shop ownership middleware to shop routes only
router.use(authMiddleware);
router.use(shopOwnershipMiddleware);
router.use(requireApprovedShop);

// Offer management routes for shop owners
router.get('/', offerController.getMyOffers);                    // Get all offers for shop
router.post('/', offerController.createOffer);                   // Create new offer
router.get('/:id', offerController.getOffer);                    // Get specific offer
router.put('/:id', offerController.updateOffer);                 // Update offer
router.delete('/:id', offerController.deleteOffer);              // Delete offer
router.patch('/:id/toggle-status', offerController.toggleOfferStatus); // Toggle offer status
router.post('/:id/promote', offerController.promoteOffer);       // Promote offer
router.post('/:id/unpromote', offerController.unpromoteOffer);   // Unpromote offer

module.exports = router;
