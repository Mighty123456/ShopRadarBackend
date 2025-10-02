const nodemailer = require('nodemailer');
const crypto = require('crypto');

class EmailService {
  constructor() {
    this.setupEmailTransporter();
  }

  setupEmailTransporter() {
    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_PASSWORD;
    const emailHost = process.env.EMAIL_HOST;
    const emailPort = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : undefined;
    const emailSecure = process.env.EMAIL_SECURE === 'true';
    
    if (!emailUser || !emailPassword) {
      console.log('Email credentials not configured');
      this.emailConfigured = false;
      return;
    }

    // Prefer explicit SMTP host if provided (e.g., smtp.gmail.com)
    if (emailHost) {
      this.transporter = nodemailer.createTransport({
        host: emailHost,
        port: emailPort || 587,
        secure: emailPort === 465 || emailSecure, // true for 465, false for 587
        auth: {
          user: emailUser,
          pass: emailPassword
        },
        connectionTimeout: 30000,
        greetingTimeout: 20000,
        socketTimeout: 30000,
        pool: true,
        maxConnections: 1,
        maxMessages: 5,
        tls: {
          rejectUnauthorized: false
        }
      });
    } else {
      // Fallback to Gmail service shortcut
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPassword
        },
        connectionTimeout: 30000,
        greetingTimeout: 20000,
        socketTimeout: 30000,
        pool: true,
        maxConnections: 1,
        maxMessages: 5,
        tls: {
          rejectUnauthorized: false
        }
      });
    }
    
    this.emailConfigured = true;
    console.log('Email service configured');
  }

  generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
  }

  async sendOTP(email, otp) {
    if (!this.emailConfigured) {
      console.log(`Mock OTP sent to ${email}: ${otp}`);
      return true;
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'ShopRadar - Your Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #667eea; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">ShopRadar</h1>
            <p style="margin: 10px 0 0 0;">Email Verification</p>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333;">Verify Your Email</h2>
            <p style="color: #666;">Use this code to complete your registration:</p>
            <div style="background: #f8f9fa; border: 2px dashed #667eea; padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
              <h1 style="color: #667eea; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
            </div>
            <p style="color: #666;">This code expires in 10 minutes</p>
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`OTP sent to ${email}`);
      return true;
    } catch (error) {
      console.error(`Failed to send OTP: ${error.message}`);
      return false;
    }
  }

  async sendPasswordResetOTP(email, otp) {
    if (!this.emailConfigured) {
      console.log(`Mock Password Reset OTP sent to ${email}: ${otp}`);
      return true;
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'ShopRadar - Password Reset Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #667eea; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">ShopRadar</h1>
            <p style="margin: 10px 0 0 0;">Password Reset</p>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333;">Reset Your Password</h2>
            <p style="color: #666;">Use this code to create a new password:</p>
            <div style="background: #f8f9fa; border: 2px dashed #667eea; padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
              <h1 style="color: #667eea; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
            </div>
            <p style="color: #666;">This code expires in 10 minutes</p>
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Password reset OTP sent to ${email}`);
      return true;
    } catch (error) {
      console.error(`Failed to send password reset OTP: ${error.message}`);
      return false;
    }
  }

  async sendShopVerificationNotification(email, shopName, status, notes = '') {
    if (!this.emailConfigured) {
      console.log(`Mock shop verification sent to ${email}: ${shopName} ${status}`);
      return true;
    }

    const isApproved = status === 'approved';
    const subject = isApproved ? 'ShopRadar - Shop Approved!' : 'ShopRadar - Shop Verification Update';

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #667eea; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">ShopRadar</h1>
            <p style="margin: 10px 0 0 0;">Shop Verification</p>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="font-size: 48px; margin-bottom: 15px;">${isApproved ? '✅' : '⚠️'}</div>
              <h2 style="color: #333;">${shopName}</h2>
              <p style="color: ${isApproved ? '#10b981' : '#f59e0b'}; font-size: 18px; font-weight: bold;">
                ${isApproved ? 'APPROVED' : 'NEEDS ATTENTION'}
              </p>
            </div>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
              <p style="color: #333; margin: 0;">
                ${isApproved 
                  ? 'Congratulations! Your shop has been approved and is now live on ShopRadar.' 
                  : 'Your shop verification needs attention. Please review the details below.'}
              </p>
            </div>
            ${notes ? `<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
              <h3 style="color: #92400e; margin: 0 0 10px 0;">Admin Notes:</h3>
              <p style="color: #92400e; margin: 0;">${notes}</p>
            </div>` : ''}
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Shop verification email sent to ${email}`);
      return true;
    } catch (error) {
      console.error(`Failed to send shop verification email: ${error.message}`);
      return false;
    }
  }
}

module.exports = new EmailService();