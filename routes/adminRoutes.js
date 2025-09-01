const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');

router.post('/login', adminAuthController.adminLogin);
router.post('/forgot-password', adminAuthController.forgotPassword);
router.post('/verify-otp', adminAuthController.verifyOTP);
router.post('/reset-password', adminAuthController.resetPassword);

router.use(adminAuthMiddleware);

router.post('/logout', adminAuthController.adminLogout);
router.get('/profile', adminAuthController.getAdminProfile);
router.post('/change-password', adminAuthController.changePassword);
router.post('/refresh-token', adminAuthController.refreshToken);

module.exports = router;
