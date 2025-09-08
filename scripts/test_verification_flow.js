/*
 End-to-end test for Shop Owner verification flow

 Required environment variables (or defaults):
 - BASE_URL (default: http://localhost:3000/api)
 - ADMIN_EMAIL (default: admin@shopradar.com)
 - ADMIN_PASSWORD (default: AdminPass123)
 - TEST_OTP (no default; must set to actual OTP received by email)
 - LICENSE_URL (Cloudinary/public PDF or image URL)
 - PHOTO_URL (Cloudinary/public image URL with EXIF if possible)
 - LAT (default: 19.0760)  - Mumbai sample
 - LNG (default: 72.8777)
*/

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@shopradar.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPass123';
const TEST_OTP = process.env.TEST_OTP; // must be provided
const LICENSE_URL = process.env.LICENSE_URL || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
const PHOTO_URL = process.env.PHOTO_URL || 'https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg';
const LAT = parseFloat(process.env.LAT || '19.0760');
const LNG = parseFloat(process.env.LNG || '72.8777');

async function main() {
  const unique = Date.now();
  const email = `owner_${unique}@example.com`;
  const password = 'Passw0rd!';
  const fullName = 'Test Owner';
  const shopName = `Test Shop ${unique}`;
  const licenseNumber = `LIC/${unique}`;
  const phone = '9876543210';
  const address = '123 Test Street, Mumbai';

  let ownerToken = '';
  let adminToken = '';
  let shopId = '';

  console.log('1) Registering shop owner...');
  const regRes = await axios.post(`${BASE_URL}/auth/register`, {
    email,
    password,
    fullName,
    role: 'shop',
    shopName,
    licenseNumber,
    phone,
    address,
    licenseDocumentUrl: LICENSE_URL
  });
  console.log('   ✓', regRes.data.message);

  if (!TEST_OTP) {
    throw new Error('TEST_OTP is required in env to verify email');
  }

  console.log('2) Verifying email OTP...');
  const otpRes = await axios.post(`${BASE_URL}/auth/verify-otp`, { email, otp: TEST_OTP });
  ownerToken = otpRes.data.token;
  console.log('   ✓ OTP verified');

  console.log('3) Fetching my shop...');
  const myShopRes = await axios.get(`${BASE_URL}/shops/my-shop`, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  shopId = myShopRes.data.shop._id;
  console.log('   ✓ Shop fetched:', shopId);

  console.log('4) Submitting GPS and verifying address...');
  const gpsRes = await axios.post(`${BASE_URL}/shops/my-shop/submit-gps`, {
    latitude: LAT,
    longitude: LNG
  }, { headers: { Authorization: `Bearer ${ownerToken}` }});
  console.log('   ✓ Address match score:', gpsRes.data.data.addressMatchScore);

  console.log('5) Processing licence OCR...');
  const ocrRes = await axios.post(`${BASE_URL}/shops/my-shop/ocr-license`, {}, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  console.log('   ✓ Licence match:', ocrRes.data.data.licNumberMatch, 'FormVsLicenceAddressScore:', ocrRes.data.data.formVsLicenceAddressScore);

  console.log('6) Uploading shop photo (via URL) ...');
  const upRes = await axios.post(`${BASE_URL}/upload?folder=shop-proof`, { url: PHOTO_URL }, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  console.log('   ✓ Uploaded. Cloudinary URL:', upRes.data.url);

  console.log('7) Submitting photo EXIF check...');
  const exifRes = await axios.post(`${BASE_URL}/shops/my-shop/upload-photo`, { photoUrl: upRes.data.url }, {
    headers: { Authorization: `Bearer ${ownerToken}` }
  });
  console.log('   ✓ EXIF mismatch:', exifRes.data.data.exifMismatch);

  console.log('8) Admin login...');
  const adminLoginRes = await axios.post(`${BASE_URL}/admin/login`, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  adminToken = adminLoginRes.data.token;
  console.log('   ✓ Admin logged in');

  console.log('9) Approving shop...');
  const approveRes = await axios.put(`${BASE_URL}/shops/admin/${shopId}/verify`, {
    status: 'approved',
    notes: 'Automated test approval'
  }, { headers: { Authorization: `Bearer ${adminToken}` }});
  console.log('   ✓ Shop approved at:', approveRes.data.shop.verifiedAt);

  console.log('10) Query nearby shops...');
  const nearRes = await axios.get(`${BASE_URL}/shops/nearby`, { params: { latitude: LAT, longitude: LNG, radius: 5000 }});
  const found = nearRes.data.shops.some(s => String(s._id) === String(shopId));
  console.log('   ✓ Nearby contains approved shop:', found);

  console.log('\nAll steps passed.');
}

main().catch(err => {
  const msg = err.response?.data?.message || err.message;
  console.error('Test failed:', msg);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});


