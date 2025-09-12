const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const shopOwnershipMiddleware = require('../middleware/shopOwnershipMiddleware');
const requireApprovedShop = require('../middleware/requireApprovedShop');

// Public routes (for customers)
router.get('/nearby', shopController.getShopsNearLocation);

// Shop owner routes (require shop owner authentication)
router.get('/my-shop', authMiddleware, shopOwnershipMiddleware, shopController.getMyShop);
router.put('/my-shop', authMiddleware, shopOwnershipMiddleware, shopController.updateMyShop);
router.put('/my-shop/status', authMiddleware, shopOwnershipMiddleware, requireApprovedShop, shopController.updateMyShopStatus);
router.get('/my-shop/stats', authMiddleware, shopOwnershipMiddleware, shopController.getMyShopStats);
router.get('/my-shop/verification', authMiddleware, shopOwnershipMiddleware, shopController.getMyShopVerificationStatus);
router.post('/my-shop/submit-gps', authMiddleware, shopOwnershipMiddleware, shopController.submitGpsAndVerifyAddress);
router.post('/my-shop/ocr-license', authMiddleware, shopOwnershipMiddleware, shopController.ocrAndValidateLicense);
router.post('/my-shop/upload-photo', authMiddleware, shopOwnershipMiddleware, shopController.uploadShopPhotoAndCheckExif);

// Admin routes (require admin authentication)
router.get('/admin/all', adminAuthMiddleware, shopController.getAllShops);
router.get('/admin/stats', adminAuthMiddleware, shopController.getShopStats);
router.get('/admin/:id', adminAuthMiddleware, shopController.getShopById);
router.put('/admin/:id/verify', adminAuthMiddleware, shopController.verifyShop);
router.put('/admin/:id/status', adminAuthMiddleware, shopController.updateShopStatus);

module.exports = router;
