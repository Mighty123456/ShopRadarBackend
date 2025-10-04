const mongoose = require('mongoose');
const Offer = require('../models/offerModel');
const Shop = require('../models/shopModel');
const Product = require('../models/productModel');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shopradar', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function createSampleOffers() {
  try {
    console.log('Creating sample offers...');

    // Get the first shop
    const shop = await Shop.findOne({ verificationStatus: 'approved', isActive: true });
    if (!shop) {
      console.log('No verified shops found. Please create a shop first.');
      return;
    }

    console.log(`Found shop: ${shop.shopName}`);

    // Get products for this shop
    const products = await Product.find({ shopId: shop._id, status: 'active' });
    if (products.length === 0) {
      console.log('No products found for this shop. Please create products first.');
      return;
    }

    console.log(`Found ${products.length} products`);

    // Create sample offers for the first few products
    const sampleOffers = [
      {
        shopId: shop._id,
        productId: products[0]._id,
        title: 'Summer Sale - 20% Off',
        description: 'Get 20% off on this amazing product!',
        category: 'Other',
        discountType: 'Percentage',
        discountValue: 20,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        maxUses: 0,
        status: 'active'
      },
      {
        shopId: shop._id,
        productId: products[0]._id,
        title: 'Flash Sale - 15% Off',
        description: 'Limited time offer!',
        category: 'Other',
        discountType: 'Percentage',
        discountValue: 15,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        maxUses: 50,
        status: 'active'
      }
    ];

    // Add more offers if there are more products
    if (products.length > 1) {
      sampleOffers.push({
        shopId: shop._id,
        productId: products[1]._id,
        title: 'New Customer Discount - 25% Off',
        description: 'Special discount for new customers!',
        category: 'Other',
        discountType: 'Percentage',
        discountValue: 25,
        startDate: new Date(),
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
        maxUses: 0,
        status: 'active'
      });
    }

    // Create the offers
    for (const offerData of sampleOffers) {
      const offer = new Offer(offerData);
      await offer.save();
      console.log(`Created offer: ${offer.title} for product ${offer.productId}`);
    }

    console.log(`Successfully created ${sampleOffers.length} sample offers!`);
    console.log('You can now test the search functionality with offers.');

  } catch (error) {
    console.error('Error creating sample offers:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the script
createSampleOffers();
