module.exports = function requireApprovedShop(req, res, next) {
  try {
    // shopOwnershipMiddleware must run before this to populate req.shop
    if (!req.shop) {
      return res.status(500).json({ message: 'Shop context not available' });
    }

    if (req.shop.verificationStatus !== 'approved') {
      return res.status(403).json({ 
        message: 'Action not allowed until shop verification is approved' 
      });
    }

    next();
  } catch (err) {
    console.error('requireApprovedShop middleware error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};


