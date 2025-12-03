
/**
 * Fetch a document from a URL and extract text.
 * Currently returns empty text to avoid using deprecated/vulnerable pdf parsing libs.
 * TODO: Integrate proper OCR service (Tesseract.js, Google Vision API, or AWS Textract)
 */
async function extractTextFromUrl(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch document: ${resp.status}`);
    
    // TODO: Implement actual OCR extraction here
    // For now, return empty string - this will be enhanced with proper OCR
    // Options:
    // 1. Tesseract.js for client-side OCR
    // 2. Google Cloud Vision API
    // 3. AWS Textract
    // 4. Azure Computer Vision
    
    await resp.arrayBuffer();
    return '';
  } catch (error) {
    console.error('Error fetching document for OCR:', error);
    return '';
  }
}

/**
 * Heuristically extract license number and address from raw text.
 * Enhanced to better extract ShopAct license details including location.
 */
function extractLicenseDetails(rawText) {
  if (!rawText || rawText.trim().length === 0) {
    return { extractedLicenseNumber: null, extractedAddress: null, extractedLocation: null, rawText: '' };
  }

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let extractedLicenseNumber = null;
  
  // Common patterns for ShopAct license number: alphanumeric, often with slashes/dashes
  const licRegexes = [
    /shop\s*act\s*(no\.?|number|license)\s*[:\-]?\s*([a-z0-9\/-]{6,})/i,
    /license\s*(no\.?|number)\s*[:\-]?\s*([a-z0-9\/-]{6,})/i,
    /registration\s*(no\.?|number)\s*[:\-]?\s*([a-z0-9\/-]{6,})/i,
    /\b([a-z0-9]{2,}[-/][a-z0-9]{3,}(?:[-/][a-z0-9]{2,})?)\b/i
  ];
  
  for (const line of lines) {
    for (const re of licRegexes) {
      const m = line.match(re);
      if (m && (m[2] || m[1])) {
        extractedLicenseNumber = (m[2] || m[1]).toUpperCase().trim();
        break;
      }
    }
    if (extractedLicenseNumber) break;
  }

  // Enhanced address extraction for ShopAct licenses
  // Look for address patterns common in ShopAct documents
  const addressKeywords = [
    /(address|addr\.?|situated\s+at|location|premises|place|shop\s+address|business\s+address)\s*[:\-]?\s*/i,
    /(village|town|city|district|state|pin|pincode|postal\s+code)/i
  ];
  
  let extractedAddress = null;
  let addressStartIndex = -1;
  
  // Find address section
  for (let i = 0; i < lines.length; i++) {
    if (addressKeywords[0].test(lines[i])) {
      addressStartIndex = i;
      break;
    }
  }
  
  // Extract address lines (usually 2-4 lines after keyword)
  if (addressStartIndex >= 0) {
    const addressLines = [];
    for (let i = addressStartIndex; i < Math.min(addressStartIndex + 4, lines.length); i++) {
      const line = lines[i].replace(/^(address|addr\.?|situated\s+at|location)\s*[:\-]?\s*/i, '').trim();
      if (line.length > 10) { // Minimum address length
        addressLines.push(line);
      }
    }
    if (addressLines.length > 0) {
      extractedAddress = addressLines.join(', ');
    }
  }
  
  // Fallback: look for lines with location indicators (pin code, state, city)
  if (!extractedAddress) {
    const locationIndicators = /(pin|pincode|postal|state|district|city|village)/i;
    for (let i = 0; i < lines.length; i++) {
      if (locationIndicators.test(lines[i]) && lines[i].length > 15) {
        // Try to get surrounding lines
        const context = [];
        for (let j = Math.max(0, i - 1); j < Math.min(i + 2, lines.length); j++) {
          if (lines[j].length > 10) context.push(lines[j]);
        }
        if (context.length > 0) {
          extractedAddress = context.join(', ');
          break;
        }
      }
    }
  }
  
  // Last resort: longest meaningful line
  if (!extractedAddress) {
    const longLines = lines.filter(l => l.length > 20 && /[a-z]/i.test(l));
    if (longLines.length > 0) {
      extractedAddress = longLines.sort((a, b) => b.length - a.length)[0];
    }
  }

  // Extract location components (state, city, pin code) for better matching
  let extractedLocation = null;
  if (extractedAddress) {
    const stateMatch = extractedAddress.match(/(?:state|st\.?)\s*[:\-]?\s*([a-z\s]+)/i);
    const pinMatch = extractedAddress.match(/(?:pin|pincode|postal\s+code)\s*[:\-]?\s*(\d{6})/i);
    const cityMatch = extractedAddress.match(/(?:city|town)\s*[:\-]?\s*([a-z\s]+)/i);
    
    extractedLocation = {
      state: stateMatch ? stateMatch[1].trim() : null,
      pinCode: pinMatch ? pinMatch[1] : null,
      city: cityMatch ? cityMatch[1].trim() : null,
      fullAddress: extractedAddress
    };
  }

  return { 
    extractedLicenseNumber, 
    extractedAddress, 
    extractedLocation,
    rawText 
  };
}

module.exports = { extractTextFromUrl, extractLicenseDetails };


