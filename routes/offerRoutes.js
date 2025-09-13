const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');
const authMiddleware = require('../middleware/authMiddleware');
const shopOwnershipMiddleware = require('../middleware/shopOwnershipMiddleware');
const requireApprovedShop = require('../middleware/requireApprovedShop');

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

module.exports = router;
