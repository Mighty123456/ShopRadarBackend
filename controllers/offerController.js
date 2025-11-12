const Offer = require('../models/offerModel');
const Shop = require('../models/shopModel');
const Product = require('../models/productModel');
const { logActivity } = require('./activityController');
const websocketService = require('../services/websocketService');
const fcmNotificationService = require('../services/fcmNotificationService');

// Get all offers for a shop
exports.getMyOffers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get shop ID from authenticated user
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }

    // Get offers with pagination
    const offers = await Offer.find({ shopId: shop._id })
      .populate('productId', 'name category price images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalOffers = await Offer.countDocuments({ shopId: shop._id });

    res.json({
      success: true,
      data: offers,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOffers / limit),
        totalOffers,
        hasNextPage: page < Math.ceil(totalOffers / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Get my offers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch offers'
    });
  }
};

// Create a new offer
exports.createOffer = async (req, res) => {
  try {
    const { productId, title, description, category, discountType, discountValue, startDate, endDate, maxUses, isCustomOffer, customImageUrl, customType } = req.body;

    // Validate required fields
    if (!title || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Title, start date, and end date are required'
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

    let product = null;
    if (!isCustomOffer) {
      // For normal offers, verify product
      if (!productId) {
        return res.status(400).json({
          success: false,
          message: 'Product ID is required for non-custom offers'
        });
      }
      product = await Product.findOne({ _id: productId, shopId: shop._id });
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found or does not belong to this shop'
        });
      }
    }

    // Create offer with status derived from dates
    const now = new Date();
    let parsedStart = new Date(startDate);
    const parsedEnd = new Date(endDate);
    
    // Ensure startDate is not in the future - if it is, set it to now for immediate visibility
    if (parsedStart > now) {
      parsedStart = new Date(now.getTime());
      console.log(`[Create Offer] Adjusted startDate from ${startDate} to current time for immediate visibility`);
    }
    
    // Default to active (previous behavior), only mark expired if endDate already passed
    let derivedStatus = parsedEnd < now ? 'expired' : 'active';

    const offerData = {
      shopId: shop._id,
      ...(isCustomOffer ? {} : { productId: productId }),
      title,
      description: description || '',
      category: category || 'Other',
      discountType: discountType || 'Fixed Amount',
      discountValue: discountValue !== undefined ? discountValue : 0,
      startDate: parsedStart,
      endDate: parsedEnd,
      maxUses: maxUses || 0,
      status: derivedStatus,
      isCustomOffer: !!isCustomOffer,
      customImageUrl: customImageUrl || undefined,
      customType: customType || undefined
    };

    const newOffer = new Offer(offerData);
    await newOffer.save();

    // Populate product details for response
    if (!isCustomOffer) {
      await newOffer.populate('productId', 'name category price images');
    }
    await newOffer.populate('shopId', 'shopName address phone location rating isLive verificationStatus isActive');

    // Broadcast new offer to all connected clients (this triggers immediate refresh on frontend)
    websocketService.broadcastNewOffer({
      id: newOffer._id,
      title: newOffer.title,
      description: newOffer.description,
      discountType: newOffer.discountType,
      discountValue: newOffer.discountValue,
      startDate: newOffer.startDate,
      endDate: newOffer.endDate,
      isCustomOffer: newOffer.isCustomOffer,
      customImageUrl: newOffer.customImageUrl,
      customType: newOffer.customType,
      shop: {
        id: newOffer.shopId._id,
        name: newOffer.shopId.shopName,
        address: newOffer.shopId.address,
        rating: newOffer.shopId.rating || 0
      },
      ...(isCustomOffer ? {} : {
        product: {
          id: newOffer.productId._id,
          name: newOffer.productId.name,
          category: newOffer.productId.category,
          price: newOffer.productId.price
        }
      })
    });

    // Also broadcast a featured offers update signal to force immediate refresh on all clients
    // This triggers clients to fetch fresh data from the API
    try {
      websocketService.broadcastFeaturedOffersUpdate({ refresh: true, newOfferId: newOffer._id.toString() });
      console.log(`[Create Offer] Broadcasted featured offers refresh signal for new offer: ${newOffer._id}`);
    } catch (broadcastErr) {
      console.error('[Create Offer] Error broadcasting featured offers update:', broadcastErr);
    }

    // Log the activity
    await logActivity({
      type: 'offer_created',
      description: isCustomOffer
        ? `Custom offer "${title}" created`
        : `Offer "${title}" created for product "${product.name}"`,
      shopId: shop._id,
      userId: req.user.id,
      metadata: {
        offerTitle: title,
        ...(isCustomOffer ? {} : { productName: product.name }),
        discountType,
        discountValue,
        maxUses: maxUses || 0
      },
      severity: 'low',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    // Broadcast offer count update (total offers)
    try {
      const totalOffers = await Offer.countDocuments();
      websocketService.broadcastOfferCountUpdate(totalOffers);
    } catch (countErr) {
      console.error('Failed to broadcast offer count:', countErr);
    }

    // Send push notification for new offer (special deals and featured offers)
    try {
      // Only send notifications for active offers that are visible on home screen
      if (derivedStatus === 'active') {
        const isSpecialDeal = !!isCustomOffer;
        const isFeatured = newOffer.discountValue > 20 || !!newOffer.isPromoted;
        
        // Send notification for special deals or featured offers
        if (isSpecialDeal || isFeatured) {
          await fcmNotificationService.notifyNewOffer(newOffer, newOffer.shopId);
          console.log(`📢 Sent push notification for new ${isSpecialDeal ? 'special deal' : 'featured offer'}: ${title}`);
        }
      }
    } catch (notifErr) {
      // Don't fail offer creation if notification fails
      console.error('Failed to send push notification for new offer:', notifErr);
    }

    res.status(201).json({
      success: true,
      message: 'Offer created successfully',
      data: newOffer
    });

  } catch (error) {
    console.error('Create offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create offer'
    });
  }
};

