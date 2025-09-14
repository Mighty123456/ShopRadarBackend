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
  const res = await cloudinary.uploader.upload(url, { 
    folder,
    resource_type: 'raw' // This ensures PDFs are uploaded as raw files
  });
  
  // Determine mime type from the original URL or Cloudinary response
  const getMimeType = (url, format) => {
    const extension = url.split('.').pop()?.toLowerCase();
    const mimeTypes = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif'
    };
    return mimeTypes[extension] || `application/${extension}` || 'application/octet-stream';
  };
  
  return { 
    url: res.secure_url, 
    publicId: res.public_id, 
    mimeType: getMimeType(url, res.format)
  };
}

async function uploadBuffer(buffer, folder, filename) {
  configure();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ 
      folder, 
      public_id: filename && filename.split('.')[0],
      resource_type: 'raw' // This ensures PDFs are uploaded as raw files
    }, (err, res) => {
      if (err) return reject(err);
      
      // Determine mime type from the filename
      const getMimeType = (filename) => {
        const extension = filename.split('.').pop()?.toLowerCase();
        const mimeTypes = {
          'pdf': 'application/pdf',
          'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif'
        };
        return mimeTypes[extension] || `application/${extension}` || 'application/octet-stream';
      };
      
      resolve({ 
        url: res.secure_url, 
        publicId: res.public_id, 
        mimeType: getMimeType(filename || 'unknown')
      });
    });
    stream.end(buffer);
  });
}

module.exports = { uploadFromUrl, uploadBuffer };


