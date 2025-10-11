const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  // Reference to the user who wrote the review
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Reference to the shop being reviewed
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  
  // Review content
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true,
    trim: true
  },
  
  // Review status
  status: {
    type: String,
    enum: ['active', 'flagged', 'removed'],
    default: 'active'
  },
  
  // Reporting and moderation
  reportCount: {
    type: Number,
    default: 0
  },
  reportReasons: [{
    reason: String,
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reportedAt: { type: Date, default: Date.now }
  }],
  
  // Moderation details
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  moderationNotes: String,
  moderatedAt: Date,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
reviewSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Post-save middleware to update shop rating
reviewSchema.post('save', async function(doc) {
  try {
    if (doc.status === 'active') {
      await updateShopRating(doc.shopId);
    }
  } catch (error) {
    console.error('Error updating shop rating after review save:', error);
  }
});

// Post-remove middleware to update shop rating
reviewSchema.post('findOneAndDelete', async function(doc) {
  try {
    if (doc && doc.status === 'active') {
      await updateShopRating(doc.shopId);
    }
  } catch (error) {
    console.error('Error updating shop rating after review delete:', error);
  }
});

// Post-update middleware to update shop rating
reviewSchema.post('findOneAndUpdate', async function(doc) {
  try {
    if (doc && doc.status === 'active') {
      await updateShopRating(doc.shopId);
    }
  } catch (error) {
    console.error('Error updating shop rating after review update:', error);
  }
});

// Index for efficient querying
reviewSchema.index({ shopId: 1 });
reviewSchema.index({ status: 1 });
reviewSchema.index({ createdAt: -1 });

// Ensure one review per user per shop
reviewSchema.index({ userId: 1, shopId: 1 }, { unique: true });

// Helper function to update shop rating
async function updateShopRating(shopId) {
  try {
    const Shop = require('./shopModel');
    const Review = mongoose.model('Review', reviewSchema);
    
    // Calculate average rating and count for the shop
    const ratingStats = await Review.aggregate([
      { $match: { shopId: shopId, status: 'active' } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 }
        }
      }
    ]);

    const averageRating = ratingStats.length > 0 ? ratingStats[0].averageRating : 0;
    const reviewCount = ratingStats.length > 0 ? ratingStats[0].reviewCount : 0;

    // Update shop with new rating and review count
    await Shop.findByIdAndUpdate(shopId, {
      rating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
      reviewCount: reviewCount
    });

    console.log(`Updated shop ${shopId} rating: ${averageRating}, count: ${reviewCount}`);
  } catch (error) {
    console.error('Error updating shop rating:', error);
  }
}

module.exports = mongoose.model('Review', reviewSchema);
