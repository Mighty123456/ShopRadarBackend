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

module.exports = { reverseGeocode, computeAddressMatchScore };


