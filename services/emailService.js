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
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
        pool: true,
        maxConnections: 1,
        maxMessages: 5,
        // For STARTTLS on 587, explicitly require TLS handshake
        requireTLS: (emailPort || 587) === 587 && !(emailPort === 465 || emailSecure),
        // Force IPv4 to avoid IPv6 issues on some hosts
        family: 4,
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
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
        pool: true,
        maxConnections: 1,
        maxMessages: 5,
        requireTLS: true,
        family: 4,
        tls: {
          rejectUnauthorized: false
        }
      });
    }
    
    this.emailConfigured = true;
    console.log('Email service configured');
  }

  // Build an alternative Gmail SMTP transporter that flips between 587 STARTTLS and 465 implicit TLS
  _buildAltGmailTransport() {
    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_PASSWORD;
    const emailHost = process.env.EMAIL_HOST;
    const emailPort = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : undefined;
    const primaryIsGmail = emailHost === 'smtp.gmail.com' || !emailHost;
    if (!primaryIsGmail) return null;

    const primaryIs465 = emailHost === 'smtp.gmail.com' && (emailPort === 465 || process.env.EMAIL_SECURE === 'true');
    const altIs465 = !primaryIs465;
    return require('nodemailer').createTransport({
      host: 'smtp.gmail.com',
      port: altIs465 ? 465 : 587,
      secure: altIs465,
      requireTLS: !altIs465,
      auth: {
        user: emailUser,
        pass: emailPassword
      },
      connectionTimeout: 45000,
      greetingTimeout: 25000,
      socketTimeout: 45000,
      pool: true,
      maxConnections: 1,
      maxMessages: 5,
      family: 4,
      tls: { rejectUnauthorized: false, servername: 'smtp.gmail.com' },
      logger: process.env.NODEMAILER_DEBUG === 'true',
      debug: process.env.NODEMAILER_DEBUG === 'true'
    });
  }

  async _sendWithRetry(mailOptions, purposeLabel) {
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempting to send ${purposeLabel} (attempt ${attempt}/${maxRetries})...`);
        await this.transporter.sendMail(mailOptions);
        console.log(`✅ ${purposeLabel} sent successfully to ${mailOptions.to}`);
        return true;
      } catch (error) {
        lastError = error;
        console.error(`❌ Attempt ${attempt} failed for ${purposeLabel}: ${error.message}`);
        
        // If it's a timeout/connection error and we have retries left, try alternative transport
        if (attempt < maxRetries && /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN/i.test(error.message)) {
          const alt = this._buildAltGmailTransport();
          if (alt) {
            try {
              console.warn(`🔄 Retrying ${purposeLabel} with alternative Gmail SMTP settings (attempt ${attempt + 1}/${maxRetries})...`);
              await alt.sendMail(mailOptions);
              console.log(`✅ ${purposeLabel} sent successfully to ${mailOptions.to} on retry`);
              return true;
            } catch (retryError) {
              console.error(`❌ Alternative transport retry failed for ${purposeLabel}: ${retryError.message}`);
              lastError = retryError;
            }
          }
        }
        
        // Wait before next retry (exponential backoff)
        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    console.error(`❌ All ${maxRetries} attempts failed for ${purposeLabel}. Last error: ${lastError?.message}`);
    return false;
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

    return this._sendWithRetry(mailOptions, 'OTP');
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

    return this._sendWithRetry(mailOptions, 'Password reset OTP');
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

    return this._sendWithRetry(mailOptions, 'Shop verification email');
  }

  async sendSubscriptionApprovalEmail(email, shopName, planType, endDate) {
    if (!this.emailConfigured) {
      console.log(`Mock subscription approval sent to ${email}: ${shopName} - ${planType}`);
      return true;
    }

    const formattedEndDate = new Date(endDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'ShopRadar - Subscription Approved!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #667eea; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">ShopRadar</h1>
            <p style="margin: 10px 0 0 0;">Subscription Approved</p>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="font-size: 48px; margin-bottom: 15px;">🎉</div>
              <h2 style="color: #333;">Congratulations!</h2>
              <p style="color: #10b981; font-size: 18px; font-weight: bold;">
                Your Subscription Has Been Approved
              </p>
            </div>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
              <p style="color: #333; margin: 0 0 10px 0;"><strong>Shop Name:</strong> ${shopName}</p>
              <p style="color: #333; margin: 0 0 10px 0;"><strong>Plan:</strong> ${planType.charAt(0).toUpperCase() + planType.slice(1)}</p>
              <p style="color: #333; margin: 0;"><strong>Valid Until:</strong> ${formattedEndDate}</p>
            </div>
            <div style="background: #e0f2fe; border-left: 4px solid #0ea5e9; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
              <h3 style="color: #0c4a6e; margin: 0 0 10px 0;">What's Next?</h3>
              <p style="color: #0c4a6e; margin: 0;">
                You can now promote your offers to get more visibility! Go to your dashboard and start promoting your offers to reach more customers.
              </p>
            </div>
            <div style="text-align: center; margin-top: 30px;">
              <a href="#" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Go to Dashboard
              </a>
            </div>
          </div>
        </div>
      `
    };

    return this._sendWithRetry(mailOptions, 'Subscription approval email');
  }

  async sendSubscriptionRejectionEmail(email, shopName, reason) {
    if (!this.emailConfigured) {
      console.log(`Mock subscription rejection sent to ${email}: ${shopName}`);
      return true;
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'ShopRadar - Subscription Request Update',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #667eea; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">ShopRadar</h1>
            <p style="margin: 10px 0 0 0;">Subscription Request</p>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="font-size: 48px; margin-bottom: 15px;">📋</div>
              <h2 style="color: #333;">${shopName}</h2>
              <p style="color: #f59e0b; font-size: 18px; font-weight: bold;">
                Subscription Request Needs Attention
              </p>
            </div>
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
              <h3 style="color: #92400e; margin: 0 0 10px 0;">Admin Notes:</h3>
              <p style="color: #92400e; margin: 0;">${reason}</p>
            </div>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
              <p style="color: #333; margin: 0;">
                Please review the admin notes above and resubmit your subscription request with the necessary corrections.
              </p>
            </div>
          </div>
        </div>
      `
    };

    return this._sendWithRetry(mailOptions, 'Subscription rejection email');
  }
}

module.exports = new EmailService();