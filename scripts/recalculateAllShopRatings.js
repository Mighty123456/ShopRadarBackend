/**
 * Script to recalculate all shop ratings from active reviews
 * Run this script to fix shops that have 0.0 rating but have reviews
 * 
 * Usage: node scripts/recalculateAllShopRatings.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Review = require('../models/reviewModel');
const Shop = require('../models/shopModel');

async function recalculateAllShopRatings() {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      console.error('MONGODB_URI is not set in environment');
      process.exit(1);
    }

    await mongoose.connect(mongoURI);
    console.log('Connected to MongoDB');

    // Get all shops
    const shops = await Shop.find({});
    console.log(`Found ${shops.length} shops to process`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const shop of shops) {
      try {
        // Calculate average rating and count for the shop (only active reviews)
        const ratingStats = await Review.aggregate([
          { $match: { shopId: shop._id, status: 'active' } },
          {
            $group: {
              _id: null,
              averageRating: { $avg: '$rating' },
              reviewCount: { $sum: 1 }
            }
          }
        ]);

        const averageRating = ratingStats.length > 0 && ratingStats[0].averageRating 
          ? ratingStats[0].averageRating 
          : 0;
        const reviewCount = ratingStats.length > 0 ? ratingStats[0].reviewCount : 0;

        const finalRating = averageRating > 0 ? Math.round(averageRating * 10) / 10 : 0;

        // Update shop
        await Shop.findByIdAndUpdate(shop._id, {
          rating: finalRating,
          reviewCount: reviewCount
        });

        if (finalRating > 0 || reviewCount > 0) {
          console.log(`✓ Updated ${shop.shopName || shop._id}: rating=${finalRating}, reviews=${reviewCount}`);
          updatedCount++;
        }
      } catch (error) {
        console.error(`✗ Error updating shop ${shop._id}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total shops processed: ${shops.length}`);
    console.log(`Successfully updated: ${updatedCount}`);
    console.log(`Errors: ${errorCount}`);

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
recalculateAllShopRatings();

