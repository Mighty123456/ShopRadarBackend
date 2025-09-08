const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');

// All product routes require admin authentication
router.use(adminAuthMiddleware);

// Get all products with pagination and filtering
router.get('/admin/all', productController.getAllProducts);

// Get product statistics
router.get('/admin/stats', productController.getProductStats);

// Get product by ID
router.get('/admin/:id', productController.getProductById);

// Update product status
router.put('/admin/:id/status', productController.updateProductStatus);

module.exports = router;