// Update an offer
exports.updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, discountType, discountValue, startDate, endDate, maxUses, status } = req.body;

    // Get shop ID from authenticated user
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }

    // Find the offer and verify ownership
    const offer = await Offer.findOne({ _id: id, shopId: shop._id });
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found or does not belong to this shop'
      });
    }

    // Update offer fields
    if (title !== undefined) offer.title = title;
    if (description !== undefined) offer.description = description;
    if (discountType !== undefined) offer.discountType = discountType;
    if (discountValue !== undefined) offer.discountValue = discountValue;
    if (startDate !== undefined) offer.startDate = new Date(startDate);
    if (endDate !== undefined) offer.endDate = new Date(endDate);
    if (maxUses !== undefined) offer.maxUses = maxUses;
    if (status !== undefined) offer.status = status;

    await offer.save();
    await offer.populate('productId', 'name category price images');
    await offer.populate('shopId', 'shopName address phone location rating isLive verificationStatus isActive');

    // Log the activity
    await logActivity({
      type: 'offer_updated',
      description: `Offer "${offer.title}" updated`,
      shopId: shop._id,
      userId: req.user.id,
      metadata: {
        offerId: offer._id,
        offerTitle: offer.title,
        discountType: offer.discountType,
        discountValue: offer.discountValue
      },
      severity: 'low',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    // Recalculate and broadcast total offer count
    try {
      const totalOffers = await Offer.countDocuments();
      websocketService.broadcastOfferCountUpdate(totalOffers);
    } catch (countErr) {
      console.error('Failed to broadcast offer count:', countErr);
    }

    // Send push notification if offer becomes active and is special/featured
    try {
      if (offer.status === 'active') {
        const isSpecialDeal = !!offer.isCustomOffer;
        const isFeatured = offer.discountValue > 20 || !!offer.isPromoted;
        
        // Only send notification if it's a special deal or featured offer
        if (isSpecialDeal || isFeatured) {
          await fcmNotificationService.notifyNewOffer(offer, offer.shopId);
          console.log(`📢 Sent push notification for updated ${isSpecialDeal ? 'special deal' : 'featured offer'}: ${offer.title}`);
        }
      }
    } catch (notifErr) {
      // Don't fail offer update if notification fails
      console.error('Failed to send push notification for updated offer:', notifErr);
    }

    res.json({
      success: true,
      message: 'Offer updated successfully',
      data: offer
    });

  } catch (error) {
    console.error('Update offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update offer'
    });
  }
};

