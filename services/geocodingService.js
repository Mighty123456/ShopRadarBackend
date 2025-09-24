const fetch = require('node-fetch');

// Google Geocoding API
// Requires env: GOOGLE_MAPS_API_KEY

/**
* Reverse geocode coordinates using Google Geocoding API
* @param {number} latitude
* @param {number} longitude
* @returns {Promise<{formattedAddress: string, components: any, latitude?: number, longitude?: number} | null>}
*/
async function reverseGeocode(latitude, longitude) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('GOOGLE_MAPS_API_KEY is not set');
    return null;
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}&key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Reverse geocoding failed with status ${resp.status}`);
  }
  const data = await resp.json();
  if (!data || !Array.isArray(data.results) || data.results.length === 0) {
    return null;
  }
  const best = data.results[0];
  const formatted = best.formatted_address || '';
  const loc = best.geometry && best.geometry.location;
  const lat = loc && typeof loc.lat === 'number' ? loc.lat : undefined;
  const lng = loc && typeof loc.lng === 'number' ? loc.lng : undefined;
  return { formattedAddress: formatted, components: best.address_components || best, latitude: lat, longitude: lng };
}

/**
* Forward geocode address to get GPS coordinates using Google Geocoding API
* @param {string} address
* @returns {Promise<{latitude: number, longitude: number, formattedAddress: string} | null>}
*/
async function forwardGeocode(address) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('GOOGLE_MAPS_API_KEY is not set');
    return null;
  }
  if (!address || address.trim().length === 0) {
    return null;
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address.trim())}&key=${encodeURIComponent(apiKey)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Forward geocoding failed with status ${resp.status}`);
    }
    const data = await resp.json();
    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
      console.warn(`Forward geocoding failed for address: ${address}`);
      return null;
    }
    const best = data.results[0];
    const loc = best.geometry && best.geometry.location;
    const lat = loc && typeof loc.lat === 'number' ? loc.lat : NaN;
    const lng = loc && typeof loc.lng === 'number' ? loc.lng : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    const formatted = best.formatted_address || address.trim();
    return { latitude: lat, longitude: lng, formattedAddress: formatted };
  } catch (error) {
    console.error('Forward geocoding error:', error);
    return null;
  }
}

/**
 * Compute a simple address match score (0-100) between two strings.
 * Uses normalized token overlap.
 */
function computeAddressMatchScore(a, b) {
  if (!a || !b) return 0;
  const tokensA = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let common = 0;
  tokensA.forEach(t => { if (tokensB.has(t)) common += 1; });
  const denom = Math.max(tokensA.size, tokensB.size);
  return Math.round((common / denom) * 100);
}

module.exports = { reverseGeocode, forwardGeocode, computeAddressMatchScore };


