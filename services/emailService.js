const nodemailer = require('nodemailer');
const crypto = require('crypto');

class EmailService {
  constructor() {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASSWORD;
    const host = process.env.EMAIL_HOST;
    const port = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : undefined;
    const secure = typeof process.env.EMAIL_SECURE === 'string'
      ? process.env.EMAIL_SECURE.toLowerCase() === 'true'
      : undefined;
    const service = process.env.EMAIL_SERVICE || 'gmail';

    if (user && pass) {
      let transportOptions;
      if (host) {
        // Generic SMTP configuration (e.g., SendGrid/Mailgun/Brevo or custom SMTP)
        transportOptions = {
          host,
          port: port ?? 587,
          secure: secure ?? false,
          auth: { user, pass },
        };
      } else {
        // Service-based configuration (defaults to Gmail)
        transportOptions = {
          service,
          auth: { user, pass },
        };
      }

      this.transporter = nodemailer.createTransport(transportOptions);
      this.emailConfigured = true;

      // Attempt a connection verification at startup to surface misconfigurations early
      this.transporter.verify((err, success) => {
        if (err) {
          console.error('Email transporter verification failed:', err);
          this.emailConfigured = false;
        } else {
          console.log('Email transporter is ready:', success);
        }
      });
    } else {
      console.log('Email credentials not configured. Email functionality will be disabled.');
      this.emailConfigured = false;
    }
  }

  generateOTP() {
    // Generate a random 6-digit OTP
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
      subject: 'ShopRadar - Email Verification OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">ShopRadar</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Email Verification</p>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-bottom: 20px;">Verify Your Email Address</h2>
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              Thank you for registering with ShopRadar! To complete your registration, please use the verification code below:
            </p>
            <div style="background: #f8f9fa; border: 2px dashed #667eea; padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
              <h1 style="color: #667eea; font-size: 32px; margin: 0; letter-spacing: 5px; font-weight: bold;">${otp}</h1>
            </div>
            <p style="color: #666; line-height: 1.6; margin-bottom: 15px;">
              This code will expire in 10 minutes for security reasons.
            </p>
            <p style="color: #666; line-height: 1.6; margin-bottom: 0;">
              If you didn't request this verification, please ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
              This is an automated email from ShopRadar. Please do not reply to this email.
            </p>
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Email sending error:', error);
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
      subject: 'ShopRadar - Password Reset OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">ShopRadar</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Password Reset</p>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-bottom: 20px;">Reset Your Password</h2>
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              You requested a password reset for your ShopRadar account. Use the verification code below to reset your password:
            </p>
            <div style="background: #f8f9fa; border: 2px dashed #667eea; padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
              <h1 style="color: #667eea; font-size: 32px; margin: 0; letter-spacing: 5px; font-weight: bold;">${otp}</h1>
            </div>
            <p style="color: #666; line-height: 1.6; margin-bottom: 15px;">
              This code will expire in 10 minutes for security reasons.
            </p>
            <p style="color: #666; line-height: 1.6; margin-bottom: 0;">
              If you didn't request a password reset, please ignore this email and your password will remain unchanged.
            </p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
              This is an automated email from ShopRadar. Please do not reply to this email.
            </p>
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Email sending error:', error);
      return false;
    }
  }

  async sendShopVerificationNotification(email, shopName, status, notes = '') {
    if (!this.emailConfigured) {
      console.log(`Mock verification notification sent to ${email}: Shop ${shopName} ${status}`);
      return true;
    }

    const isApproved = status === 'approved';
    const subject = isApproved 
      ? 'ShopRadar - Shop Verification Approved! 🎉' 
      : 'ShopRadar - Shop Verification Update';

    const statusIcon = isApproved ? '✅' : '❌';
    const statusMessage = isApproved 
      ? 'Congratulations! Your shop has been approved and is now live on ShopRadar.'
      : 'We regret to inform you that your shop verification could not be approved at this time.';

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">ShopRadar</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Shop Verification Update</p>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="font-size: 48px; margin-bottom: 15px;">${statusIcon}</div>
              <h2 style="color: #333; margin-bottom: 10px;">Shop Verification ${isApproved ? 'Approved' : 'Update'}</h2>
              <p style="color: #666; font-size: 16px; margin: 0;">${shopName}</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
              <p style="color: #333; line-height: 1.6; margin: 0; font-size: 16px;">
                ${statusMessage}
              </p>
            </div>

            ${notes ? `
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
              <h3 style="color: #92400e; margin: 0 0 10px 0; font-size: 14px; font-weight: bold;">Admin Notes:</h3>
              <p style="color: #92400e; margin: 0; line-height: 1.5; font-size: 14px;">${notes}</p>
            </div>
            ` : ''}

            ${isApproved ? `
            <div style="background: #d1fae5; border: 1px solid #10b981; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
              <h3 style="color: #065f46; margin: 0 0 15px 0; font-size: 16px;">What's Next?</h3>
              <ul style="color: #065f46; margin: 0; padding-left: 20px; line-height: 1.6;">
                <li>Your shop is now visible to customers on ShopRadar</li>
                <li>You can start adding products and managing your shop</li>
                <li>Customers can now find and visit your shop</li>
                <li>You'll receive notifications for new orders and reviews</li>
              </ul>
            </div>
            ` : `
            <div style="background: #fee2e2; border: 1px solid #ef4444; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
              <h3 style="color: #991b1b; margin: 0 0 15px 0; font-size: 16px;">Next Steps:</h3>
              <ul style="color: #991b1b; margin: 0; padding-left: 20px; line-height: 1.6;">
                <li>Review the admin notes above for specific requirements</li>
                <li>Update your shop information if needed</li>
                <li>Ensure all required documents are properly uploaded</li>
                <li>You can reapply for verification once issues are resolved</li>
              </ul>
            </div>
            `}

            <div style="text-align: center; margin-top: 30px;">
              <a href="https://shopradar.app" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                ${isApproved ? 'Manage Your Shop' : 'Update Shop Information'}
              </a>
            </div>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>This is an automated message from ShopRadar. Please do not reply to this email.</p>
            <p>If you have questions, please contact our support team.</p>
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Error sending verification notification email:', error);
      return false;
    }
  }
}

module.exports = new EmailService();