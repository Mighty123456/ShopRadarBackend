const express = require('express');
const router = express.Router();
const SearchController = require('../controllers/searchController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// NLP-like product search (synonyms + scoring)
router.get('/products', SearchController.searchProducts);

// Shop search
router.get('/shops', SearchController.searchShops);

// Discovery feed (trending nearby offers/products)
router.get('/discover', SearchController.discover);

module.exports = router;