// Delete an offer
exports.deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;

    // Get shop ID from authenticated user
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }

    // Find and delete the offer
    const offer = await Offer.findOneAndDelete({ _id: id, shopId: shop._id });
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found or does not belong to this shop'
      });
    }

    // Log the activity
    await logActivity({
      type: 'offer_deleted',
      description: `Offer "${offer.title}" deleted`,
      shopId: shop._id,
      userId: req.user.id,
      metadata: {
        offerId: offer._id,
        offerTitle: offer.title
      },
      severity: 'low',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    // Broadcast total offer count after deletion
    try {
      const totalOffers = await Offer.countDocuments();
      websocketService.broadcastOfferCountUpdate(totalOffers);
    } catch (countErr) {
      console.error('Failed to broadcast offer count:', countErr);
    }

    res.json({
      success: true,
      message: 'Offer deleted successfully'
    });

  } catch (error) {
    console.error('Delete offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete offer'
    });
  }
};

// Get a specific offer
exports.getOffer = async (req, res) => {
  try {
    const { id } = req.params;

    // Get shop ID from authenticated user
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }

    const offer = await Offer.findOne({ _id: id, shopId: shop._id })
      .populate('productId', 'name category price images');

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found or does not belong to this shop'
      });
    }

    res.json({
      success: true,
      data: offer
    });

  } catch (error) {
    console.error('Get offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch offer'
    });
  }
};

// Toggle offer status (active/inactive)
exports.toggleOfferStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Get shop ID from authenticated user
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }

    const offer = await Offer.findOne({ _id: id, shopId: shop._id });
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found or does not belong to this shop'
      });
    }

    // Toggle status between active and inactive
    offer.status = offer.status === 'active' ? 'inactive' : 'active';
    await offer.save();
    await offer.populate('productId', 'name category price images');

    // Log the activity
    await logActivity({
      type: 'offer_status_toggled',
      description: `Offer "${offer.title}" status changed to ${offer.status}`,
      shopId: shop._id,
      userId: req.user.id,
      metadata: {
        offerId: offer._id,
        offerTitle: offer.title,
        newStatus: offer.status
      },
      severity: 'low',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    // Broadcast total offer count after status toggle
    try {
      const totalOffers = await Offer.countDocuments();
      websocketService.broadcastOfferCountUpdate(totalOffers);
    } catch (countErr) {
      console.error('Failed to broadcast offer count:', countErr);
    }

    res.json({
      success: true,
      message: `Offer ${offer.status === 'active' ? 'activated' : 'deactivated'} successfully`,
      data: offer
    });

  } catch (error) {
    console.error('Toggle offer status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle offer status'
    });
  }
};

// Promote an offer (only for subscribed shopkeepers)
exports.promoteOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { promotionDuration } = req.body; // Duration in days, default 7

    // Get shop ID from authenticated user
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }

    // Check if shop has active subscription
    if (!shop.subscription || 
        shop.subscription.status !== 'active' || 
        shop.subscription.plan === 'free') {
      return res.status(403).json({
        success: false,
        message: 'Active subscription required to promote offers. Please subscribe first.',
        requiresSubscription: true
      });
    }

    // Check if subscription has expired
    if (new Date() > shop.subscription.endDate) {
      shop.subscription.status = 'expired';
      await shop.save();
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired. Please renew your subscription.',
        subscriptionExpired: true
      });
    }

    // Find the offer and verify ownership
    const offer = await Offer.findOne({ _id: id, shopId: shop._id });
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found or does not belong to this shop'
      });
    }

    // Check if offer is active
    if (offer.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Only active offers can be promoted'
      });
    }

    // Set promotion details
    const duration = promotionDuration || 7; // Default 7 days
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + duration);

    offer.isPromoted = true;
    offer.promotedAt = now;
    offer.promotionExpiresAt = expiresAt;
    await offer.save();
    await offer.populate('productId', 'name category price images');
    await offer.populate('shopId', 'shopName address phone location rating isLive verificationStatus isActive');

    // Log the activity
    await logActivity({
      type: 'offer_promoted',
      description: `Offer "${offer.title}" promoted`,
      shopId: shop._id,
      userId: req.user.id,
      metadata: {
        offerId: offer._id,
        offerTitle: offer.title,
        promotionDuration: duration,
        expiresAt: expiresAt
      },
      severity: 'low',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    // Send push notification for promoted offer (now featured)
    try {
      await fcmNotificationService.notifyNewOffer(offer, offer.shopId);
      console.log(`📢 Sent push notification for promoted featured offer: ${offer.title}`);
    } catch (notifErr) {
      // Don't fail promotion if notification fails
      console.error('Failed to send push notification for promoted offer:', notifErr);
    }

    res.json({
      success: true,
      message: 'Offer promoted successfully! It will be visible in the featured offers section.',
      data: offer
    });

  } catch (error) {
    console.error('Promote offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to promote offer'
    });
  }
};

