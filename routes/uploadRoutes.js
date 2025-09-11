const express = require('express');
const router = express.Router();
const { handleSingleFile, uploadHandler } = require('../controllers/uploadController');
const authMiddleware = require('../middleware/authMiddleware');

// Public route for registration file uploads
router.post('/public', handleSingleFile, uploadHandler);

// Authenticated route; shop owners and admins can upload
router.post('/', authMiddleware, handleSingleFile, uploadHandler);

module.exports = router;


