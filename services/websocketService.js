const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Admin = require('../models/adminModel');
const config = require('../config/config');

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedAdmins = new Map(); // Map of adminId to socketId
    this.public = null; // Public namespace (no auth)
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: true,
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    // Public namespace for customer/mobile apps (no auth required)
    this.public = this.io.of('/public');
    this.public.on('connection', (socket) => {
      // Optionally log connections; keep minimal to avoid noise
      // console.log('Public client connected');
      socket.on('disconnect', () => {
        // console.log('Public client disconnected');
      });
    });

    // Default namespace reserved for admin dashboard; requires admin auth
    this.io.use(this.authenticateAdmin.bind(this));
    this.io.on('connection', this.handleConnection.bind(this));
    
    console.log('WebSocket service initialized');
  }

  async authenticateAdmin(socket, next) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, config.jwtSecret);
      
      if (decoded.type !== 'admin') {
        return next(new Error('Authentication error: Invalid token type'));
      }

      const admin = await Admin.findById(decoded.id).select('-password');
      
      if (!admin || !admin.isActive) {
        return next(new Error('Authentication error: Admin not found or inactive'));
      }

      socket.adminId = admin._id.toString();
      socket.admin = {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      };

      next();
    } catch (error) {
      console.error('WebSocket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  }

  handleConnection(socket) {
    const adminId = socket.adminId;
    const admin = socket.admin;

    console.log(`Admin ${admin.name} (${adminId}) connected via WebSocket`);

    // Store the connection
    this.connectedAdmins.set(adminId, socket.id);

    // Join admin to their personal room
    socket.join(`admin_${adminId}`);

    // Join admin to general admin room for broadcast messages
    socket.join('admin_room');

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Admin ${admin.name} (${adminId}) disconnected from WebSocket`);
      this.connectedAdmins.delete(adminId);
    });

    // Handle join specific room (for specific activity types)
    socket.on('join_room', (roomName) => {
      socket.join(roomName);
      console.log(`Admin ${admin.name} joined room: ${roomName}`);
    });

    // Handle leave specific room
    socket.on('leave_room', (roomName) => {
      socket.leave(roomName);
      console.log(`Admin ${admin.name} left room: ${roomName}`);
    });

    // Send initial connection confirmation
    socket.emit('connected', {
      message: 'Connected to real-time updates',
      admin: admin,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast new activity to all connected admins
  broadcastActivity(activity) {
    if (!this.io) return;

    const activityData = {
      id: activity._id,
      type: activity.type,
      description: activity.description,
      severity: activity.severity,
      status: activity.status,
      createdAt: activity.createdAt,
      timeAgo: this.getTimeAgo(activity.createdAt),
      user: activity.userId,
      shop: activity.shopId,
      admin: activity.adminId,
      metadata: activity.metadata
    };

    // Broadcast to all admins
    this.io.to('admin_room').emit('new_activity', activityData);

    // Also broadcast to specific rooms based on activity type
    const roomName = this.getActivityRoom(activity.type);
    if (roomName) {
      this.io.to(roomName).emit('activity_update', {
        type: activity.type,
        data: activityData
      });
    }

    console.log(`Broadcasted activity: ${activity.type} - ${activity.description}`);
  }

  // Send activity to specific admin
  sendActivityToAdmin(adminId, activity) {
    if (!this.io) return;

    const socketId = this.connectedAdmins.get(adminId);
    if (socketId) {
      this.io.to(socketId).emit('new_activity', activity);
    }
  }

  // Send notification to specific admin
  sendNotificationToAdmin(adminId, notification) {
    if (!this.io) return;

    const socketId = this.connectedAdmins.get(adminId);
    if (socketId) {
      this.io.to(socketId).emit('notification', notification);
    }
  }

  // Broadcast notification to all admins
  broadcastNotification(notification) {
    if (!this.io) return;

    this.io.to('admin_room').emit('notification', notification);
  }

  // Broadcast featured offers update to all connected clients
  broadcastFeaturedOffersUpdate(offers) {
    if (!this.public) return;

    const offersData = {
      type: 'featured_offers_update',
      data: {
        offers: offers,
        timestamp: new Date().toISOString()
      }
    };

    // Broadcast to all connected public clients
    this.public.emit('featured_offers_update', offersData);
    console.log(`Broadcasted featured offers update: ${offers.length} offers`);
  }

  // Broadcast new offer to all connected clients
  broadcastNewOffer(offer) {
    if (!this.public) return;

    const offerData = {
      type: 'new_offer',
      data: {
        offer: offer,
        timestamp: new Date().toISOString()
      }
    };

    // Broadcast to all connected public clients
    this.public.emit('new_offer', offerData);
    console.log(`Broadcasted new offer: ${offer.title}`);
  }

  // Broadcast offer update to all connected clients
  broadcastOfferUpdate(offer) {
    if (!this.public) return;

    const offerData = {
      type: 'offer_update',
      data: {
        offer: offer,
        timestamp: new Date().toISOString()
      }
    };

    // Broadcast to all connected public clients
    this.public.emit('offer_update', offerData);
    console.log(`Broadcasted offer update: ${offer.title}`);
  }

  // Broadcast new shop to all connected public clients
  broadcastNewShop(shop) {
    if (!this.public) return;

    const shopData = {
      type: 'new_shop',
      data: {
        shop: {
          id: shop._id,
          name: shop.shopName,
          address: shop.address,
          gpsAddress: shop.gpsAddress,
          state: shop.state,
          location: shop.location && shop.location.coordinates ? {
            lng: shop.location.coordinates[0],
            lat: shop.location.coordinates[1]
          } : null,
          rating: shop.rating || 0,
          isLive: shop.isLive || false
        },
        timestamp: new Date().toISOString()
      }
    };

    this.public.emit('new_shop', shopData);
    console.log(`Broadcasted new shop: ${shop.shopName}`);
  }

  // Get activity-specific room name
  getActivityRoom(activityType) {
    const roomMap = {
      'user_registered': 'user_activities',
      'user_blocked': 'user_activities',
      'user_unblocked': 'user_activities',
      'user_deleted': 'user_activities',
      'shop_registered': 'shop_activities',
      'shop_verified': 'shop_activities',
      'shop_rejected': 'shop_activities',
      'shop_activated': 'shop_activities',
      'shop_deactivated': 'shop_activities',
      'product_added': 'product_activities',
      'product_created': 'product_activities',
      'product_removed': 'product_activities',
      'product_deleted': 'product_activities',
      'product_updated': 'product_activities',
      'review_posted': 'review_activities',
      'review_flagged': 'review_activities',
      'review_removed': 'review_activities',
      'admin_login': 'admin_activities'
    };

    return roomMap[activityType];
  }

  // Broadcast stats update to all connected admins
  broadcastStatsUpdate(statsType, data) {
    if (!this.io) return;

    const statsData = {
      type: statsType,
      data: data,
      timestamp: new Date().toISOString()
    };

    // Broadcast to all admins
    this.io.to('admin_room').emit('stats_update', statsData);

    console.log(`Broadcasted stats update: ${statsType}`);
  }

  // Broadcast product count update
  broadcastProductCountUpdate(count) {
    this.broadcastStatsUpdate('product_count', { totalProducts: count });
  }

  // Broadcast offer count update
  broadcastOfferCountUpdate(count) {
    this.broadcastStatsUpdate('offer_count', { totalOffers: count });
  }

  // Broadcast shop count update
  broadcastShopCountUpdate(count) {
    this.broadcastStatsUpdate('shop_count', { totalShops: count });
  }

  // Broadcast user count update
  broadcastUserCountUpdate(count) {
    this.broadcastStatsUpdate('user_count', { totalUsers: count });
  }

  // Helper function to calculate time ago
  getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
      return `${diffInSeconds} seconds ago`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    }
  }

  // Get connected admins count
  getConnectedAdminsCount() {
    return this.connectedAdmins.size;
  }

  // Get connected admins list
  getConnectedAdmins() {
    return Array.from(this.connectedAdmins.keys());
  }
}

module.exports = new WebSocketService();
