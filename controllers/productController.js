const Product = require('../models/productModel');
const Shop = require('../models/shopModel');
const Offer = require('../models/offerModel');
const { logActivity } = require('./activityController');
const websocketService = require('../services/websocketService');
const { expandQueryTerms, computeProductRelevance } = require('../services/searchService');
const { handleSingleFile } = require('./uploadController');
const { uploadBuffer, isCloudinaryConfigured } = require('../services/cloudinaryService');

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
      const tokens = expandQueryTerms(q);
      const escapedTokens = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const anyToken = escapedTokens.length ? new RegExp(`(${escapedTokens.join('|')})`, 'i') : null;
      if (anyToken) {
        filter.$or = [
          { name: anyToken },
          { description: anyToken },
          { category: anyToken }
        ];
      }
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

    // Fetch best active and currently valid offer per product (percentage normalized 0-100)
    // CRITICAL: Only include offers for the specific product, not shop-level offers
    const productIdToBestDiscount = {};
    try {
      const productIds = items.map(p => p._id);
      const productIdToPrice = {};
      const productIdMap = {}; // Map for exact ObjectId matching
      
      // Build maps for quick lookup - ensure consistent string format
      for (const p of items) {
        const pid = String(p._id); // Use String() for consistent conversion
        productIdToPrice[pid] = Number(p.price) || 0;
        productIdMap[pid] = p._id; // Store original ObjectId for exact matching
      }
      
      const now = new Date();
      const activeOffers = await Offer.find({
        productId: { $in: productIds },
        status: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now }
      }).select('productId discountType discountValue').lean();
      
      // Only process offers that are actually for these specific products
      for (const offer of activeOffers) {
        // Ensure productId is properly extracted and normalized
        // Handle both ObjectId and string formats for comparison
        let pid = null;
        if (offer.productId) {
          // Convert to string for comparison, handling ObjectId objects
          if (offer.productId instanceof mongoose.Types.ObjectId || 
              (typeof offer.productId === 'object' && offer.productId.toString)) {
            pid = offer.productId.toString();
          } else {
            pid = String(offer.productId);
          }
        }
        
        // CRITICAL: Verify this offer belongs to one of our search result products
        // Use strict comparison to ensure exact match
        if (!pid || !productIdToPrice.hasOwnProperty(pid)) {
          // Skip if offer doesn't match any product in our search results
          // This prevents shop-level offers from being applied to wrong products
          continue;
        }
        
        // Additional verification: Ensure the product ID string matches exactly
        // This catches any edge cases where string conversion might differ
        const matchingProduct = items.find(p => String(p._id) === pid);
        if (!matchingProduct) {
          // This shouldn't happen if hasOwnProperty check passed, but double-check anyway
          continue;
        }
        
        let value = 0;
        if (offer.discountType === 'Percentage') {
          value = Number(offer.discountValue);
        } else if (offer.discountType === 'Fixed Amount') {
          // Convert fixed amount to percentage of the product price
          const price = productIdToPrice[pid] || 0;
          if (price > 0) {
            value = Math.max(0, Math.min(100, (Number(offer.discountValue) / price) * 100));
          } else {
            value = 0;
          }
        }
        
        // Only set if this is a better discount than already found for this product
        if (value > 0 && (productIdToBestDiscount[pid] == null || value > productIdToBestDiscount[pid])) {
          productIdToBestDiscount[pid] = value;
        }
      }
      
      // Debug: Log products without offers to verify they're not getting shop offers
      const productsWithoutOffers = items.filter(p => !productIdToBestDiscount[String(p._id)]);
      if (productsWithoutOffers.length > 0) {
        console.log(`[Product Search] Products WITHOUT offers: ${productsWithoutOffers.map(p => `"${p.name}" (${String(p._id)})`).join(', ')}`);
      }
    } catch (error) {
      console.error('Error fetching product offers:', error);
    }

    // Build mapped results with simple relevance
    const tokensForScore = q ? expandQueryTerms(q) : [];
    const mapped = items
      .filter(p => p.shopId && p.shopId.isActive && p.shopId.isLive && p.shopId.verificationStatus === 'approved')
      .map(p => {
        const obj = {
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
          // CRITICAL: Only use product-specific offers, never shop-level offers
          // If productIdToBestDiscount doesn't have this product's ID, return 0 (no offer)
          bestOfferPercent: productIdToBestDiscount[String(p._id)] ?? 0,
          createdAt: p.createdAt
        };
        if (tokensForScore.length) {
          obj._score = computeProductRelevance({
            product: obj,
            shop: obj.shop,
            tokens: tokensForScore,
            distanceKm: undefined,
            bestOfferPercent: obj.bestOfferPercent,
          });
        }
        return obj;
      });

    const ranked = q ? mapped.sort((a, b) => (b._score || 0) - (a._score || 0)) : mapped;

    res.json({
      success: true,
      data: ranked.map(({ _score, ...rest }) => rest),
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

// Search products with shops that have offers (enhanced search)
exports.searchProductsWithShopsAndOffers = async (req, res) => {
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
      sort, // relevance|price_asc|price_desc|new
      latitude,
      longitude,
      radius = 10000 // radius in meters for shop location filtering
    } = req.query;

    // Build product filter
    const productFilter = { status: 'active' };
    if (category) {
      productFilter.category = category;
    }
    if (minPrice != null || maxPrice != null) {
      productFilter.price = {};
      if (minPrice != null) productFilter.price.$gte = Number(minPrice);
      if (maxPrice != null) productFilter.price.$lte = Number(maxPrice);
    }
    if (inStock === 'true') {
      productFilter.stock = { $gt: 0 };
    }
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const terms = escaped
        .split(/\s+/)
        .filter(Boolean)
        .map(t => t.trim());
      const lookahead = terms.length
        ? new RegExp(terms.map(t => `(?=.*${t})`).join('') + '.*', 'i')
        : new RegExp(escaped, 'i');

      productFilter.$or = [
        { name: lookahead },
        { description: lookahead },
        { category: lookahead }
      ];
    }

    // Build shop filter for location-based search
    const shopFilter = {
      verificationStatus: 'approved',
      isActive: true,
      isLive: true
    };

    if (latitude && longitude) {
      shopFilter.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] },
          $maxDistance: parseInt(radius)
        }
      };
    }

    // Get shops that match the location filter
    const shops = await Shop.find(shopFilter).select('_id shopName address phone location rating isLive');
    const shopIds = shops.map(s => s._id);

    // Add shop filter to product filter
    productFilter.shopId = { $in: shopIds };

    // Sorting
    let sortOption = { createdAt: -1, _id: 1 };
    if (sort === 'price_asc') sortOption = { price: 1, _id: 1 };
    else if (sort === 'price_desc') sortOption = { price: -1, _id: 1 };

    // Get products
    const [items, total] = await Promise.all([
      Product.find(productFilter)
        .select('name description category price images status createdAt shopId')
        .populate('shopId', 'shopName address phone location rating isLive isActive verificationStatus')
        .sort(sortOption)
        .skip(skip)
        .limit(limit),
      Product.countDocuments(productFilter)
    ]);

    // Fetch offers for all shops (not just those with matching products)
    const now = new Date();
    const allShopOffers = await Offer.find({
      shopId: { $in: shopIds },
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now }
    })
    .populate('productId', 'name category price images')
    .select('shopId productId title description discountType discountValue startDate endDate');

    // Group offers by shop ID
    const offersByShop = {};
    for (const offer of allShopOffers) {
      const shopId = offer.shopId.toString();
      if (!offersByShop[shopId]) {
        offersByShop[shopId] = [];
      }
      offersByShop[shopId].push({
        id: offer._id,
        title: offer.title,
        description: offer.description,
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        startDate: offer.startDate,
        endDate: offer.endDate,
        product: offer.productId ? {
          id: offer.productId._id,
          name: offer.productId.name,
          category: offer.productId.category,
          price: offer.productId.price,
          images: offer.productId.images || []
        } : null
      });
    }

    // Create shop map for easy lookup
    const shopMap = {};
    for (const shop of shops) {
      shopMap[shop._id.toString()] = {
        id: shop._id,
        name: shop.shopName,
        address: shop.address,
        phone: shop.phone,
        location: shop.location,
        rating: shop.rating || 0,
        isLive: shop.isLive,
        offers: offersByShop[shop._id.toString()] || []
      };
    }

    // Filter products and include shop data
    const filteredProducts = items
      .filter(p => p.shopId && p.shopId.isActive && p.shopId.verificationStatus === 'approved')
      .map(p => ({
        id: p._id,
        name: p.name,
        description: p.description,
        category: p.category,
        price: p.price,
        image: Array.isArray(p.images) && p.images.length ? p.images[0].url : undefined,
        shop: shopMap[p.shopId._id.toString()] || null,
        createdAt: p.createdAt
      }));

    // Get all shops with offers (including those without matching products)
    const shopsWithOffers = Object.values(shopMap).filter(shop => shop.offers.length > 0);

    res.json({
      success: true,
      data: {
        products: filteredProducts,
        shops: shopsWithOffers,
        totalProducts: total,
        totalShops: shopsWithOffers.length
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        limit
      }
    });
  } catch (error) {
    console.error('Search products with shops and offers error:', error);
    res.status(500).json({ success: false, message: 'Failed to search products with shops' });
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
      brand: product.brand,
      itemName: product.itemName,
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
    const { name, description, category, price, stock, status, image, brand, itemName, model } = req.body;
    
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
    if (brand !== undefined) product.brand = brand;
    if (itemName !== undefined) product.itemName = itemName;
    // Handle model as itemName for backward compatibility
    if (model !== undefined && itemName === undefined) product.itemName = model;
    if (price !== undefined) product.price = price;
    if (stock !== undefined) product.stock = stock;
    if (status !== undefined) product.status = status;
    
    // Update image if provided
    if (image !== undefined) {
      if (image && typeof image === 'object') {
        // If image is provided as an object with url, publicId, etc.
        product.images = [image];
      } else if (image === null || image === '') {
        // If image is null or empty string, clear images
        product.images = [];
      }
    }
    
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
    if (!product || !product.name || !product.category || !product.brand || !product.itemName || !product.price || product.stock === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Product name, category, brand, item name, price, and stock are required'
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
      brand: product.brand,
      itemName: product.itemName,
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
      
      // Ensure startDate is not in the future for immediate visibility
      const now = new Date();
      let parsedStart = new Date(offer.startDate);
      if (parsedStart > now) {
        parsedStart = new Date(now.getTime());
        console.log(`[Create Product with Offer] Adjusted startDate to current time for immediate visibility`);
      }
      
      const offerData = {
        shopId: shop._id,
        productId: newProduct._id,
        title: offer.title,
        description: offer.description || '',
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        startDate: parsedStart,
        endDate: new Date(offer.endDate),
        maxUses: offer.maxUses || 0,
        status: 'active'
      };
      
      newOffer = new Offer(offerData);
      await newOffer.save();
      
      // Populate offer details for broadcasting
      await newOffer.populate('productId', 'name category price images');
      await newOffer.populate('shopId', 'shopName address phone location rating isLive verificationStatus isActive');
      
      // Broadcast new offer to all connected clients
      websocketService.broadcastNewOffer({
        id: newOffer._id,
        title: newOffer.title,
        description: newOffer.description,
        discountType: newOffer.discountType,
        discountValue: newOffer.discountValue,
        startDate: newOffer.startDate,
        endDate: newOffer.endDate,
        isCustomOffer: false,
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
      
      // Broadcast featured offers refresh signal
      try {
        websocketService.broadcastFeaturedOffersUpdate({ refresh: true, newOfferId: newOffer._id.toString() });
        console.log(`[Create Product with Offer] Broadcasted featured offers refresh signal for new offer: ${newOffer._id}`);
      } catch (broadcastErr) {
        console.error('[Create Product with Offer] Error broadcasting featured offers update:', broadcastErr);
      }
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

// POST /api/products/upload-image - Upload product image (form-data: file, category)
exports.uploadProductImage = [handleSingleFile, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const category = req.body.category || req.query.category;
    if (!category) {
      return res.status(400).json({ success: false, message: 'Product category is required for image folder organization.' });
    }
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    // Find current shop
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Associated shop not found for this user.' });
    }
    const shopCode = shop.licenseNumber || shop._id.toString();
    // Build target folder: <shopCode>/<category>
    const cloudinaryFolder = `${shopCode}/${category}`;
    if (!isCloudinaryConfigured()) {
      return res.status(500).json({ success: false, message: 'Cloudinary not configured' });
    }
    // Perform upload
    const uploadResult = await uploadBuffer(file.buffer, cloudinaryFolder, file.originalname);
    // Response format matches the images schema in Product model and frontend expectations
    return res.json({
      success: true,
      data: {
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        mimeType: uploadResult.mimeType,
        uploadedAt: new Date()
      }
    });
  } catch (e) {
    console.error('Product image upload error:', e);
    return res.status(500).json({ success: false, message: 'Failed to upload product image' });
  }
}];