// Unpromote an offer
exports.unpromoteOffer = async (req, res) => {
  try {
    const { id } = req.params;

    // Get shop ID from authenticated user
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }

    // Find the offer and verify ownership
    const offer = await Offer.findOne({ _id: id, shopId: shop._id });
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found or does not belong to this shop'
      });
    }

    // Remove promotion
    offer.isPromoted = false;
    offer.promotedAt = null;
    offer.promotionExpiresAt = null;
    await offer.save();
    await offer.populate('productId', 'name category price images');

    // Log the activity
    await logActivity({
      type: 'offer_unpromoted',
      description: `Offer "${offer.title}" promotion removed`,
      shopId: shop._id,
      userId: req.user.id,
      metadata: {
        offerId: offer._id,
        offerTitle: offer.title
      },
      severity: 'low',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Offer promotion removed successfully',
      data: offer
    });

  } catch (error) {
    console.error('Unpromote offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove offer promotion'
    });
  }
};

// Admin Methods

// Clean up offers with null references (admin utility)
exports.cleanupInvalidOffers = async (req, res) => {
  try {
    // Find offers with null shopId or productId
    const invalidOffers = await Offer.find({
      $or: [
        { shopId: null },
        { productId: null }
      ]
    });

    console.log(`Found ${invalidOffers.length} offers with null references`);

    // Optionally delete invalid offers (uncomment if you want to delete them)
    // const deleteResult = await Offer.deleteMany({
    //   $or: [
    //     { shopId: null },
    //     { productId: null }
    //   ]
    // });

    res.json({
      success: true,
      message: `Found ${invalidOffers.length} offers with null references`,
      data: {
        invalidOffers: invalidOffers.map(offer => ({
          id: offer._id,
          title: offer.title,
          shopId: offer.shopId,
          productId: offer.productId,
          createdAt: offer.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Error cleaning up invalid offers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup invalid offers'
    });
  }
};

// Get all offers (admin)
exports.getAllOffers = async (req, res) => {
  try {
    console.log('Admin getAllOffers called with query:', req.query);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};
    
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }
    
    if (req.query.shopId) {
      filter.shopId = req.query.shopId;
    }
    
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    console.log('Filter object:', filter);

    // Get offers with populated product and shop information
    const offers = await Offer.find(filter)
      .populate('productId', 'name category price stock')
      .populate('shopId', 'name ownerName email phone address')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    console.log('Found offers:', offers.length);

    const totalOffers = await Offer.countDocuments(filter);
    const totalPages = Math.ceil(totalOffers / limit);

    console.log('Total offers:', totalOffers);

    // Filter out offers with null references for admin safety
    const validOffers = offers.filter(offer => offer.shopId && offer.productId);

    res.json({
      success: true,
      data: {
        offers: validOffers,
        pagination: {
          currentPage: page,
          totalPages,
          totalOffers,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching all offers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch offers'
    });
  }
};

// Get featured offers (public endpoint) - OPTIMIZED
exports.getFeaturedOffers = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const { latitude, longitude, radius = 8000 } = req.query;
    const now = new Date();

    console.log(`[Featured Offers] Fetching offers - lat: ${latitude}, lng: ${longitude}, radius: ${radius}`);

    // Build filter for active offers
    // Include offers that have started (startDate <= now) or are starting within the next minute
    // This ensures newly created offers appear immediately
    const offerFilter = {
      status: 'active',
      startDate: { $lte: new Date(now.getTime() + 60000) }, // Allow offers starting within next minute
      endDate: { $gte: now }
    };

    // Build shop filter
    const shopFilter = {
      verificationStatus: 'approved',
      isActive: true
    };

    let shopIds = [];

    // Optimize: Use aggregation to join offers with shops in a single query when location is provided
    if (latitude && longitude) {
      try {
        // First, get shop IDs within radius (limit to reasonable number to avoid performance issues)
        shopFilter.location = {
          $near: {
            $geometry: { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] },
            $maxDistance: parseInt(radius)
          }
        };
        
        console.log(`[Featured Offers] Finding shops within ${radius}m of ${latitude}, ${longitude}`);
        // Limit shop query to top 100 to prevent performance issues
        const shops = await Shop.find(shopFilter)
          .select('_id')
          .limit(100)
          .lean(); // Use lean() for faster queries
        
        shopIds = shops.map(shop => shop._id);
        console.log(`[Featured Offers] Found ${shopIds.length} shops within radius`);
      } catch (geoError) {
        console.error('[Featured Offers] Geospatial query error:', geoError);
        // Fallback to all shops if geospatial query fails
        const shops = await Shop.find({ verificationStatus: 'approved', isActive: true })
          .select('_id')
          .limit(100)
          .lean();
        shopIds = shops.map(shop => shop._id);
      }
    } else {
      // All active/approved shops (no location filter) - limit to prevent performance issues
      console.log('[Featured Offers] Finding all active/approved shops (no location filter)');
      const shops = await Shop.find(shopFilter)
        .select('_id')
        .limit(100) // Limit to prevent performance issues
        .lean(); // Use lean() for faster queries
      shopIds = shops.map(shop => shop._id);
      console.log(`[Featured Offers] Found ${shopIds.length} total shops`);
    }
    
    if (shopIds.length === 0) {
      console.log('[Featured Offers] No shops found matching criteria');
      console.log('[Featured Offers] Shop filter used:', JSON.stringify(shopFilter));
      return res.json({
        success: true,
        data: {
          offers: [],
          total: 0,
          timestamp: now.toISOString()
        }
      });
    }

    offerFilter.shopId = { $in: shopIds };
    console.log(`[Featured Offers] Querying offers for ${shopIds.length} shops`);
    console.log(`[Featured Offers] Offer filter:`, JSON.stringify(offerFilter));

    // Optimize: Use populate with select to only fetch needed fields
    // Get featured offers with shop and product details using optimized populate
    // Prioritize promoted offers by sorting: promoted first, then by creation date
    const offers = await Offer.find(offerFilter)
      .populate({
        path: 'shopId',
        select: 'shopName address phone location rating isLive verificationStatus isActive',
        match: { verificationStatus: 'approved', isActive: true } // Filter during populate
      })
      .populate({
        path: 'productId',
        select: 'name category price images'
      })
      .sort({ isPromoted: -1, createdAt: -1 }) // Promoted offers first, then by creation date
      .limit(limit * 2) // Fetch more to account for filtered out items
      .lean(); // Use lean() for faster queries (returns plain JS objects)

    console.log(`[Featured Offers] Found ${offers.length} offers from database`);

    // Debug: Log offers that fail populate filtering (only shopId is mandatory)
    const offersWithNullRefs = offers.filter(offer => !offer.shopId);
    if (offersWithNullRefs.length > 0) {
      console.log(`[Featured Offers] WARNING: ${offersWithNullRefs.length} offers filtered out due to null shopId or productId`);
      offersWithNullRefs.forEach(offer => {
        console.log(`  - Offer ${offer._id}: shopId=${offer.shopId ? 'exists' : 'NULL'}, productId=${offer.productId ? 'exists' : 'NULL'}`);
      });
    }

    // Helper function to calculate distance
    const haversineMeters = (lat1, lon1, lat2, lon2) => {
      const toRad = d => (d * Math.PI) / 180;
      const R = 6371000; // Earth's radius in meters
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    // Transform for frontend; allow custom offers without productId
    const transformedOffers = offers
      .filter(offer => offer.shopId) // Require valid shop only
      .map(offer => {
        // Calculate distance if location is provided
        let distanceKm = null;
        if (latitude && longitude && offer.shopId.location && offer.shopId.location.coordinates) {
          const shopLon = offer.shopId.location.coordinates[0];
          const shopLat = offer.shopId.location.coordinates[1];
          const distanceMeters = haversineMeters(
            parseFloat(latitude),
            parseFloat(longitude),
            shopLat,
            shopLon
          );
          distanceKm = distanceMeters / 1000; // Convert to kilometers
        }

        const base = {
          id: offer._id,
          title: offer.title,
          description: offer.description || '',
          discountType: offer.discountType,
          discountValue: offer.discountValue,
          startDate: offer.startDate,
          endDate: offer.endDate,
          maxUses: offer.maxUses || 0,
          currentUses: offer.currentUses || 0,
          status: offer.status,
          isPromoted: offer.isPromoted || false,
          promotedAt: offer.promotedAt || null,
          promotionExpiresAt: offer.promotionExpiresAt || null,
          distance: distanceKm, // Distance in kilometers
          shop: {
            id: offer.shopId._id,
            name: offer.shopId.shopName,
            address: offer.shopId.address || '',
            phone: offer.shopId.phone || '',
            rating: offer.shopId.rating || 0,
            isLive: offer.shopId.isLive || false,
            location: offer.shopId.location || null
          },
          isCustomOffer: !!offer.isCustomOffer,
          customImageUrl: offer.customImageUrl || null,
          customType: offer.customType || null,
          createdAt: offer.createdAt,
          updatedAt: offer.updatedAt
        };

        if (offer.productId) {
          base.product = {
            id: offer.productId._id,
            name: offer.productId.name,
            category: offer.productId.category,
            price: offer.productId.price,
            images: offer.productId.images || []
          };
        }

        return base;
      })
      // Filter by 8km distance when location is provided
      .filter(offer => {
        if (latitude && longitude && offer.distance !== null) {
          return offer.distance <= 8; // Only show offers within 8km
        }
        // If no location provided, show all offers (fallback)
        return true;
      })
      // Filter out expired promotions
      .filter(offer => {
        if (offer.isPromoted && offer.promotionExpiresAt) {
          return new Date(offer.promotionExpiresAt) > now;
        }
        return true;
      })
      .slice(0, limit); // Limit to requested amount after filtering

    console.log(`[Featured Offers] Returning ${transformedOffers.length} valid offers`);

    // Set cache-control headers to prevent caching and ensure fresh data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      data: {
        offers: transformedOffers,
        total: transformedOffers.length,
        timestamp: now.toISOString()
      }
    });
  } catch (error) {
    console.error('Get featured offers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured offers'
    });
  }
};

