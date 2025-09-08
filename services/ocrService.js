const pdfParse = require('pdf-parse');
const fetch = require('node-fetch');

/**
 * Fetch a PDF or image from a URL and extract text. For images, this can be extended to Tesseract.
 * For now, we support PDF via pdf-parse. Returns raw text.
 */
async function extractTextFromUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch document: ${resp.status}`);
  const buffer = await resp.buffer();
  // Attempt PDF parse
  try {
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (e) {
    // Non-PDF or parse failure; return empty text (placeholder for image OCR)
    return '';
  }
}

/**
 * Heuristically extract license number and address from raw text.
 */
function extractLicenseDetails(rawText) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let extractedLicenseNumber = undefined;
  // Common patterns: alphanumeric, often with slashes/dashes
  const licRegexes = [
    /license\s*(no\.?|number\:?)[^a-z0-9]*([a-z0-9\/-]{6,})/i,
    /shop\s*act\s*(no\.?|number\:?)[^a-z0-9]*([a-z0-9\/-]{6,})/i,
    /\b([a-z0-9]{3,}[-/][a-z0-9]{3,}(?:[-/][a-z0-9]{2,})?)\b/i
  ];
  for (const line of lines) {
    for (const re of licRegexes) {
      const m = line.match(re);
      if (m && m[2]) { extractedLicenseNumber = m[2].toUpperCase(); break; }
    }
    if (extractedLicenseNumber) break;
  }

  // Address heuristic: longest line after keywords
  const addressKeywords = /(address|addr\.?|situated at|location)\s*[:\-]?/i;
  let extractedAddress = undefined;
  for (let i = 0; i < lines.length; i++) {
    if (addressKeywords.test(lines[i])) {
      const candidate = lines.slice(i, i + 3).join(', ');
      if (!extractedAddress || candidate.length > extractedAddress.length) {
        extractedAddress = candidate;
      }
    }
  }
  if (!extractedAddress) {
    extractedAddress = lines.sort((a, b) => b.length - a.length)[0] || '';
  }

  return { extractedLicenseNumber, extractedAddress, rawText };
}

module.exports = { extractTextFromUrl, extractLicenseDetails };


