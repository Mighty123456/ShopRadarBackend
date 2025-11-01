const Product = require('../models/productModel');
const Shop = require('../models/shopModel');
const Offer = require('../models/offerModel');
const { expandQueryTerms, computeProductRelevance } = require('../services/searchService');

function haversineKm(a, b) {
  if (!a || !b) return undefined;
  const toRad = (d) => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

class SearchController {
  async searchProducts(req, res) {
    try {
      const { q = '', latitude, longitude, limit = 20 } = req.query;
      const tokens = expandQueryTerms(q);
      if (tokens.length === 0) {
        return res.json({ success: true, data: { products: [], total: 0, tokens } });
      }

      const userLoc = (latitude && longitude) ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude) } : null;
      const products = await Product.find({ status: 'active' })
        .populate('shopId', 'shopName rating location verificationStatus isActive isLive')
        .limit(500);

      // Preload offers per product - CRITICAL: Only include offers for specific products
      const productIds = products.map(p => p._id);
      // Build a set of product IDs for validation
      const productIdSet = new Set(products.map(p => String(p._id)));
      
      const offers = await Offer.find({ 
        productId: { $in: productIds }, 
        status: 'active', 
        startDate: { $lte: new Date() }, 
        endDate: { $gte: new Date() } 
      }).select('productId discountType discountValue').lean();
      
      const bestOfferPctByProduct = new Map();
      for (const ofr of offers) {
        // Ensure this offer is for one of the products in our search results
        const key = ofr.productId ? String(ofr.productId) : null;
        if (!key || !productIdSet.has(key)) {
          // Skip if offer doesn't match any product in our search results
          continue;
        }
        
        const pct = ofr.discountType === 'Percentage' ? Number(ofr.discountValue) : 0;
        const prev = bestOfferPctByProduct.get(key) || 0;
        if (pct > 0) {
          bestOfferPctByProduct.set(key, Math.max(prev, pct));
        }
      }

      const scored = [];
      for (const product of products) {
        const shop = product.shopId;
        if (!shop || shop.verificationStatus !== 'approved' || !shop.isActive || !shop.isLive) continue;

        const distanceKm = (userLoc && shop.location?.coordinates)
          ? haversineKm(userLoc, { latitude: shop.location.coordinates[1], longitude: shop.location.coordinates[0] })
          : undefined;
        const bestOfferPercent = bestOfferPctByProduct.get(String(product._id)) || 0;

        const score = computeProductRelevance({ product, shop, tokens, distanceKm, bestOfferPercent });
        if (score <= 0) continue;

        scored.push({ product, shop, score, distanceKm, bestOfferPercent });
      }

      const results = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, parseInt(limit))
        .map(r => ({
          productId: r.product._id,
          name: r.product.name,
          category: r.product.category,
          price: r.product.price,
          shopName: r.shop.shopName,
          shopRating: r.shop.rating,
          distanceKm: r.distanceKm,
          bestOfferPercent: r.bestOfferPercent,
          score: r.score
        }));

      res.json({ success: true, data: { products: results, total: results.length, tokens } });
    } catch (error) {
      console.error('Error in searchProducts:', error);
      res.status(500).json({ success: false, message: 'Search failed', error: error.message });
    }
  }

  async searchShops(req, res) {
    try {
      const { q = '', latitude, longitude, limit = 20 } = req.query;
      const tokens = expandQueryTerms(q);
      const userLoc = (latitude && longitude) ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude) } : null;

      const shops = await Shop.find({ verificationStatus: 'approved', isActive: true })
        .select('shopName rating address state location isLive')
        .limit(500);

      const results = shops
        .map(shop => {
          const hay = [shop.shopName, shop.address, shop.state].filter(Boolean).join(' ').toLowerCase();
          let text = 0; for (const t of tokens) if (hay.includes(t)) text += 3;
          const dist = (userLoc && shop.location?.coordinates) ? haversineKm(userLoc, { latitude: shop.location.coordinates[1], longitude: shop.location.coordinates[0] }) : undefined;
          let score = text + Math.min(shop.rating || 0, 5) * 1.2;
          if (typeof dist === 'number') {
            if (dist <= 1) score += 4; else if (dist <= 3) score += 2.5; else if (dist <= 5) score += 1.5; else if (dist <= 10) score += 0.5;
          }
          return { shop, score, dist };
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, parseInt(limit))
        .map(r => ({
          shopId: r.shop._id,
          shopName: r.shop.shopName,
          rating: r.shop.rating,
          address: r.shop.address,
          distanceKm: r.dist,
          score: r.score,
          isLive: r.shop.isLive,
          isOpen: r.shop.isLive
        }));

      res.json({ success: true, data: { shops: results, total: results.length, tokens } });
    } catch (error) {
      console.error('Error in searchShops:', error);
      res.status(500).json({ success: false, message: 'Shop search failed', error: error.message });
    }
  }

  async discover(req, res) {
    try {
      const { latitude, longitude, limit = 20 } = req.query;
      const userLoc = (latitude && longitude) ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude) } : null;

      // Simple discovery: trending products/offers near you
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const offers = await Offer.find({ status: 'active', startDate: { $lte: new Date() }, endDate: { $gte: new Date() } })
        .populate('shopId', 'shopName rating location isLive isActive verificationStatus')
        .populate('productId', 'name category price createdAt')
        .limit(500);

      const items = offers
        .filter(o => o.shopId && o.shopId.verificationStatus === 'approved' && o.shopId.isActive && o.shopId.isLive)
        .map(o => {
          const dist = (userLoc && o.shopId.location?.coordinates) ?
            haversineKm(userLoc, { latitude: o.shopId.location.coordinates[1], longitude: o.shopId.location.coordinates[0] }) : undefined;
          // Simple interest score: discount + rating + freshness
          const freshDays = o.productId?.createdAt ? Math.max(0, (Date.now() - new Date(o.productId.createdAt).getTime()) / (1000*60*60*24)) : 999;
          const freshness = freshDays < 7 ? 2 : freshDays < 30 ? 1 : 0;
          let score = Math.min((o.discountType === 'Percentage' ? o.discountValue : 0) / 10, 3) + Math.min(o.shopId.rating || 0, 5) * 0.8 + freshness;
          if (typeof dist === 'number') {
            if (dist <= 1) score += 2; else if (dist <= 3) score += 1; else if (dist <= 5) score += 0.5;
          }
          return { offer: o, score, dist };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, parseInt(limit))
        .map(r => ({
          offerId: r.offer._id,
          title: r.offer.title,
          discountValue: r.offer.discountValue,
          discountType: r.offer.discountType,
          shopName: r.offer.shopId?.shopName,
          productName: r.offer.productId?.name,
          category: r.offer.productId?.category || r.offer.category,
          distanceKm: r.dist,
          score: r.score
        }));

      res.json({ success: true, data: { items, total: items.length } });
    } catch (error) {
      console.error('Error in discover:', error);
      res.status(500).json({ success: false, message: 'Discovery failed', error: error.message });
    }
  }
}

module.exports = new SearchController();


