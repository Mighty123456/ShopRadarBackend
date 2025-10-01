const nodemailer = require('nodemailer');
const crypto = require('crypto');

class EmailService {
  constructor() {
    // Option 1: Gmail with better configuration
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      this.transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        },
        // Add these options for better delivery
        tls: {
          rejectUnauthorized: false
        },
        pool: true,
        maxConnections: 1,
        maxMessages: 3,
        rateDelta: 20000,
        rateLimit: 5
      });
      this.emailConfigured = true;
    } 
    // Option 2: SendGrid (uncomment to use)
    // else if (process.env.SENDGRID_API_KEY) {
    //   this.transporter = nodemailer.createTransporter({
    //     service: 'SendGrid',
    //     auth: {
    //       user: 'apikey',
    //       pass: process.env.SENDGRID_API_KEY
    //     }
    //   });
    //   this.emailConfigured = true;
    // }
    else {
      console.log('Email credentials not configured. Email functionality will be disabled.');
      this.emailConfigured = false;
    }
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
      from: {
        name: 'ShopRadar',
        address: process.env.EMAIL_USER
      },
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
      `,
      // Add text version for better delivery
      text: `ShopRadar Email Verification\n\nYour verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this verification, please ignore this email.`
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      return true;
    } catch (error) {
      console.error('Email sending error:', error);
      return false;
    }
  }

  // ... rest of the methods remain the same
}

module.exports = new EmailService();
