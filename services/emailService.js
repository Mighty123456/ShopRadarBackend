const nodemailer = require('nodemailer');
const crypto = require('crypto');

class EmailService {
  constructor() {
    this.setupEmailTransporter();
  }

  setupEmailTransporter() {
    // Get email configuration from environment variables
    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_PASSWORD;
    
    // Check if we have basic email credentials
    if (!emailUser || !emailPassword) {
      console.log('❌ Email credentials not found. Email functionality disabled.');
      this.emailConfigured = false;
      return;
    }

    // Use the exact same Gmail configuration that works for admin emails
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPassword
      }
    });
    
    this.emailConfigured = true;
    console.log('✅ Email service configured with Gmail');

    // Test the email connection
    this.testConnection();
  }

  testConnection() {
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('❌ Email connection failed:', error.message);
        this.emailConfigured = false;
      } else {
        console.log('✅ Email service ready to send emails');
      }
    });
  }

  // Generate a random 6-digit OTP
  generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
  }

  // Send OTP email for user verification
  async sendOTP(email, otp) {
    const emailContent = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'ShopRadar - Your Verification Code',
      text: `Your ShopRadar verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
      html: this.createOTPEmailHTML(otp)
    };

    return await this.sendEmail(emailContent, 'OTP');
  }

  // Create HTML template for OTP email
  createOTPEmailHTML(otp) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: #667eea; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">ShopRadar</h1>
          <p style="margin: 10px 0 0 0;">Email Verification</p>
        </div>
        
        <!-- Content -->
        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333;">Verify Your Email</h2>
          <p style="color: #666; line-height: 1.6;">
            Thank you for registering with ShopRadar! Use this code to complete your registration:
          </p>
          
          <!-- OTP Code Box -->
          <div style="background: #f8f9fa; border: 2px dashed #667eea; padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
            <h1 style="color: #667eea; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
          </div>
          
          <p style="color: #666;">⏰ This code expires in 10 minutes</p>
          <p style="color: #999; font-size: 12px; text-align: center;">
            If you didn't request this, please ignore this email.
          </p>
        </div>
      </div>
    `;
  }

  // Generic email sending method
  async sendEmail(emailContent, type = 'email') {
    // If email is not configured, log for development and return success
    if (!this.emailConfigured) {
      console.log(`📧 Mock ${type} sent to ${emailContent.to} (email not configured)`);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DEV ONLY] Email content:`, emailContent.subject);
      }
      return true;
    }

    try {
      const result = await this.transporter.sendMail(emailContent);
      console.log(`✅ ${type} sent successfully to ${emailContent.to}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send ${type} to ${emailContent.to}:`, error.message);
      return false;
    }
  }

  // Send password reset OTP
  async sendPasswordResetOTP(email, otp) {
    const emailContent = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'ShopRadar - Password Reset Code',
      text: `Your ShopRadar password reset code is: ${otp}\n\nThis code expires in 10 minutes.`,
      html: this.createPasswordResetHTML(otp)
    };

    return await this.sendEmail(emailContent, 'Password Reset');
  }

  // Create HTML template for password reset email
  createPasswordResetHTML(otp) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: #667eea; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">ShopRadar</h1>
          <p style="margin: 10px 0 0 0;">Password Reset</p>
        </div>
        
        <!-- Content -->
        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333;">Reset Your Password</h2>
          <p style="color: #666; line-height: 1.6;">
            You requested a password reset. Use this code to create a new password:
          </p>
          
          <!-- OTP Code Box -->
          <div style="background: #f8f9fa; border: 2px dashed #667eea; padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
            <h1 style="color: #667eea; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
          </div>
          
          <p style="color: #666;">⏰ This code expires in 10 minutes</p>
          <p style="color: #999; font-size: 12px; text-align: center;">
            If you didn't request this, please ignore this email.
          </p>
        </div>
      </div>
    `;
  }

  // Send shop verification notification (approved/rejected)
  async sendShopVerificationNotification(email, shopName, status, notes = '') {
    const isApproved = status === 'approved';
    const subject = isApproved 
      ? 'ShopRadar - Shop Approved! 🎉' 
      : 'ShopRadar - Shop Verification Update';

    const emailContent = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: subject,
      text: this.createShopVerificationText(shopName, status, notes),
      html: this.createShopVerificationHTML(shopName, status, notes)
    };

    return await this.sendEmail(emailContent, 'Shop Verification');
  }

  // Create text version for shop verification
  createShopVerificationText(shopName, status, notes) {
    const isApproved = status === 'approved';
    let text = `ShopRadar - Shop Verification Update\n\n`;
    text += `Shop: ${shopName}\n`;
    text += `Status: ${isApproved ? 'APPROVED' : 'NEEDS ATTENTION'}\n\n`;
    
    if (isApproved) {
      text += `Congratulations! Your shop has been approved and is now live on ShopRadar.\n\n`;
      text += `What's next:\n`;
      text += `- Your shop is now visible to customers\n`;
      text += `- You can start adding products\n`;
      text += `- Customers can find and visit your shop\n`;
    } else {
      text += `Your shop verification needs attention.\n\n`;
      if (notes) {
        text += `Admin notes: ${notes}\n\n`;
      }
      text += `Please update your shop information and resubmit for verification.\n`;
    }
    
    return text;
  }

  // Create HTML template for shop verification
  createShopVerificationHTML(shopName, status, notes) {
    const isApproved = status === 'approved';
    const statusIcon = isApproved ? '✅' : '⚠️';
    const statusColor = isApproved ? '#10b981' : '#f59e0b';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: #667eea; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">ShopRadar</h1>
          <p style="margin: 10px 0 0 0;">Shop Verification</p>
        </div>
        
        <!-- Content -->
        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
          <!-- Status -->
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 48px; margin-bottom: 15px;">${statusIcon}</div>
            <h2 style="color: #333;">${shopName}</h2>
            <p style="color: ${statusColor}; font-size: 18px; font-weight: bold;">
              ${isApproved ? 'APPROVED' : 'NEEDS ATTENTION'}
            </p>
          </div>
          
          <!-- Message -->
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
            <p style="color: #333; line-height: 1.6; margin: 0;">
              ${isApproved 
                ? 'Congratulations! Your shop has been approved and is now live on ShopRadar.' 
                : 'Your shop verification needs attention. Please review the details below.'}
            </p>
          </div>

          <!-- Admin Notes -->
          ${notes ? `
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
            <h3 style="color: #92400e; margin: 0 0 10px 0;">Admin Notes:</h3>
            <p style="color: #92400e; margin: 0; line-height: 1.5;">${notes}</p>
          </div>
          ` : ''}

          <!-- Action Button -->
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://shopradar.app" style="display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              ${isApproved ? '🏪 Manage Your Shop' : '📝 Update Information'}
            </a>
          </div>
          
          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
            This is an automated email. Please don't reply to this email.
          </p>
        </div>
      </div>
    `;
  }
}

module.exports = new EmailService();