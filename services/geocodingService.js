const fetch = require('node-fetch');

/**
 * Reverse geocode coordinates using Google Maps Geocoding API
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{formattedAddress: string, components: any} | null>}
 */
async function reverseGeocode(latitude, longitude) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('reverseGeocode: GOOGLE_MAPS_API_KEY is not configured; skipping reverse geocoding');
    return null;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Reverse geocoding failed with status ${resp.status}`);
  }
  const data = await resp.json();
  if (data.status !== 'OK' || !data.results || data.results.length === 0) {
    return null;
  }
  const best = data.results[0];
  const loc = best.geometry && best.geometry.location ? best.geometry.location : undefined;
  const geocodedLat = loc ? loc.lat : undefined;
  const geocodedLng = loc ? loc.lng : undefined;
  return { formattedAddress: best.formatted_address, components: best.address_components, latitude: geocodedLat, longitude: geocodedLng };
}

/**
 * Forward geocode address to get GPS coordinates using Google Maps Geocoding API
 * @param {string} address
 * @returns {Promise<{latitude: number, longitude: number, formattedAddress: string} | null>}
 */
async function forwardGeocode(address) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('forwardGeocode: GOOGLE_MAPS_API_KEY is not configured; skipping forward geocoding');
    return null;
  }

  if (!address || address.trim().length === 0) {
    return null;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address.trim())}&key=${apiKey}`;
  
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Forward geocoding failed with status ${resp.status}`);
    }
    const data = await resp.json();
    
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.warn(`Forward geocoding failed for address: ${address}, status: ${data.status}`);
      return null;
    }
    
    const best = data.results[0];
    const loc = best.geometry && best.geometry.location;
    
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
      return null;
    }
    
    return { 
      latitude: loc.lat, 
      longitude: loc.lng, 
      formattedAddress: best.formatted_address 
    };
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


