const cloudinary = require('cloudinary').v2;

function configure() {
  const { CLOUDINARY_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (CLOUDINARY_URL) {
    cloudinary.config({ cloudinary_url: CLOUDINARY_URL });
  } else if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
    cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET });
  } else {
    throw new Error('Cloudinary credentials are not configured');
  }
}

async function uploadFromUrl(url, folder) {
  configure();
  const res = await cloudinary.uploader.upload(url, { folder });
  return { url: res.secure_url, publicId: res.public_id, mimeType: res.resource_type === 'image' ? res.format : res.resource_type };
}

async function uploadBuffer(buffer, folder, filename) {
  configure();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, public_id: filename && filename.split('.')[0] }, (err, res) => {
      if (err) return reject(err);
      resolve({ url: res.secure_url, publicId: res.public_id, mimeType: res.resource_type === 'image' ? res.format : res.resource_type });
    });
    stream.end(buffer);
  });
}

module.exports = { uploadFromUrl, uploadBuffer };


