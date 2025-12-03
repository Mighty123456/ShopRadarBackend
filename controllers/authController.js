const User = require('../models/userModel');
const Shop = require('../models/shopModel');
const authService = require('../services/authService');
const emailService = require('../services/emailService');
const { verifyGoogleIdToken } = require('../services/googleVerify');
const websocketService = require('../services/websocketService');
const fcmNotificationService = require('../services/fcmNotificationService');
const { extractTextFromUrl, extractLicenseDetails } = require('../services/ocrService');
const { forwardGeocode, computeAddressMatchScore } = require('../services/geocodingService');

exports.register = async (req, res) => {
  try {
    const { 
      email, 
      password, 
      fullName, 
      role,
      // New, simplified Shop registration fields (Step 1)
      shopName,
      licenseNumber,
      phone,
      address,
      state,
      licenseDocument,
      // Location verification data
      location,
      gpsAddress,
      isLocationVerified
    } = req.body;
    
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }
    
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({ 
        message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' 
      });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // For shop owners, check if license number already exists
    if (role === 'shop') {
      const existingShop = await Shop.findOne({ licenseNumber });
      if (existingShop) {
        return res.status(400).json({ message: 'Shop with this license number already exists' });
      }
    }

    const hashedPassword = await authService.hashPassword(password);
    
    const otp = emailService.generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const user = new User({
      email,
      password: hashedPassword,
      fullName: fullName,
      role: role || 'customer',
      otp: {
        code: otp,
        expiresAt: otpExpiry
      },
      lastOtpSent: new Date(),
      otpAttempts: 1
    });

    await user.save();
    console.log(`User created successfully: ${user._id}`);

    // If it's a shop owner, create shop record with only basic data (Step 1)
    let shop = null;
    if (role === 'shop') {
      // Validate required shop fields
      if (!shopName || !licenseNumber || !phone || !address) {
        await User.findByIdAndDelete(user._id);
        return res.status(400).json({ message: 'All shop fields are required' });
      }
      
      // Prepare shop data
      const shopData = {
        ownerId: user._id,
        shopName,
        licenseNumber,
        phone,
        address,
        isLocationVerified: isLocationVerified || false,
        verificationStatus: 'pending'
      };
      
      // Add state only if provided and not empty
      if (state && typeof state === 'string' && state.trim().length > 0) {
        shopData.state = state.trim();
      }

      // Add license document if provided
      if (licenseDocument && licenseDocument.url) {
        shopData.licenseDocument = {
          url: licenseDocument.url,
          publicId: licenseDocument.publicId,
          mimeType: licenseDocument.mimeType || 'application/pdf',
          localPath: licenseDocument.localPath || null,
          localFilename: licenseDocument.localFilename || null,
          uploadedAt: new Date()
        };
      }

      // Add location data if provided
      if (location && location.latitude && location.longitude) {
        shopData.location = {
          type: 'Point',
          coordinates: [location.longitude, location.latitude]
        };
      }

      if (gpsAddress) {
        shopData.gpsAddress = gpsAddress;
      }

      // For initial registration, be more lenient with location verification
      // The strict verification will happen in the GPS submission step
      if (isLocationVerified !== undefined) {
        shopData.isLocationVerified = isLocationVerified;
      }

      shop = new Shop(shopData);

      // Process OCR and compare location with license document if license is provided
      if (licenseDocument && licenseDocument.url && location && location.latitude && location.longitude) {
        try {
          console.log('🔍 Processing license document OCR for location comparison...');
          
          // Extract text from license document
          const rawText = await extractTextFromUrl(licenseDocument.url);
          
          if (rawText && rawText.trim().length > 0) {
            // Extract license details including location
            const { extractedLicenseNumber, extractedAddress, extractedLocation } = extractLicenseDetails(rawText);
            
            // Store OCR results
            shop.licenseOcr = {
              extractedLicenseNumber: extractedLicenseNumber || null,
              extractedAddress: extractedAddress || null,
              rawText: rawText.substring(0, 5000), // Limit stored text
              processedAt: new Date()
            };
            
            // Compare license number
            const licenseNumberMatch = extractedLicenseNumber && 
              extractedLicenseNumber.replace(/\s/g, '').toUpperCase() === 
              licenseNumber.replace(/\s/g, '').toUpperCase();
            
            // Compare addresses
            let addressMatchScore = 0;
            if (extractedAddress) {
              addressMatchScore = computeAddressMatchScore(address, extractedAddress);
              if (gpsAddress) {
                const gpsScore = computeAddressMatchScore(gpsAddress, extractedAddress);
                addressMatchScore = Math.max(addressMatchScore, gpsScore);
              }
            }
            
            // Geocode extracted address and compare GPS coordinates
            let licenseLocationDistance = null;
            let licenseLocationMatch = false;
            
            if (extractedAddress) {
              try {
                const geocodeResult = await forwardGeocode(extractedAddress);
                
                if (geocodeResult && geocodeResult.latitude && geocodeResult.longitude) {
                  // Calculate distance between license address GPS and registered location
                  const distanceMeters = haversineMeters(
                    location.latitude,
                    location.longitude,
                    geocodeResult.latitude,
                    geocodeResult.longitude
                  );
                  
                  licenseLocationDistance = distanceMeters;
                  // Consider match if within 500 meters (reasonable tolerance for address geocoding)
                  licenseLocationMatch = distanceMeters <= 500;
                  
                  console.log(`📍 License address GPS: (${geocodeResult.latitude}, ${geocodeResult.longitude})`);
                  console.log(`📍 Registered location GPS: (${location.latitude}, ${location.longitude})`);
                  console.log(`📏 Distance: ${distanceMeters.toFixed(1)}m, Match: ${licenseLocationMatch}`);
                }
              } catch (geocodeError) {
                console.error('Error geocoding license address:', geocodeError);
              }
            }
            
            // Set flags based on comparison results
            shop.flags = shop.flags || {};
            shop.flags.licenceMismatch = !licenseNumberMatch;
            shop.flags.addressMismatch = addressMatchScore < 50; // Less than 50% match
            
            // Store comparison results
            shop.addressMatchScore = addressMatchScore;
            shop.licenseLocationDistance = licenseLocationDistance;
            shop.licenseLocationMatch = licenseLocationMatch;
            
            console.log(`✅ License OCR completed:`);
            console.log(`   - License number match: ${licenseNumberMatch}`);
            console.log(`   - Address match score: ${addressMatchScore}%`);
            console.log(`   - Location distance: ${licenseLocationDistance ? licenseLocationDistance.toFixed(1) + 'm' : 'N/A'}`);
            console.log(`   - Location match: ${licenseLocationMatch}`);
            
            // If significant mismatch, mark for admin review
            if (!licenseNumberMatch || addressMatchScore < 30 || (licenseLocationDistance && licenseLocationDistance > 1000)) {
              console.log('⚠️ Significant mismatch detected - shop flagged for admin review');
              shop.verificationNotes = 'Location/address mismatch detected during registration. Requires manual verification.';
            }
          } else {
            console.log('⚠️ No text extracted from license document (OCR may not be configured)');
          }
        } catch (ocrError) {
          console.error('Error processing license OCR:', ocrError);
          // Don't fail registration if OCR fails
        }
      }

      await shop.save();

      // Broadcast new shop to public clients via WebSocket
      try {
        websocketService.broadcastNewShop(shop);
      } catch (e) {
        console.error('Failed to broadcast new shop:', e);
      }

      // Send push notifications to nearby users
      try {
        await fcmNotificationService.notifyNewShop(shop);
        console.log(`📢 Push notification sent for new shop: ${shop.shopName}`);
      } catch (e) {
        console.error('Failed to send push notification for new shop:', e);
        // Don't fail registration if notification fails
      }

      // Link shop to user
      user.shopId = shop._id;
      await user.save();
    }

    // Send OTP email without blocking the response for too long
    console.log(`Sending OTP email to: ${email}`);
    const sendPromise = emailService.sendOTP(email, otp);
    const result = await Promise.race([
      sendPromise,
      // Allow longer time in hosted environments where SMTP handshakes can be slow
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 25000))
    ]);

    if (result === true) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DEV ONLY] OTP for ${email}: ${otp}`);
      }
      console.log(`Registration completed for user: ${user._id}`);
      return res.status(201).json({ 
        message: 'Registration successful. Please check your email for verification code.',
        userId: user._id,
        needsVerification: true,
        shopId: shop ? shop._id : null
      });
    }

    // If timed out or failed, still return 201 so client can proceed to OTP screen
    if (result === 'timeout') {
      console.warn(`Email send timed out for: ${email}. Allowing client to proceed.`);
      // Let the original send continue in background; do not await sendPromise
    } else {
      console.error('Failed to send OTP email to:', email);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV ONLY] OTP for ${email}: ${otp}`);
    }
    return res.status(201).json({
      message: 'Registration created. If OTP email is delayed, tap Resend Code.',
      userId: user._id,
      needsVerification: true,
      shopId: shop ? shop._id : null
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email }).populate('shopId');
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    if (!user.otp || user.otp.code !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > user.otp.expiresAt) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    user.isEmailVerified = true;
    user.otp = undefined;
    await user.save();

    const token = authService.generateToken(user);

    // Prepare user response
    const userResponse = {
      _id: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt
    };

    // Add shop information if user is a shop owner
    if (user.role === 'shop' && user.shopId) {
      userResponse.shop = {
        _id: user.shopId._id,
        shopName: user.shopId.shopName,
        verificationStatus: user.shopId.verificationStatus,
        isLocationVerified: user.shopId.isLocationVerified,
        isActive: user.shopId.isActive,
        isLive: user.shopId.isLive
      };
    }

    res.json({ 
      message: 'Email verified successfully',
      token,
      user: userResponse
    });
  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (user.lastOtpSent && user.lastOtpSent > oneHourAgo && user.otpAttempts >= 3) {
      return res.status(429).json({ 
        message: 'Too many OTP requests. Please wait before requesting another code.' 
      });
    }

    const otp = emailService.generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = {
      code: otp,
      expiresAt: otpExpiry
    };
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    user.lastOtpSent = new Date();
    await user.save();

    // Send OTP email without blocking too long (mirror register behavior)
    console.log(`Resending OTP email to: ${email}`);
    const sendPromise = emailService.sendOTP(email, otp);
    const result = await Promise.race([
      sendPromise,
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 25000))
    ]);

    if (result === true) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DEV ONLY] OTP for ${email}: ${otp}`);
      }
      return res.json({ message: 'OTP resent successfully' });
    }

    if (result === 'timeout') {
      console.warn(`Email resend timed out for: ${email}. Informing client to check inbox shortly.`);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DEV ONLY] OTP for ${email}: ${otp}`);
      }
      return res.json({ message: 'Resend initiated. Email may arrive shortly even if delayed.' });
    }

    console.error('Failed to resend OTP email to:', email);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV ONLY] OTP for ${email}: ${otp}`);
    }
    return res.status(500).json({ message: 'Failed to send OTP email. Please try again later.' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    if (!user.isEmailVerified) {
      return res.status(400).json({ 
        message: 'Please verify your email before logging in',
        needsVerification: true
      });
    }

    const isMatch = await authService.comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Enrich with shop details if shop owner
    let shopSummary = undefined;
    if (user.role === 'shop' && user.shopId) {
      const shop = await Shop.findById(user.shopId).select('shopName verificationStatus isLocationVerified isActive isLive');
      if (shop) {
        shopSummary = {
          _id: shop._id,
          shopName: shop.shopName,
          verificationStatus: shop.verificationStatus,
          isLocationVerified: shop.isLocationVerified,
          isActive: shop.isActive,
          isLive: shop.isLive
        };
      }
    }

    const token = authService.generateToken(user);

    res.json({ 
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        shop: shopSummary
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const otp = emailService.generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = {
      code: otp,
      expiresAt: otpExpiry
    };
    user.lastOtpSent = new Date();
    await user.save();

    const emailSent = await emailService.sendPasswordResetOTP(email, otp);
    if (!emailSent) {
      return res.status(500).json({ message: 'Failed to send reset email' });
    }

    res.json({ message: 'Password reset OTP sent successfully' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    if (!user.otp || user.otp.code !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > user.otp.expiresAt) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    const hashedPassword = await authService.hashPassword(newPassword);
    user.password = hashedPassword;
    user.otp = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.logout = (req, res) => {
  res.json({ message: 'Logged out successfully' });
};

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 Latitude of first point
 * @param {number} lon1 Longitude of first point
 * @param {number} lat2 Latitude of second point
 * @param {number} lon2 Longitude of second point
 * @returns {number} Distance in meters
 */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -otp');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let shopSummary = undefined;
    if (user.role === 'shop' && user.shopId) {
      const shop = await Shop.findById(user.shopId).select('shopName verificationStatus isLocationVerified isActive isLive');
      if (shop) {
        shopSummary = {
          _id: shop._id,
          shopName: shop.shopName,
          verificationStatus: shop.verificationStatus,
          isLocationVerified: shop.isLocationVerified,
          isActive: shop.isActive,
          isLive: shop.isLive
        };
      }
    }

    res.json({ user: { 
      _id: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      createdAt: user.createdAt,
      shop: shopSummary
    }});
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    const decoded = authService.verifyToken(refreshToken);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const newToken = authService.generateToken(user);
    const newRefreshToken = authService.generateRefreshToken(user);

    res.json({
      message: 'Token refreshed successfully',
      token: newToken,
      refreshToken: newRefreshToken,
      user: {
        id: user._id,
        email: user.email,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

exports.googleSignIn = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'ID token is required' });
    }

    const payload = await verifyGoogleIdToken(idToken);

    let user = await User.findOne({ googleId: payload.sub });
    if (!user) {
      user = await User.findOne({ email: payload.email });
      if (user) {
        user.googleId = payload.sub;
        user.fullName = payload.name || user.fullName;
        user.picture = payload.picture || user.picture;
        user.isEmailVerified = true;
        await user.save();
      } else {
        user = new User({
          email: payload.email,
          googleId: payload.sub,
          fullName: payload.name,
          picture: payload.picture,
          isEmailVerified: true,
          role: 'customer',
        });
        await user.save();
      }
    }

    const token = authService.generateToken(user);
    const refreshToken = authService.generateRefreshToken
      ? authService.generateRefreshToken(user)
      : undefined;

    res.json({
      message: 'Google sign in successful',
      token,
      ...(refreshToken ? { refreshToken } : {}),
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        picture: user.picture,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (err) {
    console.error('Google sign in error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};