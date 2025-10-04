const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const authMiddleware = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Category routes
router.post('/', categoryController.createCategory);
router.get('/', categoryController.getCategories);
router.get('/hierarchy', categoryController.getCategoryHierarchy);
router.put('/:categoryId', categoryController.updateCategory);
router.delete('/:categoryId', categoryController.deleteCategory);

// Brand routes
router.post('/:categoryId/brands', categoryController.addBrand);
router.get('/:categoryId/brands', categoryController.getBrands);

module.exports = router;
