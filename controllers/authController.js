const User = require('../models/userModel');
const authService = require('../services/authService');
const emailService = require('../services/emailService');
const { verifyGoogleIdToken } = require('../services/googleAuthService');

exports.register = async (req, res) => {
  try {
    const { email, password, fullName, role } = req.body;
    
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }
    
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({ 
        message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' 
      });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await authService.hashPassword(password);
    
    const otp = emailService.generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const user = new User({
      email,
      password: hashedPassword,
      fullName: fullName,
      role: role || 'customer',
      otp: {
        code: otp,
        expiresAt: otpExpiry
      },
      lastOtpSent: new Date()
    });

    await user.save();

    const emailSent = await emailService.sendOTP(email, otp);
    if (!emailSent) {
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({ message: 'Failed to send verification email' });
    }

    res.status(201).json({ 
      message: 'Registration successful. Please check your email for verification code.',
      userId: user._id,
      needsVerification: true
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    if (!user.otp || user.otp.code !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > user.otp.expiresAt) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    user.isEmailVerified = true;
    user.otp = undefined;
    await user.save();

    const token = authService.generateToken(user);

    res.json({ 
      message: 'Email verified successfully',
      token,
      user: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (user.lastOtpSent && user.lastOtpSent > oneHourAgo && user.otpAttempts >= 3) {
      return res.status(429).json({ 
        message: 'Too many OTP requests. Please wait before requesting another code.' 
      });
    }

    const otp = emailService.generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = {
      code: otp,
      expiresAt: otpExpiry
    };
    user.otpAttempts = user.otpAttempts + 1;
    user.lastOtpSent = new Date();
    await user.save();

    const emailSent = await emailService.sendOTP(email, otp);
    if (!emailSent) {
      return res.status(500).json({ message: 'Failed to send verification email' });
    }

    res.json({ message: 'OTP resent successfully' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.isEmailVerified) {
      return res.status(400).json({ 
        message: 'Please verify your email before logging in',
        needsVerification: true
      });
    }

    const isMatch = await authService.comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = authService.generateToken(user);

    res.json({ 
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const otp = emailService.generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = {
      code: otp,
      expiresAt: otpExpiry
    };
    user.lastOtpSent = new Date();
    await user.save();

    const emailSent = await emailService.sendPasswordResetOTP(email, otp);
    if (!emailSent) {
      return res.status(500).json({ message: 'Failed to send reset email' });
    }

    res.json({ message: 'Password reset OTP sent successfully' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    if (!user.otp || user.otp.code !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > user.otp.expiresAt) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    const hashedPassword = await authService.hashPassword(newPassword);
    user.password = hashedPassword;
    user.otp = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.logout = (req, res) => {
  res.json({ message: 'Logged out successfully' });
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -otp');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    const decoded = authService.verifyToken(refreshToken);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const newToken = authService.generateToken(user);
    const newRefreshToken = authService.generateRefreshToken(user);

    res.json({
      message: 'Token refreshed successfully',
      token: newToken,
      refreshToken: newRefreshToken,
      user: {
        id: user._id,
        email: user.email,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

exports.googleSignIn = async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ message: 'ID token is required' });
    }

    const payload = await verifyGoogleIdToken(idToken);
    
    let user = await User.findOne({ googleId: payload.sub });
    
    if (!user) {
      user = await User.findOne({ email: payload.email });
      
      if (user) {
        user.googleId = payload.sub;
        user.name = payload.name;
        user.picture = payload.picture;
        user.isEmailVerified = true;
        await user.save();
      } else {
        user = new User({
          email: payload.email,
          googleId: payload.sub,
          name: payload.name,
          picture: payload.picture,
          isEmailVerified: true,
        });
        await user.save();
      }
    }

    const token = authService.generateToken(user);

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
    console.error('Google sign in error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}; 