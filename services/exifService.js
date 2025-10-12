const ExifReader = require('exifreader');

async function parseExifFromImageUrl(url) {
  const { default: fetch } = await import('node-fetch');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  const tags = ExifReader.load(arrayBuffer);
  const gpsLat = getGpsDecimal(tags['GPSLatitude'], tags['GPSLatitudeRef']);
  const gpsLng = getGpsDecimal(tags['GPSLongitude'], tags['GPSLongitudeRef']);
  return { gpsLatitude: gpsLat, gpsLongitude: gpsLng, tags };
}

function getGpsDecimal(valueTag, refTag) {
  if (!valueTag || !valueTag.description) return undefined;
  const ref = refTag && refTag.description ? refTag.description : undefined;
  const parts = valueTag.description.split(',').map(s => s.trim());
  if (parts.length < 3) return undefined;
  const d = parseFloat(parts[0]);
  const m = parseFloat(parts[1]);
  const s = parseFloat(parts[2]);
  let dec = d + (m / 60.0) + (s / 3600.0);
  if (ref && (ref.toUpperCase() === 'S' || ref.toUpperCase() === 'W')) dec = -dec;
  return dec;
}

module.exports = { parseExifFromImageUrl };


