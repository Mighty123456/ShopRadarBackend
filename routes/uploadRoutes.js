const express = require('express');
const router = express.Router();
const { handleSingleFile, uploadHandler } = require('../controllers/uploadController');
const authMiddleware = require('../middleware/authMiddleware');

// Authenticated route; shop owners and admins can upload
router.post('/', authMiddleware, handleSingleFile, uploadHandler);

module.exports = router;