// Get offers for a specific shop (public endpoint)
exports.getShopOffers = async (req, res) => {
  try {
    const { shopId } = req.params;
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(shopId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid shopId: must be a 24-character hexadecimal string.'
      });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Verify shop exists and is active
    const shop = await Shop.findOne({ 
      _id: shopId, 
      verificationStatus: 'approved',
      isActive: true,
      isLive: true 
    });

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found or not available'
      });
    }

    // Build filter for active offers
    const filter = {
      shopId: shopId,
      status: 'active',
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    };

    // Get offers with pagination
    const offers = await Offer.find(filter)
      .populate('productId', 'name category price images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalOffers = await Offer.countDocuments(filter);

    // Filter out offers with null productId and transform for frontend
    const transformedOffers = offers
      .filter(offer => offer.productId) // Filter out offers with null productId
      .map(offer => ({
        id: offer._id,
        title: offer.title,
        description: offer.description,
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        startDate: offer.startDate,
        endDate: offer.endDate,
        maxUses: offer.maxUses,
        currentUses: offer.currentUses,
        status: offer.status,
        product: {
          id: offer.productId._id,
          name: offer.productId.name,
          category: offer.productId.category,
          price: offer.productId.price,
          images: offer.productId.images || []
        },
        createdAt: offer.createdAt,
        updatedAt: offer.updatedAt
      }));

    res.json({
      success: true,
      data: {
        offers: transformedOffers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalOffers / limit),
          totalOffers,
          hasNextPage: page < Math.ceil(totalOffers / limit),
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get shop offers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shop offers'
    });
  }
};

