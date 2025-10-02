# Email Configuration Guide for ShopRadar

This guide will help you fix the SMTP connection timeout error and get OTP emails working.

## 🚨 Quick Fix Steps

### Step 1: Set Environment Variables in Render

Go to your Render dashboard → Your Service → Environment tab and add these variables:

#### Option A: Brevo (Recommended - Most Reliable)
```
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@yourdomain.com
EMAIL_PASSWORD=your-brevo-smtp-key
EMAIL_FROM=noreply@yourdomain.com
```

#### Option B: Gmail (If you prefer Gmail)
```
GMAIL_USER=your-email@gmail.com
GMAIL_PASSWORD=your-16-character-app-password
EMAIL_FROM=your-email@gmail.com
```

### Step 2: Get Brevo Credentials (Recommended)

1. **Sign up** at [brevo.com](https://brevo.com) (free account)
2. **Verify your email** address
3. Go to **SMTP & API → SMTP**
4. Copy the **SMTP key**
5. Use your verified email as `EMAIL_USER`
6. Use the SMTP key as `EMAIL_PASSWORD`

### Step 3: Alternative - Gmail App Password

If you want to use Gmail:

1. **Enable 2-Factor Authentication** on your Gmail account
2. Go to **Google Account → Security → 2-Step Verification → App passwords**
3. Generate app password for **"Mail"**
4. Use the **16-character password** (not your regular password)

### Step 4: Deploy Updated Code

After setting environment variables:

1. **Redeploy** your service on Render
2. **Check logs** for "Email transporter is ready" message
3. **Test** OTP functionality

## 🔧 Code Changes Made

I've updated your email service with:

- ✅ **Increased timeout values** (60 seconds instead of default 10)
- ✅ **Better error logging** to debug issues
- ✅ **Connection pooling** for better performance
- ✅ **TLS configuration** for Gmail compatibility
- ✅ **Text fallback** for better email deliverability

## 🔄 Using the Robust Email Service (Optional)

For maximum reliability, you can switch to the robust email service that supports multiple providers:

1. **Rename** your current `emailService.js` to `emailService_backup.js`
2. **Rename** `emailService_robust.js` to `emailService.js`
3. **Set multiple provider credentials** for automatic fallback

## 🧪 Testing

After configuration, test with these commands in your app:

```javascript
// Test email configuration
const emailService = require('./services/emailService');
emailService.sendOTP('test@example.com', '123456');
```

## 📋 Environment Variables Summary

Set these in Render's Environment tab:

| Variable | Required | Description |
|----------|----------|-------------|
| `EMAIL_HOST` | Yes (Brevo) | SMTP server hostname |
| `EMAIL_PORT` | Yes (Brevo) | SMTP port (587) |
| `EMAIL_SECURE` | Yes (Brevo) | Use TLS (false for port 587) |
| `EMAIL_USER` | Yes | Your email address |
| `EMAIL_PASSWORD` | Yes | SMTP key/app password |
| `EMAIL_FROM` | Optional | From address (defaults to EMAIL_USER) |
| `GMAIL_USER` | Optional | Gmail address (backup) |
| `GMAIL_PASSWORD` | Optional | Gmail app password (backup) |
| `SENDGRID_API_KEY` | Optional | SendGrid API key (backup) |

## 🚨 Troubleshooting

### If emails still don't work:

1. **Check Render logs** for detailed error messages
2. **Verify email credentials** are correct
3. **Check spam folder** for test emails
4. **Try different email provider** (Brevo → Gmail → SendGrid)
5. **Contact email provider support** if credentials are verified

### Common Issues:

- **"Authentication failed"** → Wrong password/API key
- **"Connection timeout"** → Network/firewall issue
- **"Invalid login"** → Need app password for Gmail
- **"Rate limited"** → Too many emails sent

## 🆘 Emergency Solution

If nothing works, you can temporarily disable email verification:

```javascript
// In your auth controller, comment out email verification
// and directly mark users as verified for testing
```

**Remember to re-enable it before production!**
