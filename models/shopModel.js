const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  // Reference to the user who owns this shop
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Shop basic information
  shopName: { 
    type: String, 
    required: true,
    trim: true
  },
  licenseNumber: { 
    type: String, 
    required: true,
    trim: true,
    unique: true
  },
  state: { 
    type: String
  },
  phone: { 
    type: String, 
    required: true,
    trim: true
  },
  
  // Address information
  address: { 
    type: String, 
    required: true,
    trim: true
  },
  
  // Location verification data (only set after GPS step)
  location: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: {
      type: [Number] // [longitude, latitude] for GeoJSON
    }
  },
  gpsAddress: { 
    type: String,
    trim: true
  },
  isLocationVerified: { 
    type: Boolean, 
    default: false 
  },
  
  // License document
  licenseFile: {
    filename: String,
    originalName: String,
    path: String,
    uploadedAt: { type: Date, default: Date.now }
  },

  // New: Cloudinary-backed license document and OCR results
  licenseDocument: {
    url: { type: String, trim: true },
    publicId: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    localPath: { type: String, trim: true }, // Local file path
    localFilename: { type: String, trim: true }, // Local filename
    uploadedAt: { type: Date, default: Date.now }
  },
  licenseOcr: {
    extractedLicenseNumber: { type: String, trim: true },
    extractedAddress: { type: String, trim: true },
    rawText: String,
    processedAt: Date
  },
  
  // Verification status
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  verificationNotes: String,
  verifiedAt: Date,
  verifiedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Admin' 
  },

  // Address comparison
  reverseGeocodedAddress: { type: String, trim: true },
  addressMatchScore: { type: Number, min: 0, max: 100, default: 0 },
  flags: {
    addressMismatch: { type: Boolean, default: false },
    licenceMismatch: { type: Boolean, default: false },
    exifMismatch: { type: Boolean, default: false }
  },

  // Phone verification status (for OTP on phone)
  phoneVerified: { type: Boolean, default: false },

  // Shop photo proof and EXIF
  photoProof: {
    url: { type: String, trim: true },
    publicId: { type: String, trim: true },
    exif: {
      gpsLatitude: Number,
      gpsLongitude: Number
    },
    uploadedAt: { type: Date, default: Date.now }
  },

  // Final approval lock and badge (set when approved)
  locationLock: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: {
      type: [Number] // [lng, lat]
    }
  },
  isLocationLocked: { type: Boolean, default: false },
  verifiedBadge: { type: Boolean, default: false },
  
  // Shop status
  isActive: { 
    type: Boolean, 
    default: false 
  },
  isLive: { 
    type: Boolean, 
    default: false 
  },
  
  // Business information
  category: { 
    type: String, 
    default: 'Other',
    trim: true
  },
  description: { 
    type: String, 
    trim: true
  },
  openingHours: { 
    type: String, 
    default: 'Mon-Sun: 9:00 AM - 9:00 PM',
    trim: true
  },
  amenities: [{ 
    type: String, 
    trim: true 
  }],
  
  // Rating and review fields
  rating: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: { 
    type: Number, 
    default: 0,
    min: 0
  },
  
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

// Create 2dsphere index for location-based queries
// Define geospatial index only if location is present
shopSchema.index({ location: '2dsphere' }, { sparse: true });

// Update the updatedAt field before saving
shopSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for formatted address
shopSchema.virtual('formattedAddress').get(function() {
  return `${this.address}, ${this.state}`;
});

// Ensure virtual fields are serialized
shopSchema.set('toJSON', { virtuals: true });

// Backward compatibility: expose `name` as alias of `shopName`
shopSchema.virtual('name').get(function() {
  return this.shopName;
});

module.exports = mongoose.model('Shop', shopSchema);
