const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');
const productController = require('../controllers/productController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const shopOwnershipMiddleware = require('../middleware/shopOwnershipMiddleware');
const requireApprovedShop = require('../middleware/requireApprovedShop');

// Public routes (for customers)
router.get('/nearby', shopController.getShopsNearLocation);
router.get('/search', shopController.searchShopsPublic);

// Shop owner routes (require shop owner authentication)
router.get('/my-shop', authMiddleware, shopOwnershipMiddleware, shopController.getMyShop);
router.put('/my-shop', authMiddleware, shopOwnershipMiddleware, shopController.updateMyShop);
router.put('/my-shop/status', authMiddleware, shopOwnershipMiddleware, requireApprovedShop, shopController.updateMyShopStatus);
router.get('/my-shop/stats', authMiddleware, shopOwnershipMiddleware, shopController.getMyShopStats);
router.get('/my-shop/verification', authMiddleware, shopOwnershipMiddleware, shopController.getMyShopVerificationStatus);
router.post('/my-shop/submit-gps', authMiddleware, shopOwnershipMiddleware, shopController.submitGpsAndVerifyAddress);
router.post('/my-shop/ocr-license', authMiddleware, shopOwnershipMiddleware, shopController.ocrAndValidateLicense);
router.post('/my-shop/upload-photo', authMiddleware, shopOwnershipMiddleware, shopController.uploadShopPhotoAndCheckExif);

// Shop owner product management routes
router.get('/products', authMiddleware, shopOwnershipMiddleware, requireApprovedShop, productController.getMyProducts);
router.put('/products/:id', authMiddleware, shopOwnershipMiddleware, requireApprovedShop, productController.updateMyProduct);
router.delete('/products/:id', authMiddleware, shopOwnershipMiddleware, requireApprovedShop, productController.deleteMyProduct);

// Unified product + offer creation route
router.post('/products/unified', authMiddleware, shopOwnershipMiddleware, requireApprovedShop, productController.createProductWithOffer);

// Admin routes (require admin authentication)
router.get('/admin/all', adminAuthMiddleware, shopController.getAllShops);
router.get('/admin/stats', adminAuthMiddleware, shopController.getShopStats);
router.get('/admin/:id', adminAuthMiddleware, shopController.getShopById);
router.put('/admin/:id/verify', adminAuthMiddleware, shopController.verifyShop);
router.put('/admin/:id/status', adminAuthMiddleware, shopController.updateShopStatus);

module.exports = router;
