const Shop = require('../models/shopModel');
const User = require('../models/userModel');
const Product = require('../models/productModel');
const Offer = require('../models/offerModel');
const Review = require('../models/reviewModel');
const emailService = require('../services/emailService');
const { reverseGeocode, forwardGeocode, computeAddressMatchScore } = require('../services/geocodingService');
const { extractTextFromUrl, extractLicenseDetails } = require('../services/ocrService');
const { uploadFromUrl } = require('../services/cloudinaryService');
const { parseExifFromImageUrl } = require('../services/exifService');

// Public: Search shops (keyword + optional geo radius + pagination)
exports.searchShopsPublic = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const { q, latitude, longitude, radius = 5000, sort } = req.query; // radius in meters

    const filter = {
      verificationStatus: 'approved',
      isActive: true,
      isLive: true
    };

    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { shopName: regex },
        { address: regex },
        { state: regex }
      ];
    }

    // Geo filter when lat/lng provided
    if (latitude && longitude) {
      filter.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] },
          $maxDistance: parseInt(radius)
        }
      };
    }

    let sortOption = { createdAt: -1, _id: 1 };
    if (!filter.location && sort === 'name') sortOption = { shopName: 1, _id: 1 };

    const [shops, total] = await Promise.all([
      Shop.find(filter)
        .select('shopName address phone location verificationStatus createdAt')
        .sort(sortOption)
        .skip(skip)
        .limit(limit),
      Shop.countDocuments({
        verificationStatus: 'approved',
        isActive: true,
        isLive: true,
        ...(q ? { $or: [ { shopName: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { address: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { state: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } ] } : {})
      })
    ]);

    res.json({
      success: true,
      data: shops.map(s => ({
        id: s._id,
        name: s.shopName,
        address: s.address,
        phone: s.phone,
        location: s.location,
        createdAt: s.createdAt
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        limit
      }
    });
  } catch (err) {
    console.error('Public shop search error:', err);
    res.status(500).json({ success: false, message: 'Failed to search shops' });
  }
};

// Get all shops for admin review
exports.getAllShops = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const query = {};
    if (status) {
      query.verificationStatus = status;
    }
    
    const shops = await Shop.find(query)
      .populate('ownerId', 'fullName email')
      .populate('verifiedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Shop.countDocuments(query);
    
    res.json({
      shops,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (err) {
    console.error('Get all shops error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get shop by ID
exports.getShopById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const shop = await Shop.findById(id)
      .populate('ownerId', 'fullName email')
      .populate('verifiedBy', 'fullName email');
    
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    
    // Enrich admin payload with verification artifacts
    res.json({ shop });
  } catch (err) {
    console.error('Get shop by ID error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Verify shop (approve/reject)
exports.verifyShop = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body; // status: 'approved' or 'rejected'
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid verification status' });
    }
    
    const shop = await Shop.findById(id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    
    if (shop.verificationStatus !== 'pending') {
      return res.status(400).json({ message: 'Shop has already been verified' });
    }
    
    // Update shop verification status
    shop.verificationStatus = status;
    shop.verificationNotes = notes;
    shop.verifiedAt = new Date();
    shop.verifiedBy = req.admin.id; // Admin who verified
    
    if (status === 'approved') {
      shop.isActive = true;
      // Lock location if GPS and checks were done
      if (!shop.isLocationLocked && shop.location && Array.isArray(shop.location.coordinates)) {
        shop.locationLock = shop.location;
        shop.isLocationLocked = true;
      }
      shop.verifiedBadge = true;
      shop.isLive = true;
    }
    
    await shop.save();
    
    // Update user's shop status
    const user = await User.findById(shop.ownerId);
    if (user) {
      await user.save();
    }
    
    // Send email notification to shop owner
    try {
      const emailSent = await emailService.sendShopVerificationNotification(
        user.email,
        shop.shopName,
        status,
        notes
      );
      
      if (!emailSent) {
        console.log(`Failed to send verification email to ${user.email}`);
      } else {
        console.log(`Verification email sent to ${user.email} for shop ${shop.shopName}`);
      }
    } catch (emailError) {
      console.error('Error sending verification email:', emailError);
      // Don't fail the verification if email fails
    }
    
    res.json({ 
      message: `Shop ${status} successfully`,
      shop: {
        _id: shop._id,
        shopName: shop.shopName,
        verificationStatus: shop.verificationStatus,
        verificationNotes: shop.verificationNotes,
        verifiedAt: shop.verifiedAt
      }
    });
  } catch (err) {
    console.error('Verify shop error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get shops near a location (for customers)
exports.getShopsNearLocation = async (req, res) => {
  try {
    const { latitude, longitude, radius = 5000 } = req.query; // radius in meters
    
    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }
    
    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);
    
    const shops = await Shop.find({
      verificationStatus: 'approved',
      isActive: true,
      isLive: true,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [userLon, userLat]
          },
          $maxDistance: parseInt(radius)
        }
      }
    })
    .populate('ownerId', 'fullName')
    .select('shopName address phone location verificationStatus rating reviewCount openingHours category description amenities');
    
    // Calculate distance for each shop and add it to the response
    const shopsWithDistance = shops.map(shop => {
      const shopLocation = shop.location.coordinates;
      const shopLat = shopLocation[1];
      const shopLon = shopLocation[0];
      
      // Calculate distance in meters using haversine formula
      const distanceMeters = haversineMeters(userLat, userLon, shopLat, shopLon);
      const distanceKm = distanceMeters / 1000;
      
      return {
        _id: shop._id,
        id: shop._id,
        shopName: shop.shopName,
        name: shop.shopName,
        address: shop.address,
        phone: shop.phone,
        latitude: shopLat,
        longitude: shopLon,
        location: shop.location,
        rating: shop.rating || 0,
        reviewCount: shop.reviewCount || 0,
        distance: distanceKm,
        distanceKm: distanceKm,
        openingHours: shop.openingHours || '',
        category: shop.category || 'Other',
        description: shop.description || '',
        amenities: shop.amenities || [],
        isLive: true,
        isOpen: true, // Assuming all returned shops are open since we filter by isLive
        verificationStatus: shop.verificationStatus,
        owner: shop.ownerId
      };
    });
    
    res.json({ shops: shopsWithDistance });
  } catch (err) {
    console.error('Get shops near location error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get shop statistics for admin dashboard
exports.getShopStats = async (req, res) => {
  try {
    const totalShops = await Shop.countDocuments();
    const pendingShops = await Shop.countDocuments({ verificationStatus: 'pending' });
    const approvedShops = await Shop.countDocuments({ verificationStatus: 'approved' });
    const rejectedShops = await Shop.countDocuments({ verificationStatus: 'rejected' });
    const activeShops = await Shop.countDocuments({ isActive: true });
    const liveShops = await Shop.countDocuments({ isLive: true });
    
    // Recent registrations (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentRegistrations = await Shop.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });
    
    res.json({
      totalShops,
      pendingShops,
      approvedShops,
      rejectedShops,
      activeShops,
      liveShops,
      recentRegistrations
    });
  } catch (err) {
    console.error('Get shop stats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update shop status (activate/deactivate)
exports.updateShopStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, isLive } = req.body;
    
    const shop = await Shop.findById(id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    
    if (shop.verificationStatus !== 'approved') {
      return res.status(400).json({ message: 'Shop must be approved before status changes' });
    }
    
    if (isActive !== undefined) {
      shop.isActive = isActive;
    }
    
    if (isLive !== undefined) {
      shop.isLive = isLive;
    }
    
    await shop.save();
    
    res.json({ 
      message: 'Shop status updated successfully',
      shop: {
        _id: shop._id,
        shopName: shop.shopName,
        isActive: shop.isActive,
        isLive: shop.isLive
      }
    });
  } catch (err) {
    console.error('Update shop status error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== SHOP OWNER SPECIFIC CONTROLLERS =====

// Get shop owner's own shop details
exports.getMyShop = async (req, res) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user.id })
      .populate('ownerId', 'fullName email')
      .populate('verifiedBy', 'fullName email');
    
    if (!shop) {
      return res.status(404).json({ 
        message: 'No shop found for this user. Please register a shop first.' 
      });
    }
    
    res.json({ 
      shop,
      message: 'Shop details retrieved successfully'
    });
  } catch (err) {
    console.error('Get my shop error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update shop owner's own shop details
exports.updateMyShop = async (req, res) => {
  try {
    const { 
      shopName, 
      phone, 
      address, 
      gpsAddress,
      location 
    } = req.body;
    
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({ 
        message: 'No shop found for this user' 
      });
    }
    
    // Allow updates before approval only for certain fields if needed; keep as-is for now
    
    // Update allowed fields
    if (shopName) shop.shopName = shopName;
    if (phone) shop.phone = phone;
    if (address) shop.address = address;
    if (gpsAddress) shop.gpsAddress = gpsAddress;
    
    // Update location if provided
    if (location && location.latitude && location.longitude) {
      shop.location = {
        type: 'Point',
        coordinates: [location.longitude, location.latitude]
      };
      shop.isLocationVerified = false; // Reset verification when location changes
    }
    
    await shop.save();
    
    res.json({ 
      message: 'Shop details updated successfully',
      shop: {
        _id: shop._id,
        shopName: shop.shopName,
        phone: shop.phone,
        address: shop.address,
        gpsAddress: shop.gpsAddress,
        location: shop.location,
        isLocationVerified: shop.isLocationVerified,
        verificationStatus: shop.verificationStatus,
        isActive: shop.isActive,
        isLive: shop.isLive
      }
    });
  } catch (err) {
    console.error('Update my shop error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Step 2: Submit GPS location, reverse geocode and compute address match
exports.submitGpsAndVerifyAddress = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user' });
    }
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    // Save GPS point
    shop.location = { type: 'Point', coordinates: [longitude, latitude] };

    // Reverse geocode
    const result = await reverseGeocode(latitude, longitude);
    const reverseAddress = result ? result.formattedAddress : '';
    shop.reverseGeocodedAddress = reverseAddress;
    const matchScore = computeAddressMatchScore(shop.address, reverseAddress);
    shop.addressMatchScore = matchScore;
    
    // Compute distance to reverse-geocoded point when available
    let distanceMeters = undefined;
    if (result && typeof result.latitude === 'number' && typeof result.longitude === 'number') {
      distanceMeters = haversineMeters(latitude, longitude, result.latitude, result.longitude);
    }
    
    // More flexible location verification:
    // 1. Allow 100m tolerance for shop movement (instead of strict 1km)
    // 2. Consider address match score as primary factor
    // 3. Allow verification if either condition is met:
    //    - Address match score >= 60% (reduced from 70%)
    //    - Distance within 100m of reverse-geocoded location
    const withinShopArea = typeof distanceMeters === 'number' ? distanceMeters <= 100 : false;
    const goodAddressMatch = matchScore >= 60;
    
    // Location is verified if shopkeeper is within 100m of the address location
    // OR if the address match score is good (60%+)
    shop.isLocationVerified = withinShopArea || goodAddressMatch;
    shop.flags.addressMismatch = !(shop.isLocationVerified);

    await shop.save();
    res.json({
      message: 'GPS submitted and address verified',
      data: {
        reverseGeocodedAddress: reverseAddress,
        addressMatchScore: matchScore,
        isLocationVerified: shop.isLocationVerified,
        distanceMeters,
        withinShopArea,
        goodAddressMatch,
        toleranceUsed: '100m',
        flaggedForReview: shop.flags.addressMismatch
      }
    });
  } catch (err) {
    console.error('submitGpsAndVerifyAddress error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Step 3: OCR license document from Cloudinary URL and cross-check
exports.ocrAndValidateLicense = async (req, res) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) return res.status(404).json({ message: 'No shop found for this user' });

    const url = shop.licenseDocument && shop.licenseDocument.url;
    if (!url) return res.status(400).json({ message: 'No license document available' });

    const rawText = await extractTextFromUrl(url);
    const { extractedLicenseNumber, extractedAddress } = extractLicenseDetails(rawText);

    shop.licenseOcr = {
      extractedLicenseNumber: extractedLicenseNumber || null,
      extractedAddress: extractedAddress || null,
      rawText,
      processedAt: new Date()
    };

    // Compare license number
    const licMatch = !!extractedLicenseNumber && extractedLicenseNumber.replace(/\s/g, '') === shop.licenseNumber.replace(/\s/g, '');
    
    // Compare addresses using text similarity
    const addrScore = computeAddressMatchScore(shop.address, extractedAddress || '');
    const gpsAddrScore = computeAddressMatchScore(shop.reverseGeocodedAddress || '', extractedAddress || '');

    // NEW: GPS distance comparison for PDF address vs current location
    let pdfGpsDistance = null;
    let pdfWithinShopArea = false;
    
    if (extractedAddress && shop.location && Array.isArray(shop.location.coordinates)) {
      try {
        // Forward geocode the extracted PDF address to get GPS coordinates
        const pdfGeocodeResult = await forwardGeocode(extractedAddress);
        
        if (pdfGeocodeResult && typeof pdfGeocodeResult.latitude === 'number' && typeof pdfGeocodeResult.longitude === 'number') {
          // Calculate distance between PDF address GPS and current shop GPS
          const [shopLng, shopLat] = shop.location.coordinates;
          pdfGpsDistance = haversineMeters(shopLat, shopLng, pdfGeocodeResult.latitude, pdfGeocodeResult.longitude);
          pdfWithinShopArea = pdfGpsDistance <= 100; // 100m tolerance
          
          console.log(`PDF address GPS distance: ${pdfGpsDistance.toFixed(1)}m, within 100m: ${pdfWithinShopArea}`);
        }
      } catch (geocodeError) {
        console.error('Error geocoding PDF address:', geocodeError);
      }
    }

    // Enhanced verification logic:
    // License mismatch if:
    // 1. License number doesn't match, OR
    // 2. Address similarity is poor (< 60%) AND PDF GPS distance is > 100m (if available)
    const poorAddressMatch = addrScore < 60;
    const pdfLocationMismatch = pdfGpsDistance !== null && pdfGpsDistance > 100;
    
    shop.flags.licenceMismatch = !licMatch || (poorAddressMatch && pdfLocationMismatch);
    await shop.save();

    res.json({
      message: 'License OCR processed',
      data: {
        licNumberMatch: licMatch,
        formVsLicenceAddressScore: addrScore,
        gpsVsLicenceAddressScore: gpsAddrScore,
        pdfGpsDistance: pdfGpsDistance ? Math.round(pdfGpsDistance) : null,
        pdfWithinShopArea,
        pdfAddressGeocoded: pdfGpsDistance !== null,
        toleranceUsed: '100m',
        flaggedForReview: shop.flags.licenceMismatch
      }
    });
  } catch (err) {
    console.error('ocrAndValidateLicense error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Step 4: Upload shop photo proof and extract EXIF GPS; compare to submitted GPS
exports.uploadShopPhotoAndCheckExif = async (req, res) => {
  try {
    const { photoUrl } = req.body; // client already uploaded to Cloudinary or public URL
    if (!photoUrl) return res.status(400).json({ message: 'photoUrl is required' });
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) return res.status(404).json({ message: 'No shop found for this user' });

    // Optionally re-host in Cloudinary folder
    let uploaded = { url: photoUrl, publicId: undefined };
    try {
      uploaded = await uploadFromUrl(photoUrl, 'shop-proof');
    } catch (_) {}

    const exif = await parseExifFromImageUrl(uploaded.url);
    shop.photoProof = {
      url: uploaded.url,
      publicId: uploaded.publicId,
      exif: {
        gpsLatitude: exif.gpsLatitude,
        gpsLongitude: exif.gpsLongitude
      },
      uploadedAt: new Date()
    };

    // Compare EXIF GPS with current shop.location
    let exifMismatch = false;
    if (exif.gpsLatitude != null && exif.gpsLongitude != null && shop.location && Array.isArray(shop.location.coordinates)) {
      const [lng, lat] = shop.location.coordinates;
      const distMeters = haversineMeters(lat, lng, exif.gpsLatitude, exif.gpsLongitude);
      exifMismatch = distMeters > 100; // 100m tolerance
    }
    shop.flags.exifMismatch = exifMismatch;
    await shop.save();

    res.json({
      message: 'Shop photo processed',
      data: {
        exif: shop.photoProof.exif,
        exifMismatch: shop.flags.exifMismatch
      }
    });
  } catch (err) {
    console.error('uploadShopPhotoAndCheckExif error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Update shop owner's shop status (open/closed)
exports.updateMyShopStatus = async (req, res) => {
  try {
    const { isLive } = req.body;
    
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({ 
        message: 'No shop found for this user' 
      });
    }
    
    // Check if shop is approved and active
    if (shop.verificationStatus !== 'approved') {
      return res.status(400).json({ 
        message: 'Cannot change shop status until verification is approved' 
      });
    }
    
    if (!shop.isActive) {
      return res.status(400).json({ 
        message: 'Cannot change shop status. Shop is not active.' 
      });
    }
    
    // Update shop live status
    shop.isLive = isLive;
    await shop.save();
    
    res.json({ 
      message: `Shop ${isLive ? 'opened' : 'closed'} successfully`,
      shop: {
        _id: shop._id,
        shopName: shop.shopName,
        isActive: shop.isActive,
        isLive: shop.isLive,
        verificationStatus: shop.verificationStatus
      }
    });
  } catch (err) {
    console.error('Update my shop status error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get shop owner's shop statistics
exports.getMyShopStats = async (req, res) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({ 
        message: 'No shop found for this user' 
      });
    }
    
    // Aggregate live stats for the shop
    const [
      totalProducts,
      activeOffers,
      customerReviews
    ] = await Promise.all([
      Product.countDocuments({ shopId: shop._id }),
      Offer.countDocuments({ shopId: shop._id, status: 'active' }),
      Review.countDocuments({ shopId: shop._id })
    ]);

    // Placeholder for today's views (requires analytics events collection)
    const todaysViews = 0;

    const stats = {
      totalProducts,
      activeOffers,
      todaysViews,
      customerReviews,
      shopStatus: {
        verificationStatus: shop.verificationStatus,
        isActive: shop.isActive,
        isLive: shop.isLive,
        registrationDate: shop.createdAt
      }
    };
    
    res.json({ 
      stats,
      message: 'Shop statistics retrieved successfully'
    });
  } catch (err) {
    console.error('Get my shop stats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Check shop owner's verification status
exports.getMyShopVerificationStatus = async (req, res) => {
  try {
    const shop = await Shop.findOne({ ownerId: req.user.id })
      .populate('verifiedBy', 'fullName email');
    
    if (!shop) {
      return res.status(404).json({ 
        message: 'No shop found for this user' 
      });
    }
    
    res.json({ 
      verification: {
        status: shop.verificationStatus,
        notes: shop.verificationNotes,
        verifiedAt: shop.verifiedAt,
        verifiedBy: shop.verifiedBy,
        isActive: shop.isActive,
        isLive: shop.isLive
      },
      message: 'Verification status retrieved successfully'
    });
  } catch (err) {
    console.error('Get my shop verification status error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};