// Get offer statistics (admin) optionally per shop via ?shopId=...
exports.getOfferStats = async (req, res) => {
  try {
    const { shopId } = req.query;
    const baseFilter = shopId ? { shopId } : {};

    const totalOffers = await Offer.countDocuments({ ...baseFilter });
    const activeOffers = await Offer.countDocuments({ ...baseFilter, status: 'active' });
    const inactiveOffers = await Offer.countDocuments({ ...baseFilter, status: 'inactive' });
    
    // Get offers by discount type
    const percentageOffers = await Offer.countDocuments({ ...baseFilter, discountType: 'Percentage' });
    const fixedOffers = await Offer.countDocuments({ ...baseFilter, discountType: 'Fixed Amount' });
    
    // Get recent offers (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentOffers = await Offer.countDocuments({ 
      ...baseFilter,
      createdAt: { $gte: thirtyDaysAgo } 
    });

    // Get top performing offers (by usage)
    const topOffers = await Offer.find(baseFilter)
      .populate('productId', 'name')
      .populate('shopId', 'name')
      .sort({ currentUses: -1 })
      .limit(5)
      .select('title currentUses maxUses productId shopId');

    res.json({
      success: true,
      data: {
        totalOffers,
        activeOffers,
        inactiveOffers,
        percentageOffers,
        fixedOffers,
        recentOffers,
        topOffers
      }
    });
  } catch (error) {
    console.error('Error fetching offer statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch offer statistics'
    });
  }
};

