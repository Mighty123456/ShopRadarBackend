const Category = require('../models/categoryModel');
const Shop = require('../models/shopModel');
const Product = require('../models/productModel');

// Create a new category
exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
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
    
    // Check if category already exists for this shop
    const existingCategory = await Category.findOne({ 
      shopId: shop._id, 
      name: name.trim() 
    });
    
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category already exists'
      });
    }
    
    const category = new Category({
      shopId: shop._id,
      name: name.trim(),
      description: description ? description.trim() : '',
      brands: []
    });
    
    await category.save();
    
    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category
    });
    
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category'
    });
  }
};

// Get all categories for a shop
exports.getCategories = async (req, res) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }
    
    const categories = await Category.find({ 
      shopId: shop._id, 
      status: 'active' 
    }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: categories
    });
    
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get categories'
    });
  }
};

// Add brand to category
exports.addBrand = async (req, res) => {
  try {
    const { categoryId, brandName, brandDescription } = req.body;
    
    if (!categoryId || !brandName || brandName.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Category ID and brand name are required'
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
    
    const category = await Category.findOne({ 
      _id: categoryId, 
      shopId: shop._id 
    });
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    // Check if brand already exists in this category
    const existingBrand = category.brands.find(
      brand => brand.name.toLowerCase() === brandName.trim().toLowerCase()
    );
    
    if (existingBrand) {
      return res.status(400).json({
        success: false,
        message: 'Brand already exists in this category'
      });
    }
    
    // Add brand to category
    category.brands.push({
      name: brandName.trim(),
      description: brandDescription ? brandDescription.trim() : ''
    });
    
    await category.save();
    
    res.json({
      success: true,
      message: 'Brand added successfully',
      data: category
    });
    
  } catch (error) {
    console.error('Add brand error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add brand'
    });
  }
};

// Get brands for a category
exports.getBrands = async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }
    
    const category = await Category.findOne({ 
      _id: categoryId, 
      shopId: shop._id 
    });
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    res.json({
      success: true,
      data: category.brands
    });
    
  } catch (error) {
    console.error('Get brands error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get brands'
    });
  }
};

// Update category
exports.updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description } = req.body;
    
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }
    
    const category = await Category.findOne({ 
      _id: categoryId, 
      shopId: shop._id 
    });
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    if (name) category.name = name.trim();
    if (description !== undefined) category.description = description.trim();
    
    await category.save();
    
    res.json({
      success: true,
      message: 'Category updated successfully',
      data: category
    });
    
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update category'
    });
  }
};

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }
    
    const category = await Category.findOne({ 
      _id: categoryId, 
      shopId: shop._id 
    });
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    // Check if category has products
    const productCount = await Product.countDocuments({ 
      shopId: shop._id, 
      category: category.name 
    });
    
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with existing products'
      });
    }
    
    await Category.findByIdAndDelete(categoryId);
    
    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete category'
    });
  }
};

// Get category hierarchy (categories with their brands)
exports.getCategoryHierarchy = async (req, res) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this user'
      });
    }
    
    const categories = await Category.find({ 
      shopId: shop._id, 
      status: 'active' 
    }).sort({ name: 1 });
    
    res.json({
      success: true,
      data: categories
    });
    
  } catch (error) {
    console.error('Get category hierarchy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get category hierarchy'
    });
  }
};

// Public: Get top 10 popular categories by product count
exports.getPopularCategories = async (req, res) => {
  try {
    // Aggregate top categories from Product
    const topCategories = await require('../models/productModel').aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    res.json({ success: true, data: topCategories });
  } catch (e) {
    console.error('Fetch popular categories error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch popular categories' });
  }
};