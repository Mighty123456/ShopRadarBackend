const Product = require('../models/productModel');
const Shop = require('../models/shopModel');
const Offer = require('../models/offerModel');
const { logActivity } = require('./activityController');
const websocketService = require('../services/websocketService');

// Public: Search products (keyword + filters + pagination)
exports.searchProductsPublic = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const {
      q, // keyword
      category,
      minPrice,
      maxPrice,
      inStock,
      sort // relevance|price_asc|price_desc|new
    } = req.query;

    const filter = { status: 'active' };
    if (category) {
      filter.category = category;
    }
    if (minPrice != null || maxPrice != null) {
      filter.price = {};
      if (minPrice != null) filter.price.$gte = Number(minPrice);
      if (maxPrice != null) filter.price.$lte = Number(maxPrice);
    }
    if (inStock === 'true') {
      filter.stock = { $gt: 0 };
    }
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const terms = escaped
        .split(/\s+/)
        .filter(Boolean)
        .map(t => t.trim());
      // Use lookahead pattern to ensure all terms appear in any order
      // Example: (?=.*sony)(?=.*headphone).*  (case-insensitive)
      const lookahead = terms.length
        ? new RegExp(terms.map(t => `(?=.*${t})`).join('') + '.*', 'i')
        : new RegExp(escaped, 'i');

      filter.$or = [
        { name: lookahead },
        { description: lookahead },
        { category: lookahead }
      ];
    }

    // Sorting
    let sortOption = { createdAt: -1, _id: 1 };
    if (sort === 'price_asc') sortOption = { price: 1, _id: 1 };
    else if (sort === 'price_desc') sortOption = { price: -1, _id: 1 };

    const [items, total] = await Promise.all([
      Product.find(filter)
        .select('name description category price images status createdAt shopId')
        // include shop fields needed by mobile (location, address, rating, phone, live)
        .populate('shopId', 'shopName address phone location rating isLive isActive verificationStatus')
        .sort(sortOption)
        .skip(skip)
        .limit(limit),
      Product.countDocuments(filter)
    ]);

    // Fetch best active offer per product (percentage normalized 0-100)
    const productIdToBestDiscount = {};
    try {
      const productIds = items.map(p => p._id);
      const activeOffers = await Offer.find({
        productId: { $in: productIds },
        status: 'active'
      }).select('productId discountType discountValue');
      for (const offer of activeOffers) {
        const value = offer.discountType === 'percent' ? Number(offer.discountValue) : 0; // only percent for ranking here
        const pid = offer.productId?.toString();
        if (!pid) continue;
        if (productIdToBestDiscount[pid] == null || value > productIdToBestDiscount[pid]) {
          productIdToBestDiscount[pid] = value;
        }
      }
    } catch (_) {}

    res.json({
      success: true,
      data: items
        .filter(p => p.shopId && p.shopId.isActive && p.shopId.isLive && p.shopId.verificationStatus === 'approved')
        .map(p => ({
        id: p._id,
        name: p.name,
        description: p.description,
        category: p.category,
        price: p.price,
        image: Array.isArray(p.images) && p.images.length ? p.images[0].url : undefined,
        shop: p.shopId ? {
          id: p.shopId._id,
          name: p.shopId.shopName,
          address: p.shopId.address,
          phone: p.shopId.phone,
          location: p.shopId.location,
          rating: p.shopId.rating,
          isLive: p.shopId.isLive
        } : null,
        bestOfferPercent: productIdToBestDiscount[p._id.toString()] || 0,
        createdAt: p.createdAt
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        limit
      }
    });
  } catch (error) {
    console.error('Public product search error:', error);
    res.status(500).json({ success: false, message: 'Failed to search products' });
  }
};

