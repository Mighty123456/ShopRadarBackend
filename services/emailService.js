const nodemailer = require('nodemailer');
const crypto = require('crypto');

class EmailService {
  constructor() {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASSWORD;
    const host = process.env.EMAIL_HOST; // e.g., smtp.mailtrap.io, smtp.gmail.com, smtp.sendgrid.net
    const port = process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : undefined; // e.g., 2525, 587, 465
    const secure = process.env.EMAIL_SECURE === 'true'; // true for 465, false for 587/2525
    this.fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@shopradar.app';
    this.resendApiKey = process.env.RESEND_API_KEY; // HTTPS fallback (no SMTP needed)

    if (user && pass) {
      // Prefer explicit SMTP host if provided; otherwise fall back to Gmail service
      const transportOptions = host
        ? {
            host,
            port: port ?? 587,
            secure, // use TLS directly for port 465
            auth: { user, pass },
            pool: true,
            maxConnections: 3,
            maxMessages: 50,
            connectionTimeout: 15000, // 15s connect timeout
            greetingTimeout: 10000,   // 10s EHLO timeout
            socketTimeout: 20000,     // 20s overall socket inactivity
            keepAlive: true,
            tls: { rejectUnauthorized: false },
          }
        : {
            service: 'gmail',
            auth: { user, pass },
            pool: true,
            maxConnections: 3,
            maxMessages: 50,
            connectionTimeout: 15000,
            greetingTimeout: 10000,
            socketTimeout: 20000,
            keepAlive: true,
          };

      this.transporter = nodemailer.createTransport(transportOptions);
      this.emailConfigured = true;
    } else {
      console.log('Email credentials not configured. Email functionality will be disabled.');
      this.emailConfigured = false;
    }
  }

  async sendViaSMTP(mailOptions) {
    if (!this.transporter) return false;
    try {
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      throw error;
    }
  }

  async sendViaResend({ to, subject, html, text }) {
    if (!this.resendApiKey) return false;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
          text
        })
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Resend API error: ${res.status} ${res.statusText} ${body}`);
      }
      return true;
    } catch (error) {
      console.error('Resend sending error:', error);
      return false;
    }
  }

  generateOTP() {
    // Generate a random 6-digit OTP
    return crypto.randomInt(100000, 999999).toString();
  }

  async sendOTP(email, otp) {
    const subject = 'ShopRadar - Email Verification OTP';
    const html = `
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
      `;
    const text = `ShopRadar Email Verification\n\nYour verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this verification, please ignore this email.`;

    const mailOptions = {
      from: this.fromEmail,
      to: email,
      subject,
      html
    };

    // Try send with one quick retry on transient network errors
    try {
      if (!this.emailConfigured) throw Object.assign(new Error('SMTP not configured'), { code: 'SMTP_DISABLED' });
      await this.sendViaSMTP(mailOptions);
      return true;
    } catch (error) {
      console.error('Email sending error (first attempt):', error);
      const transient = error && (error.code === 'ETIMEDOUT' || error.code === 'ECONNECTION' || error.code === 'EAI_AGAIN');
      if (transient) {
        try {
          await new Promise((r) => setTimeout(r, 1000));
          await this.sendViaSMTP(mailOptions);
          return true;
        } catch (err2) {
          console.error('Email sending error (retry):', err2);
        }
      }
      // Fallback to HTTPS provider if configured
      const fallbackOk = await this.sendViaResend({ to: email, subject, html, text });
      if (fallbackOk) return true;
      return false;
    }
  }

  async sendPasswordResetOTP(email, otp) {
    const subject = 'ShopRadar - Password Reset OTP';
    const html = `
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
      `;
    const text = `ShopRadar Password Reset\n\nYour reset code is: ${otp}\n\nThis code will expire in 10 minutes.`;

    const mailOptions = {
      from: this.fromEmail,
      to: email,
      subject,
      html
    };

    try {
      if (!this.emailConfigured) throw Object.assign(new Error('SMTP not configured'), { code: 'SMTP_DISABLED' });
      await this.sendViaSMTP(mailOptions);
      return true;
    } catch (error) {
      console.error('Email sending error:', error);
      const fallbackOk = await this.sendViaResend({ to: email, subject, html, text });
      if (fallbackOk) return true;
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
      from: this.fromEmail,
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
      if (!this.emailConfigured) throw Object.assign(new Error('SMTP not configured'), { code: 'SMTP_DISABLED' });
      await this.sendViaSMTP(mailOptions);
      return true;
    } catch (error) {
      console.error('Error sending verification notification email:', error);
      const text = `${isApproved ? 'Approved' : 'Update'} for ${shopName}. ${notes ? `Notes: ${notes}` : ''}`;
      const fallbackOk = await this.sendViaResend({ to: email, subject, html: mailOptions.html, text });
      if (fallbackOk) return true;
      return false;
    }
  }
}

module.exports = new EmailService(); 