const SubscriptionRequest = require('../models/subscriptionRequestModel');
const Shop = require('../models/shopModel');
const User = require('../models/userModel');
const emailService = require('../services/emailService');
const { logActivity } = require('./activityController');

// Create a new subscription request
exports.createSubscriptionRequest = async (req, res) => {
  try {
    const { planType, requestMessage, duration } = req.body;

    // Validate required fields
    if (!planType) {
      return res.status(400).json({
        success: false,
        message: 'Plan type is required'
      });
    }

    // Get shop ID from authenticated user
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }

    // Check if there's already a pending request
    const existingRequest = await SubscriptionRequest.findOne({
      shopId: shop._id,
      status: 'pending'
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending subscription request. Please wait for admin approval.'
      });
    }

    // Create subscription request
    const subscriptionRequest = new SubscriptionRequest({
      shopId: shop._id,
      ownerId: req.user.id,
      planType: planType,
      requestMessage: requestMessage || '',
      duration: duration || 1,
      status: 'pending'
    });

    await subscriptionRequest.save();

    // Populate shop and owner details for response
    await subscriptionRequest.populate('shopId', 'shopName ownerId');
    await subscriptionRequest.populate('ownerId', 'email name');

    // Log the activity
    await logActivity({
      type: 'subscription_request_created',
      description: `Subscription request created for ${shop.shopName}`,
      shopId: shop._id,
      userId: req.user.id,
      metadata: {
        planType: planType,
        duration: duration || 1
      },
      severity: 'low',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'Subscription request submitted successfully. Admin will review your request.',
      data: subscriptionRequest
    });

  } catch (error) {
    console.error('Create subscription request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subscription request'
    });
  }
};

// Get my subscription request (shopkeeper)
exports.getMySubscriptionRequest = async (req, res) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }

    const subscriptionRequest = await SubscriptionRequest.findOne({ shopId: shop._id })
      .sort({ requestedAt: -1 })
      .populate('processedBy', 'name email')
      .populate('shopId', 'shopName');

    if (!subscriptionRequest) {
      return res.json({
        success: true,
        data: null,
        message: 'No subscription request found'
      });
    }

    res.json({
      success: true,
      data: subscriptionRequest
    });

  } catch (error) {
    console.error('Get subscription request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription request'
    });
  }
};

// Get my subscription status (shopkeeper)
exports.getMySubscription = async (req, res) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }

    res.json({
      success: true,
      data: {
        subscription: shop.subscription,
        canPromoteOffers: shop.subscription && 
                         shop.subscription.status === 'active' &&
                         shop.subscription.plan !== 'free'
      }
    });

  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription'
    });
  }
};

// Admin: Get all subscription requests
exports.getAllSubscriptionRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { status, search } = req.query;

    // Build filter object
    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search) {
      // Search in shop name or owner email
      const shops = await Shop.find({
        $or: [
          { shopName: { $regex: search, $options: 'i' } },
          { address: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      const shopIds = shops.map(shop => shop._id);
      filter.shopId = { $in: shopIds };
    }

    const requests = await SubscriptionRequest.find(filter)
      .populate('shopId', 'shopName address phone verificationStatus')
      .populate('ownerId', 'email name')
      .populate('processedBy', 'name email')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await SubscriptionRequest.countDocuments(filter);

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalRequests: total,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get all subscription requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription requests'
    });
  }
};

// Admin: Approve subscription request
exports.approveSubscriptionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const subscriptionRequest = await SubscriptionRequest.findById(id)
      .populate('shopId', 'shopName ownerId')
      .populate('ownerId', 'email name');

    if (!subscriptionRequest) {
      return res.status(404).json({
        success: false,
        message: 'Subscription request not found'
      });
    }

    if (subscriptionRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This request has already been ${subscriptionRequest.status}`
      });
    }

    // Update subscription request
    subscriptionRequest.status = 'approved';
    subscriptionRequest.processedBy = req.user.id;
    subscriptionRequest.processedAt = new Date();
    subscriptionRequest.adminNotes = adminNotes || '';
    await subscriptionRequest.save();

    // Update shop subscription
    const shop = await Shop.findById(subscriptionRequest.shopId._id);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + subscriptionRequest.duration);

    shop.subscription = {
      plan: subscriptionRequest.planType,
      status: 'active',
      startDate: startDate,
      endDate: endDate,
      approvedAt: startDate,
      approvedBy: req.user.id
    };

    await shop.save();

    // Send email notification to shopkeeper
    const ownerEmail = subscriptionRequest.ownerId.email;
    if (ownerEmail) {
      await emailService.sendSubscriptionApprovalEmail(
        ownerEmail,
        shop.shopName,
        subscriptionRequest.planType,
        endDate
      );
    }

    // Log the activity
    await logActivity({
      type: 'subscription_approved',
      description: `Subscription request approved for ${shop.shopName}`,
      shopId: shop._id,
      userId: req.user.id,
      metadata: {
        planType: subscriptionRequest.planType,
        duration: subscriptionRequest.duration,
        requestId: subscriptionRequest._id
      },
      severity: 'medium',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Subscription request approved successfully. Email notification sent to shopkeeper.',
      data: {
        subscriptionRequest,
        shop: {
          id: shop._id,
          shopName: shop.shopName,
          subscription: shop.subscription
        }
      }
    });

  } catch (error) {
    console.error('Approve subscription request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve subscription request'
    });
  }
};

// Admin: Reject subscription request
exports.rejectSubscriptionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    if (!adminNotes) {
      return res.status(400).json({
        success: false,
        message: 'Admin notes are required for rejection'
      });
    }

    const subscriptionRequest = await SubscriptionRequest.findById(id)
      .populate('shopId', 'shopName ownerId')
      .populate('ownerId', 'email name');

    if (!subscriptionRequest) {
      return res.status(404).json({
        success: false,
        message: 'Subscription request not found'
      });
    }

    if (subscriptionRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This request has already been ${subscriptionRequest.status}`
      });
    }

    // Update subscription request
    subscriptionRequest.status = 'rejected';
    subscriptionRequest.processedBy = req.user.id;
    subscriptionRequest.processedAt = new Date();
    subscriptionRequest.adminNotes = adminNotes;
    await subscriptionRequest.save();

    // Send email notification to shopkeeper
    const ownerEmail = subscriptionRequest.ownerId.email;
    if (ownerEmail) {
      await emailService.sendSubscriptionRejectionEmail(
        ownerEmail,
        subscriptionRequest.shopId.shopName,
        adminNotes
      );
    }

    // Log the activity
    await logActivity({
      type: 'subscription_rejected',
      description: `Subscription request rejected for ${subscriptionRequest.shopId.shopName}`,
      shopId: subscriptionRequest.shopId._id,
      userId: req.user.id,
      metadata: {
        planType: subscriptionRequest.planType,
        requestId: subscriptionRequest._id,
        reason: adminNotes
      },
      severity: 'medium',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Subscription request rejected. Email notification sent to shopkeeper.',
      data: subscriptionRequest
    });

  } catch (error) {
    console.error('Reject subscription request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject subscription request'
    });
  }
};

