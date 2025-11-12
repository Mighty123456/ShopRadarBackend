# Firebase Cloud Messaging (FCM) Setup Guide

## 📱 Push Notification System for New Offers

This guide explains how to set up Firebase Cloud Messaging for sending push notifications when new offers (special deals and featured offers) are created.

---

## 🔧 Setup Steps

### **1. Install Dependencies**

```bash
cd backend_node
npm install firebase-admin
```

### **2. Get Firebase Service Account Key**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one)
3. Go to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Download the JSON file

### **3. Configure Environment Variables**

Add to your `.env` file:

**Option 1: Service Account JSON (Recommended for local development)**
```env
# Convert the JSON file to a single line and escape quotes
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project-id",...}
```

**Option 2: Project ID (For cloud deployments like Vercel/Render)**
```env
FIREBASE_PROJECT_ID=your-firebase-project-id
```

**Option 3: Individual Credentials**
```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
```

---

## 🎯 How It Works

### **Automatic Notifications**

When a new offer is created, the system automatically:

1. **Checks if offer is special/featured:**
   - Special Deals: `isCustomOffer === true`
   - Featured Offers: `discountValue > 20%` OR `isPromoted === true`

2. **Sends notifications to users with preferences enabled:**
   - Special Deals → Users with `preferences.specialDeals === true`
   - Featured Offers → Users with `preferences.featuredOffers === true`

3. **Notification content:**
   - **Title:** "🔥 Special Deal Alert!" or "⭐ Featured Offer!"
   - **Body:** "{Offer Title} - {Discount} OFF at {Shop Name}"
   - **Data:** Includes offerId, shopId, discount details

### **User Preferences**

Users can control which notifications they receive:
- `newOffers` - General new offers
- `specialDeals` - Special/custom deals
- `featuredOffers` - Featured offers (high discounts)
- `priceDrops` - Price drop alerts (future)
- `restocks` - Product restock alerts (future)
- `nearbyOffers` - Nearby offer alerts (future)

---

## 📡 API Endpoints

### **Register Device Token**
```
POST /api/notifications/register-device
Authorization: Bearer {user_token}

Body:
{
  "token": "fcm_device_token",
  "platform": "android" | "ios" | "web",
  "appVersion": "1.0.0",
  "deviceInfo": {
    "model": "Pixel 7",
    "osVersion": "Android 13",
    "manufacturer": "Google"
  }
}
```

---

## 🔔 Notification Triggers

### **1. Special Deals (Custom Offers)**
- Triggered when: `isCustomOffer === true`
- Sent to: Users with `preferences.specialDeals === true`
- Example: "🔥 Special Deal Alert! - Weekend Sale - 30% OFF at ABC Shop"

### **2. Featured Offers**
- Triggered when: `discountValue > 20%` OR `isPromoted === true`
- Sent to: Users with `preferences.featuredOffers === true`
- Example: "⭐ Featured Offer! - Electronics Sale - 25% OFF at XYZ Shop"

---

## 🧪 Testing

### **Test Notification Sending:**

1. **Create a test offer:**
   ```bash
   POST /api/offers
   {
     "title": "Test Special Deal",
     "isCustomOffer": true,
     "discountValue": 30,
     "discountType": "Percentage",
     "startDate": "2024-01-01",
     "endDate": "2024-12-31"
   }
   ```

2. **Check logs:**
   - Should see: `📢 Sent push notification for new special deal: Test Special Deal`
   - Check Firebase Console → Cloud Messaging for delivery status

### **Test Device Registration:**

1. **Register device:**
   ```bash
   POST /api/notifications/register-device
   Authorization: Bearer {token}
   {
     "token": "test_fcm_token",
     "platform": "android"
   }
   ```

2. **Verify in database:**
   - Check `DeviceToken` collection
   - Token should be stored with user ID

---

## 🛠️ Troubleshooting

### **Issue: "Firebase not initialized"**
- **Solution:** Check environment variables are set correctly
- Verify `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_PROJECT_ID` is in `.env`

### **Issue: "Invalid registration token"**
- **Solution:** Token is automatically removed from database
- User needs to re-register device token

### **Issue: Notifications not received**
- **Check:**
  1. User has notification preferences enabled
  2. Device token is registered and active
  3. Firebase credentials are correct
  4. App has notification permissions

---

## 📊 Notification Statistics

The system tracks:
- Success/failure counts
- Invalid token cleanup
- User preference filtering
- Platform-specific delivery

---

## 🚀 Production Checklist

- [ ] Firebase project created
- [ ] Service account key downloaded
- [ ] Environment variables configured
- [ ] `firebase-admin` package installed
- [ ] Test notification sent successfully
- [ ] Device registration endpoint tested
- [ ] User preferences working
- [ ] Invalid tokens being cleaned up

---

## 📝 Notes

- Notifications are sent **asynchronously** - offer creation won't fail if notification fails
- Invalid tokens are **automatically removed** from database
- Users can control notifications via preferences
- Only **active offers** trigger notifications
- Special deals and featured offers get priority notifications