// Get all products with pagination and filtering
exports.getAllProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const { category, status, search } = req.query;
    
    // Build filter object
    const filter = {};
    if (category && category !== 'all') {
      filter.category = category;
    }
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const products = await Product.find(filter)
      .populate('shopId', 'shopName licenseNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Product.countDocuments(filter);
    
    // Transform products to match frontend expectations
    const transformedProducts = products.map(product => ({
      id: product._id,
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      status: product.status,
      reportCount: product.reportCount,
      addedDate: product.createdAt.toISOString().split('T')[0],
      shop: product.shopId ? {
        id: product.shopId._id,
        name: product.shopId.shopName,
        licenseNumber: product.shopId.licenseNumber
      } : null,
      images: product.images,
      moderatedBy: product.moderatedBy,
      moderationNotes: product.moderationNotes,
      moderatedAt: product.moderatedAt
    }));
    
    res.json({
      success: true,
      data: {
        products: transformedProducts,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalProducts: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Get all products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
};

// Get product by ID
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id)
      .populate('shopId', 'shopName licenseNumber ownerId')
      .populate('moderatedBy', 'name email');
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    const transformedProduct = {
      id: product._id,
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      status: product.status,
      reportCount: product.reportCount,
      addedDate: product.createdAt.toISOString().split('T')[0],
      shop: product.shopId ? {
        id: product.shopId._id,
        name: product.shopId.shopName,
        licenseNumber: product.shopId.licenseNumber,
        ownerId: product.shopId.ownerId
      } : null,
      images: product.images,
      reportReasons: product.reportReasons,
      moderatedBy: product.moderatedBy,
      moderationNotes: product.moderationNotes,
      moderatedAt: product.moderatedAt
    };
    
    res.json({
      success: true,
      data: { product: transformedProduct }
    });
    
  } catch (error) {
    console.error('Get product by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product'
    });
  }
};

// Update product status (remove/restore)
exports.updateProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!['active', 'removed', 'flagged'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "active", "removed", or "flagged"'
      });
    }
    
    const product = await Product.findById(id).populate('shopId', 'shopName');
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    const previousStatus = product.status;
    product.status = status;
    product.moderatedBy = req.admin?.id;
    product.moderationNotes = notes;
    product.moderatedAt = new Date();
    
    await product.save();
    
    // Log the activity
    await logActivity({
      type: status === 'removed' ? 'product_removed' : 'product_updated',
      description: `Product "${product.name}" ${status === 'removed' ? 'removed' : 'status updated'} by admin`,
      shopId: product.shopId._id,
      adminId: req.admin?.id,
      metadata: {
        productName: product.name,
        previousStatus,
        newStatus: status,
        shopName: product.shopId.shopName,
        moderationNotes: notes
      },
      severity: status === 'removed' ? 'high' : 'medium',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      message: `Product ${status === 'removed' ? 'removed' : 'status updated'} successfully`
    });
    
  } catch (error) {
    console.error('Update product status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product status'
    });
  }
};

// Get product statistics (optionally per shop via ?shopId=...)
exports.getProductStats = async (req, res) => {
  try {
    const { shopId } = req.query;

    const baseFilter = shopId ? { shopId } : {};

    const totalProducts = await Product.countDocuments({ ...baseFilter });
    const activeProducts = await Product.countDocuments({ ...baseFilter, status: 'active' });
    const removedProducts = await Product.countDocuments({ ...baseFilter, status: 'removed' });
    const flaggedProducts = await Product.countDocuments({ ...baseFilter, status: 'flagged' });
    
    // Get products created in the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newProducts = await Product.countDocuments({ ...baseFilter, createdAt: { $gte: thirtyDaysAgo } });
    
    // Get products by category
    const categoryPipeline = [
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ];
    if (shopId) {
      categoryPipeline.unshift({ $match: { shopId: require('mongoose').Types.ObjectId.createFromHexString(shopId) } });
    }
    const categoryStats = await Product.aggregate(categoryPipeline);
    
    res.json({
      success: true,
      data: {
        totalProducts,
        activeProducts,
        removedProducts,
        flaggedProducts,
        newProducts,
        categoryStats
      }
    });
    
  } catch (error) {
    console.error('Get product stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product statistics'
    });
  }
};

// Get shop owner's products
exports.getMyProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const { category, status, search } = req.query;
    
    // Get shop ID from authenticated user
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }
    
    // Build filter object
    const filter = { shopId: shop._id };
    if (category && category !== 'all') {
      filter.category = category;
    }
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Product.countDocuments(filter);
    
    // Transform products to match frontend expectations
    const transformedProducts = products.map(product => ({
      id: product._id,
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      stock: product.stock,
      status: product.status,
      images: product.images,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    }));
    
    res.json({
      success: true,
      data: {
        products: transformedProducts,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalProducts: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Get my products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
};

// Update shop owner's product
exports.updateMyProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, price, stock, status } = req.body;
    
    // Get shop ID from authenticated user
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }
    
    // Find product and verify ownership
    const product = await Product.findOne({ _id: id, shopId: shop._id });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or you do not have permission to update it'
      });
    }
    
    // Update product fields
    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;
    if (category !== undefined) product.category = category;
    if (price !== undefined) product.price = price;
    if (stock !== undefined) product.stock = stock;
    if (status !== undefined) product.status = status;
    
    await product.save();
    
    // Log the activity
    await logActivity({
      type: 'product_updated',
      description: `Product "${product.name}" updated by shop owner`,
      shopId: shop._id,
      userId: req.user.id,
      metadata: {
        productName: product.name,
        productCategory: product.category,
        productPrice: product.price,
        updatedFields: Object.keys(req.body)
      },
      severity: 'low',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    
    // Broadcast product count update (total products)
    const totalProducts = await Product.countDocuments();
    websocketService.broadcastProductCountUpdate(totalProducts);

    res.json({
      success: true,
      message: 'Product updated successfully',
      product: {
        id: product._id,
        name: product.name,
        description: product.description,
        category: product.category,
        price: product.price,
        stock: product.stock,
        status: product.status,
        images: product.images,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      }
    });
    
  } catch (error) {
    console.error('Update my product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product'
    });
  }
};

