const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');
const authMiddleware = require('../middleware/authMiddleware');
const shopOwnershipMiddleware = require('../middleware/shopOwnershipMiddleware');
const requireApprovedShop = require('../middleware/requireApprovedShop');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');

// Apply authentication and shop ownership middleware to all routes
router.use(authMiddleware);
router.use(shopOwnershipMiddleware);
router.use(requireApprovedShop);

// Offer management routes
router.get('/', offerController.getMyOffers);                    // Get all offers for shop
router.post('/', offerController.createOffer);                   // Create new offer
router.get('/:id', offerController.getOffer);                    // Get specific offer
router.put('/:id', offerController.updateOffer);                 // Update offer
router.delete('/:id', offerController.deleteOffer);              // Delete offer
router.patch('/:id/toggle-status', offerController.toggleOfferStatus); // Toggle offer status

// Admin routes (require admin authentication)
router.get('/admin/all', adminAuthMiddleware, offerController.getAllOffers);
router.get('/admin/stats', adminAuthMiddleware, offerController.getOfferStats);
router.get('/admin/:id', adminAuthMiddleware, offerController.getOfferById);
router.put('/admin/:id/status', adminAuthMiddleware, offerController.updateOfferStatus);

module.exports = router;
