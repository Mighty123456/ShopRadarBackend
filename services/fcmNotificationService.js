const admin = require('firebase-admin');
const DeviceToken = require('../models/deviceTokenModel');

/**
 * Firebase Cloud Messaging (FCM) Notification Service
 * Handles sending push notifications to users
 */
class FCMNotificationService {
  constructor() {
    this.isInitialized = false;
    this.initializeFirebase();
  }

  /**
   * Initialize Firebase Admin SDK
   */
  initializeFirebase() {
    try {
      // Check if Firebase is already initialized
      if (admin.apps.length > 0) {
        this.isInitialized = true;
        console.log('✅ Firebase Admin SDK already initialized');
        return;
      }

      // Initialize with service account (if available) or use default credentials
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } else if (process.env.FIREBASE_PROJECT_ID) {
        // Use default credentials (for environments like Vercel, Render)
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID
        });
      } else {
        console.warn('⚠️ Firebase credentials not configured. Push notifications will be disabled.');
        return;
      }

      this.isInitialized = true;
      console.log('✅ Firebase Admin SDK initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing Firebase Admin SDK:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Send notification to a single device
   */
  async sendToDevice(token, notification, data = {}) {
    if (!this.isInitialized) {
      console.warn('⚠️ Firebase not initialized. Skipping notification.');
      return { success: false, error: 'Firebase not initialized' };
    }

    try {
      const message = {
        token: token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'shopradar_deals',
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log('✅ Successfully sent notification:', response);
      return { success: true, messageId: response };
    } catch (error) {
      console.error('❌ Error sending notification:', error);
      
      // Handle invalid token
      if (error.code === 'messaging/invalid-registration-token' || 
          error.code === 'messaging/registration-token-not-registered') {
        // Remove invalid token from database
        await DeviceToken.findOneAndDelete({ token });
        console.log('🗑️ Removed invalid token from database');
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to multiple devices
   */
  async sendToDevices(tokens, notification, data = {}) {
    if (!this.isInitialized) {
      console.warn('⚠️ Firebase not initialized. Skipping notification.');
      return { success: false, error: 'Firebase not initialized' };
    }

    if (!tokens || tokens.length === 0) {
      return { success: false, error: 'No tokens provided' };
    }

    try {
      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'shopradar_deals',
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
        tokens: tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      
      console.log(`✅ Successfully sent ${response.successCount} notifications`);
      if (response.failureCount > 0) {
        console.warn(`⚠️ Failed to send ${response.failureCount} notifications`);
        
        // Remove invalid tokens
        const invalidTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (errorCode === 'messaging/invalid-registration-token' || 
                errorCode === 'messaging/registration-token-not-registered') {
              invalidTokens.push(tokens[idx]);
            }
          }
        });
        
        if (invalidTokens.length > 0) {
          await DeviceToken.deleteMany({ token: { $in: invalidTokens } });
          console.log(`🗑️ Removed ${invalidTokens.length} invalid tokens from database`);
        }
      }
      
      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      console.error('❌ Error sending multicast notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to all active users
   */
  async sendToAllUsers(notification, data = {}, filters = {}) {
    try {
      const query = { isActive: true, ...filters };
      const deviceTokens = await DeviceToken.find(query).select('token');
      
      if (deviceTokens.length === 0) {
        return { success: false, error: 'No active devices found' };
      }

      const tokens = deviceTokens.map(dt => dt.token);
      return await this.sendToDevices(tokens, notification, data);
    } catch (error) {
      console.error('❌ Error sending to all users:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to users with specific preferences
   */
  async sendToUsersWithPreference(preferenceKey, notification, data = {}) {
    try {
      const query = {
        isActive: true,
        [`preferences.${preferenceKey}`]: true
      };
      const deviceTokens = await DeviceToken.find(query).select('token');
      
      if (deviceTokens.length === 0) {
        return { success: false, error: 'No devices with this preference found' };
      }

      const tokens = deviceTokens.map(dt => dt.token);
      return await this.sendToDevices(tokens, notification, data);
    } catch (error) {
      console.error('❌ Error sending to users with preference:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification for new offer
   */
  async notifyNewOffer(offer, shop) {
    try {
      if (!this.isInitialized) {
        console.warn('⚠️ Firebase not initialized. Skipping offer notification.');
        return { success: false, error: 'Firebase not initialized' };
      }

      // Handle both populated and plain objects
      const offerObj = offer.toObject ? offer.toObject() : offer;
      const shopObj = shop.toObject ? shop.toObject() : shop;

      const isSpecialDeal = offerObj.isCustomOffer === true;
      const discountValue = offerObj.discountValue || 0;
      const isFeatured = offerObj.isPromoted === true || discountValue > 20;
      
      // Determine notification type and preference key
      let preferenceKey = 'newOffers';
      let notificationTitle = 'New Offer Available!';
      
      if (isSpecialDeal) {
        preferenceKey = 'specialDeals';
        notificationTitle = '🔥 Special Deal Alert!';
      } else if (isFeatured) {
        preferenceKey = 'featuredOffers';
        notificationTitle = '⭐ Featured Offer!';
      }

      const discountText = offerObj.discountType === 'Percentage' 
        ? `${discountValue}% OFF`
        : `₹${discountValue} OFF`;

      const shopName = shopObj.shopName || shopObj.name || 'Shop';
      const offerTitle = offerObj.title || 'New Offer';

      const notification = {
        title: notificationTitle,
        body: `${offerTitle} - ${discountText} at ${shopName}`,
      };

      const offerId = offerObj._id?.toString() || offerObj.id?.toString() || '';
      const shopId = shopObj._id?.toString() || shopObj.id?.toString() || '';

      const data = {
        type: 'new_offer',
        offerId: offerId,
        shopId: shopId,
        offerTitle: offerTitle,
        shopName: shopName,
        discountValue: discountValue.toString(),
        discountType: offerObj.discountType || 'Percentage',
        isCustomOffer: (isSpecialDeal).toString(),
      };

      // Send to users with the specific preference enabled
      const result = await this.sendToUsersWithPreference(preferenceKey, notification, data);
      
      if (result.success) {
        console.log(`📢 Sent new offer notification (${preferenceKey}): ${offerTitle} to ${result.successCount || 'users'}`);
      }
      return result;
    } catch (error) {
      console.error('❌ Error sending new offer notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to specific user
   */
  async sendToUser(userId, notification, data = {}) {
    try {
      const deviceTokens = await DeviceToken.find({
        userId,
        isActive: true
      }).select('token');

      if (deviceTokens.length === 0) {
        return { success: false, error: 'No active devices found for user' };
      }

      const tokens = deviceTokens.map(dt => dt.token);
      return await this.sendToDevices(tokens, notification, data);
    } catch (error) {
      console.error('❌ Error sending to user:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification for new shop to nearby users
   * Sends to users who have nearbyShops preference enabled
   */
  async notifyNewShop(shop) {
    try {
      if (!this.isInitialized) {
        console.warn('⚠️ Firebase not initialized. Skipping new shop notification.');
        return { success: false, error: 'Firebase not initialized' };
      }

      // Handle both populated and plain objects
      const shopObj = shop.toObject ? shop.toObject() : shop;
      const shopName = shopObj.shopName || shopObj.name || 'New Shop';
      const shopId = shopObj._id?.toString() || shopObj.id?.toString() || '';
      const shopAddress = shopObj.address || '';
      const shopState = shopObj.state || '';
      
      // Get shop location if available
      let shopLat = null;
      let shopLng = null;
      if (shopObj.location && shopObj.location.coordinates) {
        shopLng = shopObj.location.coordinates[0];
        shopLat = shopObj.location.coordinates[1];
      }

      const notification = {
        title: '🏪 New Shop in Your Area!',
        body: `${shopName} just joined ShopRadar${shopState ? ` in ${shopState}` : ''}`,
      };

      const data = {
        type: 'new_shop',
        shopId: shopId,
        shopName: shopName,
        address: shopAddress,
        state: shopState,
        ...(shopLat && shopLng ? {
          latitude: shopLat.toString(),
          longitude: shopLng.toString()
        } : {})
      };

      // Send to users with nearbyShops preference enabled (defaults to true if not set)
      // We'll send to users who have nearbyOffers enabled (as nearbyShops is similar)
      const deviceTokens = await DeviceToken.find({
        isActive: true,
        $or: [
          { 'preferences.nearbyShops': { $ne: false } }, // enabled or not set (default true)
          { 'preferences.nearbyOffers': { $ne: false } }  // fallback to nearbyOffers preference
        ]
      }).select('token userId');

      if (deviceTokens.length === 0) {
        console.log('📭 No users with nearby shop notifications enabled');
        return { success: false, error: 'No users with nearby shop notifications enabled' };
      }

      const tokens = deviceTokens.map(dt => dt.token);
      const result = await this.sendToDevices(tokens, notification, data);
      
      if (result.success) {
        console.log(`📢 Sent new shop notification: ${shopName} to ${result.successCount || tokens.length} users`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error sending new shop notification:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new FCMNotificationService();