// Delete shop owner's product
exports.deleteMyProduct = async (req, res) => {
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
    
    // Find product and verify ownership
    const product = await Product.findOne({ _id: id, shopId: shop._id });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or you do not have permission to delete it'
      });
    }
    
    const productName = product.name;
    
    // Delete the product
    await Product.findByIdAndDelete(id);
    
    // Log the activity
    await logActivity({
      type: 'product_deleted',
      description: `Product "${productName}" deleted by shop owner`,
      shopId: shop._id,
      userId: req.user.id,
      metadata: {
        productName: productName,
        productCategory: product.category,
        productPrice: product.price
      },
      severity: 'medium',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    
    // Broadcast product count update (total products)
    const totalProducts = await Product.countDocuments();
    websocketService.broadcastProductCountUpdate(totalProducts);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete my product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product'
    });
  }
};

// Unified endpoint: Create product with optional offer
exports.createProductWithOffer = async (req, res) => {
  try {
    const { product, offer } = req.body;
    
    // Validate product data
    if (!product || !product.name || !product.category || !product.price || product.stock === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Product name, category, price, and stock are required'
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
    
    // Create product
    const productData = {
      shopId: shop._id,
      name: product.name,
      description: product.description || '',
      category: product.category,
      price: product.price,
      stock: product.stock,
      status: 'active'
    };
    
    // Add image if provided
    if (product.image) {
      productData.images = [product.image];
    }
    
    const newProduct = new Product(productData);
    await newProduct.save();
    
    let newOffer = null;
    
    // Create offer if provided
    if (offer && offer.title && offer.discountValue !== undefined) {
      // Validate offer data
      if (!offer.discountType || !offer.startDate || !offer.endDate) {
        return res.status(400).json({
          success: false,
          message: 'Offer discount type, start date, and end date are required'
        });
      }
      
      const offerData = {
        shopId: shop._id,
        productId: newProduct._id,
        title: offer.title,
        description: offer.description || '',
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        startDate: new Date(offer.startDate),
        endDate: new Date(offer.endDate),
        maxUses: offer.maxUses || 0,
        status: 'active'
      };
      
      newOffer = new Offer(offerData);
      await newOffer.save();
    }
    
    // Log the activity
    await logActivity({
      type: 'product_created',
      description: `Product "${newProduct.name}" created${newOffer ? ' with offer' : ''}`,
      shopId: shop._id,
      userId: req.user.id,
      metadata: {
        productName: newProduct.name,
        productCategory: newProduct.category,
        productPrice: newProduct.price,
        hasOffer: !!newOffer,
        offerTitle: newOffer?.title
      },
      severity: 'low',
      status: 'success',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });
    
    // Broadcast product count update (total products)
    const totalProducts = await Product.countDocuments();
    websocketService.broadcastProductCountUpdate(totalProducts);

    res.status(201).json({
      success: true,
      message: newOffer 
        ? 'Product with offer created successfully'
        : 'Product created successfully',
      product: {
        id: newProduct._id,
        name: newProduct.name,
        description: newProduct.description,
        category: newProduct.category,
        price: newProduct.price,
        stock: newProduct.stock,
        status: newProduct.status,
        images: newProduct.images,
        createdAt: newProduct.createdAt
      },
      offer: newOffer ? {
        id: newOffer._id,
        title: newOffer.title,
        description: newOffer.description,
        discountType: newOffer.discountType,
        discountValue: newOffer.discountValue,
        startDate: newOffer.startDate,
        endDate: newOffer.endDate,
        maxUses: newOffer.maxUses,
        currentUses: newOffer.currentUses,
        status: newOffer.status,
        createdAt: newOffer.createdAt
      } : null
    });
    
  } catch (error) {
    console.error('Create product with offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product'
    });
  }
};
