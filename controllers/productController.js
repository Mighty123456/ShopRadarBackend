const Product = require('../models/productModel');
const Shop = require('../models/shopModel');
const { logActivity } = require('./activityController');

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

// Get product statistics
exports.getProductStats = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const activeProducts = await Product.countDocuments({ status: 'active' });
    const removedProducts = await Product.countDocuments({ status: 'removed' });
    const flaggedProducts = await Product.countDocuments({ status: 'flagged' });
    
    // Get products created in the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newProducts = await Product.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
    
    // Get products by category
    const categoryStats = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
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
