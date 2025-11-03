const express = require('express');
const router = express.Router();
const passport = require('passport');
const authService = require('../services/authService');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/register', authController.register);
router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/google-signin', authController.googleSignIn);

// Backend-driven Google OAuth for mobile/web
router.get('/google', (req, res, next) => {
  // store optional redirect_uri in session to use after callback
  if (req.query.redirect_uri) {
    req.session.redirectUri = req.query.redirect_uri;
  }
  next();
}, passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' }));

router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/api/auth/google/failure' }), async (req, res) => {
  try {
    const user = req.user;
    const token = authService.generateToken(user);
    const redirectUri = req.session.redirectUri;
    if (redirectUri) {
      const payload = encodeURIComponent(JSON.stringify({
        id: user._id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        isEmailVerified: user.isEmailVerified
      }));
      return res.redirect(`${redirectUri}?token=${token}&user=${payload}`);
    }
    res.json({
      message: 'Google sign in successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (err) {
    console.error('Google callback error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/google/failure', (req, res) => {
  res.status(401).json({ message: 'Google authentication failed' });
});
router.post('/refresh-token', authController.refreshToken);

router.post('/logout', authMiddleware, authController.logout);
router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router; 