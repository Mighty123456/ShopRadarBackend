const nodemailer = require('nodemailer');
const crypto = require('crypto');

class RobustEmailService {
  constructor() {
    this.transporters = [];
    this.emailConfigured = false;
    this.currentTransporterIndex = 0;
    
    this.setupTransporters();
  }

  setupTransporters() {
    // Primary: Brevo (most reliable for transactional emails)
    if (process.env.EMAIL_HOST === 'smtp-relay.brevo.com' && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      this.transporters.push({
        name: 'Brevo',
        transporter: nodemailer.createTransporter({
          host: 'smtp-relay.brevo.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000,
          pool: true,
          maxConnections: 5,
          maxMessages: 10,
        })
      });
    }

    // Secondary: Gmail
    if (process.env.GMAIL_USER && process.env.GMAIL_PASSWORD) {
      this.transporters.push({
        name: 'Gmail',
        transporter: nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASSWORD
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000,
          tls: {
            rejectUnauthorized: false
          }
        })
      });
    }

    // Tertiary: SendGrid
    if (process.env.SENDGRID_API_KEY) {
      this.transporters.push({
        name: 'SendGrid',
        transporter: nodemailer.createTransporter({
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: {
            user: 'apikey',
            pass: process.env.SENDGRID_API_KEY
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000,
        })
      });
    }

    // Fallback: Generic SMTP (for custom configurations)
    if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      this.transporters.push({
        name: 'Custom SMTP',
        transporter: nodemailer.createTransporter({
          host: process.env.EMAIL_HOST,
          port: parseInt(process.env.EMAIL_PORT) || 587,
          secure: process.env.EMAIL_SECURE === 'true',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000,
        })
      });
    }

    if (this.transporters.length === 0) {
      console.log('⚠️  No email providers configured. Email functionality will be disabled.');
      this.emailConfigured = false;
      return;
    }

    this.emailConfigured = true;
    console.log(`✅ ${this.transporters.length} email provider(s) configured: ${this.transporters.map(t => t.name).join(', ')}`);
    
    // Verify all transporters
    this.verifyTransporters();
  }

  async verifyTransporters() {
    for (let i = 0; i < this.transporters.length; i++) {
      const { name, transporter } = this.transporters[i];
      try {
        await transporter.verify();
        console.log(`✅ ${name} email service verified successfully`);
      } catch (error) {
        console.error(`❌ ${name} email service verification failed:`, error.message);
      }
    }
  }

  async sendEmailWithFallback(mailOptions, purpose = 'email') {
    if (!this.emailConfigured) {
      console.log(`📧 Mock ${purpose} sent to ${mailOptions.to}`);
      return true;
    }

    for (let attempt = 0; attempt < this.transporters.length; attempt++) {
      const currentIndex = (this.currentTransporterIndex + attempt) % this.transporters.length;
      const { name, transporter } = this.transporters[currentIndex];
      
      try {
        console.log(`📤 Attempting to send ${purpose} via ${name}...`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ ${purpose} sent successfully via ${name}:`, info.messageId);
        
        // Update current transporter index for next use
        this.currentTransporterIndex = currentIndex;
        return true;
      } catch (error) {
        console.error(`❌ Failed to send ${purpose} via ${name}:`, error.message);
        
        // If this was the last attempt, log the failure
        if (attempt === this.transporters.length - 1) {
          console.error(`💔 All email providers failed for ${purpose} to ${mailOptions.to}`);
        }
      }
    }
    
    return false;
  }

  generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
  }

  async sendOTP(email, otp) {
    const mailOptions = {
      from: {
        name: 'ShopRadar',
        address: process.env.EMAIL_FROM || process.env.EMAIL_USER || process.env.GMAIL_USER
      },
      to: email,
      subject: 'ShopRadar - Email Verification OTP',
      text: `ShopRadar Email Verification\n\nYour verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this verification, please ignore this email.`,
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

    return await this.sendEmailWithFallback(mailOptions, 'OTP email');
  }

  async sendPasswordResetOTP(email, otp) {
    const mailOptions = {
      from: {
        name: 'ShopRadar',
        address: process.env.EMAIL_FROM || process.env.EMAIL_USER || process.env.GMAIL_USER
      },
      to: email,
      subject: 'ShopRadar - Password Reset OTP',
      text: `ShopRadar Password Reset\n\nYour password reset code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this reset, please ignore this email.`,
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

    return await this.sendEmailWithFallback(mailOptions, 'Password reset email');
  }

  // Health check method
  async healthCheck() {
    const results = {};
    for (const { name, transporter } of this.transporters) {
      try {
        await transporter.verify();
        results[name] = 'healthy';
      } catch (error) {
        results[name] = `error: ${error.message}`;
      }
    }
    return results;
  }
}

module.exports = new RobustEmailService();