// Get specific offer by ID (admin)
exports.getOfferById = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id)
      .populate('productId', 'name category price stock description')
      .populate('shopId', 'name ownerName email phone address');

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }

    res.json({
      success: true,
      data: offer
    });
  } catch (error) {
    console.error('Error fetching offer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch offer'
    });
  }
};

// Update offer status (admin)
exports.updateOfferStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active, inactive, or suspended'
      });
    }

    const offer = await Offer.findByIdAndUpdate(
      id,
      { 
        status,
        adminNotes: notes,
        updatedAt: new Date()
      },
      { new: true }
    ).populate('productId', 'name')
     .populate('shopId', 'name');

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }

    // Log the activity
    await logActivity({
      type: 'offer_status_updated',
      description: `Offer "${offer.title}" status updated to ${status} by admin`,
      shopId: offer.shopId,
      userId: req.user.id,
      metadata: {
        offerId: offer._id,
        offerTitle: offer.title,
        newStatus: status,
        adminNotes: notes
      },
      severity: 'medium',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Offer status updated successfully',
      data: offer
    });
  } catch (error) {
    console.error('Error updating offer status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update offer status'
    });
  }
};

// Get offers with advanced filtering
exports.getFilteredOffers = async (req, res) => {
  try {
    const {
      category,
      minDiscount,
      maxDiscount,
      expiringHours,
      searchQuery,
      sortBy = 'discount',
      page = 1,
      limit = 20
    } = req.query;

    const skip = (page - 1) * limit;
    const now = new Date();

    // Build filter object
    const filter = {
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now }
    };

    // Add category filter
    if (category && category !== 'All') {
      filter.category = category;
    }

    // Add discount range filter
    if (minDiscount || maxDiscount) {
      filter.discountValue = {};
      if (minDiscount) filter.discountValue.$gte = parseFloat(minDiscount);
      if (maxDiscount) filter.discountValue.$lte = parseFloat(maxDiscount);
    }

    // Add expiring soon filter
    if (expiringHours) {
      const expiryTime = new Date(now.getTime() + (parseInt(expiringHours) * 60 * 60 * 1000));
      filter.endDate.$lte = expiryTime;
    }

    // Add search query filter
    if (searchQuery) {
      filter.$or = [
        { title: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } }
      ];
    }

    // Build sort object
    let sort = {};
    switch (sortBy) {
      case 'discount':
        sort = { discountValue: -1 };
        break;
      case 'expiring':
        sort = { endDate: 1 };
        break;
      case 'newest':
        sort = { createdAt: -1 };
        break;
      case 'alphabetical':
        sort = { title: 1 };
        break;
      default:
        sort = { discountValue: -1 };
    }

    // Execute query
    const offers = await Offer.find(filter)
      .populate('productId', 'name category price images')
      .populate('shopId', 'name address location')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalOffers = await Offer.countDocuments(filter);

    res.json({
      success: true,
      data: {
        offers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalOffers / limit),
          totalOffers,
          hasNextPage: page < Math.ceil(totalOffers / limit),
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get filtered offers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch filtered offers'
    });
  }
};
