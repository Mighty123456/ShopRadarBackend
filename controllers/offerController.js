const Offer = require('../models/offerModel');
const Shop = require('../models/shopModel');
const Product = require('../models/productModel');
const { logActivity } = require('./activityController');

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
    const { productId, title, description, discountType, discountValue, startDate, endDate, maxUses } = req.body;

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

    // Create offer
    const offerData = {
      shopId: shop._id,
      productId: productId,
      title,
      description: description || '',
      discountType,
      discountValue,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      maxUses: maxUses || 0,
      status: 'active'
    };

    const newOffer = new Offer(offerData);
    await newOffer.save();

    // Populate product details for response
    await newOffer.populate('productId', 'name category price images');

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

// Get all offers (admin)
exports.getAllOffers = async (req, res) => {
  try {
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

    // Get offers with populated product and shop information
    const offers = await Offer.find(filter)
      .populate('productId', 'name category price stock')
      .populate('shopId', 'name ownerName email phone address')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalOffers = await Offer.countDocuments(filter);
    const totalPages = Math.ceil(totalOffers / limit);

    res.json({
      success: true,
      data: {
        offers,
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

// Get offer statistics (admin)
exports.getOfferStats = async (req, res) => {
  try {
    const totalOffers = await Offer.countDocuments();
    const activeOffers = await Offer.countDocuments({ status: 'active' });
    const inactiveOffers = await Offer.countDocuments({ status: 'inactive' });
    
    // Get offers by discount type
    const percentageOffers = await Offer.countDocuments({ discountType: 'Percentage' });
    const fixedOffers = await Offer.countDocuments({ discountType: 'Fixed Amount' });
    
    // Get recent offers (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentOffers = await Offer.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo } 
    });

    // Get top performing offers (by usage)
    const topOffers = await Offer.find()
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
