const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');
const authMiddleware = require('../middleware/authMiddleware');

// Public product search
router.get('/search', productController.searchProductsPublic);

// Enhanced product search with shops and offers
router.get('/search-with-shops', productController.searchProductsWithShopsAndOffers);

// Business dashboard: Product image upload (for shopkeepers only)
router.post('/upload-image', authMiddleware, productController.uploadProductImage);

// All product routes require admin authentication
router.use(adminAuthMiddleware);

// Get all products with pagination and filtering
router.get('/admin/all', productController.getAllProducts);

// Get product statistics
router.get('/admin/stats', productController.getProductStats);

// Get popular categories
router.get('/admin/popular-categories', productController.getPopularCategories);

// Get product by ID
router.get('/admin/:id', productController.getProductById);

// Update product status
router.put('/admin/:id/status', productController.updateProductStatus);

module.exports = router;
