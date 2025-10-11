// Lightweight search helpers: synonym expansion and relevance scoring

// Basic synonym map. Extend as needed.
const SYNONYMS = {
  shoes: ['sneaker', 'sneakers', 'trainers', 'footwear'],
  sneaker: ['shoes', 'sneakers', 'trainers', 'footwear'],
  tshirt: ['t-shirt', 'tee', 'tees', 'shirt'],
  headphone: ['headphones', 'earphone', 'earphones', 'earbuds', 'headset', 'audio'],
  mobile: ['phone', 'smartphone', 'cellphone'],
  laptop: ['notebook', 'ultrabook', 'computer', 'pc'],
  deal: ['offer', 'discount', 'sale', 'promo'],
  grocery: ['groceries', 'provisions', 'supermarket', 'food'],
};

function normalizeToken(token) {
  return String(token || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '');
}

// Expand user query into tokens + synonyms (unique)
function expandQueryTerms(query) {
  if (!query || typeof query !== 'string') return [];
  const baseTokens = normalizeToken(query).split(/\s+/).filter(Boolean);
  const expanded = new Set();
  for (const t of baseTokens) {
    expanded.add(t);
    const syns = SYNONYMS[t];
    if (Array.isArray(syns)) {
      for (const s of syns) expanded.add(normalizeToken(s));
    }
  }
  return Array.from(expanded);
}

// Compute a naive relevance score combining text match count, rating, distance, and offer/price signals
function computeProductRelevance({
  product,
  shop,
  tokens,
  distanceKm,
  bestOfferPercent = 0,
}) {
  let score = 0;

  const haystack = [product.name, product.description, product.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Textual token matches
  for (const token of tokens) {
    if (token && haystack.includes(token)) score += 3;
  }

  // Shop rating boost
  if (shop && typeof shop.rating === 'number') {
    score += Math.min(shop.rating, 5) * 1.2; // up to +6
  }

  // Distance decay (closer is better)
  if (typeof distanceKm === 'number') {
    if (distanceKm <= 1) score += 4;
    else if (distanceKm <= 3) score += 2.5;
    else if (distanceKm <= 5) score += 1.5;
    else if (distanceKm <= 10) score += 0.5;
  }

  // Offer boost
  if (bestOfferPercent > 0) {
    score += Math.min(bestOfferPercent / 10, 3); // up to +3
  }

  // Newer products slight boost
  if (product.createdAt) {
    try {
      const created = new Date(product.createdAt).getTime();
      const daysOld = (Date.now() - created) / (1000 * 60 * 60 * 24);
      if (daysOld < 7) score += 2;
      else if (daysOld < 30) score += 1;
    } catch (_) {}
  }

  return score;
}

module.exports = {
  expandQueryTerms,
  computeProductRelevance,
};