const express = require('express');
const router = express.Router();
// Removed Google OAuth via passport
const authService = require('../services/authService');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/register', authController.register);
router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/google', authController.googleSignIn);
// Removed legacy Google sign-in endpoint

// Removed Google OAuth routes
router.post('/refresh-token', authController.refreshToken);

router.post('/logout', authMiddleware, authController.logout);
router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router; 