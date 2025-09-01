const jwt = require('jsonwebtoken');
const Admin = require('../models/adminModel');
const config = require('../config/config');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const generateToken = (adminId) => {
  return jwt.sign(
    { id: adminId, type: 'admin' },
    config.jwtSecret,
    { expiresIn: '30m' }
  );
};

const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (admin.isLocked()) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed login attempts. Please try again later.'
      });
    }

    if (!admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    const isPasswordValid = await admin.comparePassword(password);
    
    if (!isPasswordValid) {
      await admin.incLoginAttempts();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    await admin.resetLoginAttempts();

    admin.lastLogin = new Date();
    await admin.save();

    const token = generateToken(admin._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          lastLogin: admin.lastLogin
        }
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const adminLogout = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select('-password');
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          isActive: admin.isActive,
          lastLogin: admin.lastLogin,
          createdAt: admin.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    const admin = await Admin.findById(req.admin.id);
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);
    
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    admin.password = newPassword;
    await admin.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id);
    
    if (!admin || !admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    const newToken = generateToken(admin._id);

    res.status(200).json({
      success: true,
      data: {
        token: newToken
      }
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTPEmail = async (email, otp, adminName) => {
  try {
    if (!config.email.user || !config.email.password) {
      console.error('Email configuration missing. Please set EMAIL_USER and EMAIL_PASSWORD in .env file');
      return false;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.email.user,
        pass: config.email.password
      }
    });

    const mailOptions = {
      from: config.email.user,
      to: email,
      subject: 'ShopRadar Admin - Password Reset OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">ShopRadar Admin</h1>
          </div>
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">Password Reset Request</h2>
            <p style="color: #666; line-height: 1.6;">Hello ${adminName},</p>
            <p style="color: #666; line-height: 1.6;">You have requested to reset your password. Use the following OTP to proceed:</p>
            <div style="background: #fff; border: 2px dashed #667eea; border-radius: 10px; padding: 20px; margin: 30px 0; text-align: center;">
              <h1 style="color: #667eea; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
            </div>
            <p style="color: #666; line-height: 1.6;"><strong>This OTP will expire in 10 minutes.</strong></p>
            <p style="color: #666; line-height: 1.6;">If you didn't request this password reset, please ignore this email.</p>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
              <p style="color: #999; font-size: 12px;">This is an automated message from ShopRadar Admin Panel.</p>
            </div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin account not found with this email'
      });
    }

    if (!admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    admin.resetPasswordOTP = otp;
    admin.resetPasswordOTPExpiry = otpExpiry;
    await admin.save();

    const emailSent = await sendOTPEmail(email, otp, admin.name);
    
    if (!emailSent) {
      if (!config.email.user || !config.email.password) {
        return res.status(200).json({
          success: true,
          message: 'OTP sent to your email address',
          data: {
            otp: otp,
            message: 'Email service not configured. OTP included in response for testing.'
          }
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP email. Please try again.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent to your email address'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin account not found'
      });
    }

    if (!admin.resetPasswordOTP || admin.resetPasswordOTP !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    if (admin.resetPasswordOTPExpiry < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    admin.resetPasswordToken = resetToken;
    admin.resetPasswordTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);
    
    admin.resetPasswordOTP = undefined;
    admin.resetPasswordOTPExpiry = undefined;
    
    await admin.save();

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        resetToken
      }
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    const admin = await Admin.findOne({
      resetPasswordToken: resetToken,
      resetPasswordTokenExpiry: { $gt: new Date() }
    });
    
    if (!admin) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    admin.password = newPassword;
    
    admin.resetPasswordToken = undefined;
    admin.resetPasswordTokenExpiry = undefined;
    
    await admin.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  adminLogin,
  adminLogout,
  getAdminProfile,
  changePassword,
  refreshToken,
  forgotPassword,
  verifyOTP,
  resetPassword
};
