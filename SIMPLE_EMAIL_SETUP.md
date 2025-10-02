# 📧 Simple Email Setup Guide

## 🚨 Quick Fix for SMTP Error

Your app is getting `Connection timeout` errors because email isn't configured properly. Here's the **easiest solution**:

### Step 1: Choose Email Provider

**🎯 RECOMMENDED: Brevo (Free & Reliable)**
- ✅ Free plan: 300 emails/day
- ✅ Easy setup
- ✅ Works great with Render

**Alternative: Gmail**
- ⚠️ Requires app password setup
- ⚠️ More complex configuration

### Step 2: Get Brevo Credentials (Recommended)

1. **Sign up** at [brevo.com](https://brevo.com) 
2. **Verify your email** address
3. Go to **SMTP & API** → **SMTP**
4. **Copy the SMTP key** (looks like: `xkeysib-xxx...`)
5. **Note your verified email** address

### Step 3: Set Environment Variables in Render

Go to your **Render Dashboard** → **Your Service** → **Environment** tab:

**For Brevo:**
```
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_USER=your-verified-email@yourdomain.com
EMAIL_PASSWORD=your-brevo-smtp-key
EMAIL_FROM=your-verified-email@yourdomain.com
```

**For Gmail:**
```
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-character-app-password
EMAIL_FROM=your-email@gmail.com
```

### Step 4: Redeploy

1. **Save** environment variables
2. **Redeploy** your service
3. **Check logs** for: `✅ Email service ready to send emails`

## 🧪 Test Your Setup

After setup, you should see in your logs:
```
✅ Email service ready to send emails
✅ OTP sent successfully to user@example.com
```

## 🆘 Troubleshooting

**Still getting errors?**

1. **Check spelling** of environment variables
2. **Verify Brevo SMTP key** is correct
3. **Check Render logs** for specific error messages
4. **Try Gmail** as backup option

## 📋 What Changed in Code

The email service is now **much simpler**:

- ✅ **Clear method names** (sendOTP, sendPasswordResetOTP)
- ✅ **Better error messages** with emojis
- ✅ **Separated HTML templates** for easier editing
- ✅ **Simple configuration** logic
- ✅ **Proper timeout settings** for Render

## 🔧 Code Structure

```
EmailService
├── setupEmailTransporter()    // Configure email
├── getEmailConfig()          // Get settings
├── testConnection()          // Test setup
├── generateOTP()             // Create 6-digit code
├── sendOTP()                 // Send verification email
├── sendPasswordResetOTP()    // Send reset email
├── sendShopVerification()    // Send approval email
└── sendEmail()              // Generic send method
```

**Your OTP emails should work now! 🎉**
