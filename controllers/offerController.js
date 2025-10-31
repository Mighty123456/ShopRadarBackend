const Offer = require('../models/offerModel');
const Shop = require('../models/shopModel');
const Product = require('../models/productModel');
const { logActivity } = require('./activityController');
const websocketService = require('../services/websocketService');

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
    const { productId, title, description, category, discountType, discountValue, startDate, endDate, maxUses } = req.body;

    // Validate required fields
    if (!productId || !title || !discountType || !discountValue || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Product ID, title, discount type, discount value, start date, and end date are required'
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

    // Verify the product belongs to this shop
    const product = await Product.findOne({ _id: productId, shopId: shop._id });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or does not belong to this shop'
      });
    }

    // Create offer with status derived from dates
    const now = new Date();
    const parsedStart = new Date(startDate);
    const parsedEnd = new Date(endDate);
    // Default to active (previous behavior), only mark expired if endDate already passed
    let derivedStatus = parsedEnd < now ? 'expired' : 'active';

    const offerData = {
      shopId: shop._id,
      productId: productId,
      title,
      description: description || '',
      category: category || 'Other',
      discountType,
      discountValue,
      startDate: parsedStart,
      endDate: parsedEnd,
      maxUses: maxUses || 0,
      status: derivedStatus
    };

    const newOffer = new Offer(offerData);
    await newOffer.save();

    // Populate product details for response
    await newOffer.populate('productId', 'name category price images');
    await newOffer.populate('shopId', 'shopName address phone location rating isLive');

    // Broadcast new offer to all connected clients
    websocketService.broadcastNewOffer({
      id: newOffer._id,
      title: newOffer.title,
      description: newOffer.description,
      discountType: newOffer.discountType,
      discountValue: newOffer.discountValue,
      startDate: newOffer.startDate,
      endDate: newOffer.endDate,
      shop: {
        id: newOffer.shopId._id,
        name: newOffer.shopId.shopName,
        address: newOffer.shopId.address,
        rating: newOffer.shopId.rating || 0
      },
      product: {
        id: newOffer.productId._id,
        name: newOffer.productId.name,
        category: newOffer.productId.category,
        price: newOffer.productId.price
      }
    });

    // Log the activity
    await logActivity({
      type: 'offer_created',
      description: `Offer "${title}" created for product "${product.name}"`,
      shopId: shop._id,
      userId: req.user.id,
      metadata: {
        offerTitle: title,
        productName: product.name,
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

// Get featured offers (public endpoint)
exports.getFeaturedOffers = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const { latitude, longitude, radius = 8000 } = req.query; // Enable geo filtering by default

    console.log(`[Featured Offers] Fetching offers - lat: ${latitude}, lng: ${longitude}, radius: ${radius}`);

    // Build filter for active offers
    const filter = {
      status: 'active',
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    };

    let shopIds = [];
    let shopQuery = {
      verificationStatus: 'approved',
      isActive: true
      // Removed isLive requirement - show offers from all approved active shops
    };

    if (latitude && longitude) {
      // Only fetch shops within the radius
      shopQuery.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] },
          $maxDistance: parseInt(radius)
        }
      };
      
      console.log(`[Featured Offers] Finding shops within ${radius}m of ${latitude}, ${longitude}`);
      const shops = await Shop.find(shopQuery).select('_id location');
      shopIds = shops.map(shop => shop._id);
      console.log(`[Featured Offers] Found ${shopIds.length} shops within radius`);
    } else {
      // All active/approved shops (no location filter)
      console.log('[Featured Offers] Finding all active/approved shops (no location filter)');
      const shops = await Shop.find(shopQuery).select('_id');
      shopIds = shops.map(shop => shop._id);
      console.log(`[Featured Offers] Found ${shopIds.length} total shops`);
    }
    
    if (shopIds.length === 0) {
      console.log('[Featured Offers] No shops found matching criteria');
      return res.json({
        success: true,
        data: {
          offers: [],
          total: 0,
          timestamp: new Date().toISOString()
        }
      });
    }

    filter.shopId = { $in: shopIds };
    console.log(`[Featured Offers] Querying offers for ${shopIds.length} shops`);

    // Get featured offers with shop and product details
    const offers = await Offer.find(filter)
      .populate('shopId', 'shopName address phone location rating isLive')
      .populate('productId', 'name category price images')
      .sort({ createdAt: -1 })
      .limit(limit);

    console.log(`[Featured Offers] Found ${offers.length} offers from database`);

    // Filter out offers with null shopId or productId and transform for frontend
    const transformedOffers = offers
      .filter(offer => offer.shopId && offer.productId)
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
        shop: {
          id: offer.shopId._id,
          name: offer.shopId.shopName,
          address: offer.shopId.address,
          phone: offer.shopId.phone,
          rating: offer.shopId.rating || 0,
          isLive: offer.shopId.isLive || false
        },
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

    console.log(`[Featured Offers] Returning ${transformedOffers.length} valid offers`);

    res.json({
      success: true,
      data: {
        offers: transformedOffers,
        total: transformedOffers.length,
        timestamp: new Date().toISOString()
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
