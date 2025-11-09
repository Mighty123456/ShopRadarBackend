const Shop = require('../models/shopModel');
const User = require('../models/userModel');
const Product = require('../models/productModel');
const Offer = require('../models/offerModel');
const Review = require('../models/reviewModel');
const emailService = require('../services/emailService');
const { reverseGeocode, forwardGeocode, computeAddressMatchScore } = require('../services/geocodingService');
const { expandQueryTerms } = require('../services/searchService');
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
      isActive: true
    };

    if (q) {
      const tokens = expandQueryTerms(q);
      const escapedTokens = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const anyToken = escapedTokens.length ? new RegExp(`(${escapedTokens.join('|')})`, 'i') : null;
      if (anyToken) {
        filter.$or = [
          { shopName: anyToken },
          { address: anyToken },
          { state: anyToken }
        ];
      }
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
        .select('shopName address phone location verificationStatus rating reviewCount createdAt isLive')
        .sort(sortOption)
        .skip(skip)
        .limit(limit),
      Shop.countDocuments({
        verificationStatus: 'approved',
        isActive: true,
        ...(q ? { $or: [ { shopName: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { address: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { state: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } ] } : {})
      })
    ]);

    // Fetch offers for each shop
    const shopIds = shops.map(s => s._id);
    const now = new Date();
    const shopOffers = await Offer.find({
      shopId: { $in: shopIds },
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).select('shopId title description discountType discountValue startDate endDate');

    // Group offers by shop ID
    const offersByShop = {};
    for (const offer of shopOffers) {
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
        endDate: offer.endDate
      });
    }

    // Calculate distance for each shop if user location is provided
    const userLat = latitude ? parseFloat(latitude) : null;
    const userLon = longitude ? parseFloat(longitude) : null;

    res.json({
      success: true,
      data: shops.map(s => {
        const shopData = {
          id: s._id,
          name: s.shopName,
          address: s.address,
          phone: s.phone,
          location: s.location,
          rating: s.rating || 0,
          reviewCount: s.reviewCount || 0,
          offers: offersByShop[s._id.toString()] || [],
          isLive: s.isLive,
          isOpen: s.isLive,
          createdAt: s.createdAt
        };

        // Calculate distance if user location is provided
        if (userLat !== null && userLon !== null && s.location && s.location.coordinates) {
          const shopLat = s.location.coordinates[1];
          const shopLon = s.location.coordinates[0];
          const distanceMeters = haversineMeters(userLat, userLon, shopLat, shopLon);
          shopData.distanceKm = distanceMeters / 1000; // Convert to kilometers
        }

        return shopData;
      }),
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

// Public: Get all approved & active shops (used in GET /)
exports.getShops = async (req, res) => {
  try {
    const shops = await Shop.find({ verificationStatus: 'approved', isActive: true });
    res.json({ success: true, data: shops });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching shops' });
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
    // Validate ObjectId to avoid CastError 500s
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid shop ID' });
    }
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
    
    // Build update object and persist without triggering full validators
    const update = {
      verificationStatus: status,
      verificationNotes: notes,
      verifiedAt: new Date(),
      verifiedBy: req.admin.id
    };
    if (status === 'approved') {
      update.isActive = true;
      update.verifiedBadge = true;
      update.isLive = true;
      if (!shop.isLocationLocked && shop.location && Array.isArray(shop.location.coordinates)) {
        update.locationLock = shop.location;
        update.isLocationLocked = true;
      }
    }

    await Shop.updateOne({ _id: id }, { $set: update }, { runValidators: false });
    // Reflect updated fields on the in-memory shop instance for downstream usage
    Object.assign(shop, update);
    
    // Update user's shop status
    const user = await User.findById(shop.ownerId);
    if (user) {
      await user.save();
    }
    
    // Send email notification to shop owner
    try {
      if (user && user.email) {
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
      } else {
        console.log('Skipping verification email: owner record or email missing');
      }
    } catch (emailError) {
      console.error('Error sending verification email:', emailError);
      // Don't fail the verification if email fails
    }
    
    // Re-fetch updated shop to ensure response consistency
    const refreshed = await Shop.findById(id).select('shopName verificationStatus verificationNotes verifiedAt');
    res.json({ 
      message: `Shop ${status} successfully`,
      shop: {
        _id: refreshed?._id || shop._id,
        shopName: refreshed?.shopName || shop.shopName,
        verificationStatus: refreshed?.verificationStatus || shop.verificationStatus,
        verificationNotes: refreshed?.verificationNotes || shop.verificationNotes,
        verifiedAt: refreshed?.verifiedAt || shop.verifiedAt
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
    const { latitude, longitude, radius = 5000, category } = req.query; // use 5km default
    
    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }
    
    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);
    
    const filter = {
      verificationStatus: 'approved',
      isActive: true,
      isLive: true,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: parseInt(radius),
        },
      },
    };
    if (category && category !== 'All') {
      filter.category = category;
    }
    const shops = await Shop.find(filter)
      .populate('ownerId', 'fullName')
      .select('shopName address phone location verificationStatus rating reviewCount openingHours category description amenities isLive photoProof');
    
    // Fetch offers for each shop
    const shopIds = shops.map(s => s._id);
    const now = new Date();
    const shopOffers = await Offer.find({
      shopId: { $in: shopIds },
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).select('shopId title description discountType discountValue startDate endDate');

    // Group offers by shop ID
    const offersByShop = {};
    for (const offer of shopOffers) {
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
        endDate: offer.endDate
      });
    }
    
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
        offers: offersByShop[shop._id.toString()] || [],
        isLive: shop.isLive,
        isOpen: shop.isLive, // Shop is open if it's live
        verificationStatus: shop.verificationStatus,
        owner: shop.ownerId,
        photoProof: shop.photoProof || null
      };
    });
    
    res.json({ shops: shopsWithDistance });
  } catch (e) {
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

// Admin: Update shop information
exports.updateShopInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid shop ID' });
    }
    
    const {
      shopName,
      phone,
      address,
      state,
      description,
      category,
      openingHours,
      amenities,
    } = req.body;
    
    const shop = await Shop.findById(id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    
    // Update allowed fields
    if (typeof shopName !== 'undefined') shop.shopName = shopName;
    if (typeof phone !== 'undefined') shop.phone = phone;
    if (typeof address !== 'undefined') shop.address = address;
    if (typeof state !== 'undefined') shop.state = state;
    if (typeof description !== 'undefined') shop.description = description;
    if (typeof category !== 'undefined') shop.category = category;
    if (typeof openingHours !== 'undefined') shop.openingHours = openingHours;
    if (typeof amenities !== 'undefined' && Array.isArray(amenities)) shop.amenities = amenities;
    
    await shop.save();
    
    res.json({
      message: 'Shop information updated successfully',
      shop: {
        _id: shop._id,
        shopName: shop.shopName,
        phone: shop.phone,
        address: shop.address,
        state: shop.state,
        description: shop.description,
        category: shop.category,
        openingHours: shop.openingHours,
        amenities: shop.amenities,
      }
    });
  } catch (err) {
    console.error('Update shop info error:', err);
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
      state,
      gpsAddress,
      location,
      description,
      category,
      openingHours,
      amenities,
    } = req.body;

    const shop = await Shop.findOne({ ownerId: req.user.id });
    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user' });
    }

    // Update allowed fields
    if (typeof shopName !== 'undefined') shop.shopName = shopName;
    if (typeof phone !== 'undefined') shop.phone = phone;
    if (typeof address !== 'undefined') shop.address = address;
    if (typeof state !== 'undefined') shop.state = state;
    if (typeof gpsAddress !== 'undefined') shop.gpsAddress = gpsAddress;
    if (typeof description !== 'undefined') shop.description = description;
    if (typeof category !== 'undefined') shop.category = category;
    if (typeof openingHours !== 'undefined') shop.openingHours = openingHours;
    if (typeof amenities !== 'undefined' && Array.isArray(amenities)) shop.amenities = amenities;

    if (location && location.latitude && location.longitude) {
      shop.location = {
        type: 'Point',
        coordinates: [location.longitude, location.latitude]
      };
      shop.isLocationVerified = false; // Optional: Reset verification if moved
    }

    await shop.save();

    res.json({
      message: 'Shop details updated successfully',
      shop: {
        _id: shop._id,
        shopName: shop.shopName,
        phone: shop.phone,
        address: shop.address,
        state: shop.state,
        gpsAddress: shop.gpsAddress,
        description: shop.description,
        category: shop.category,
        openingHours: shop.openingHours,
        amenities: shop.amenities,
        location: shop.location,
        isLocationVerified: shop.isLocationVerified,
        verificationStatus: shop.verificationStatus,
        isActive: shop.isActive,
        isLive: shop.isLive,
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

    // Optionally re-host in Cloudinary folder (organized per shop)
    let uploaded = { url: photoUrl, publicId: undefined };
    try {
      const shopCode = shop.licenseNumber || shop._id.toString();
      const targetFolder = `${shopCode}/shop-proof`;
      uploaded = await uploadFromUrl(photoUrl, targetFolder);
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