const multer = require('multer');
const upload = multer();
const { uploadFromUrl, uploadBuffer } = require('../services/cloudinaryService');

// Middleware to handle multipart/form-data single file under field name 'file'
const handleSingleFile = upload.single('file');

// POST /api/upload
// Accepts: multipart file OR { url }
// Returns: { url, publicId, mimeType }
async function uploadHandler(req, res) {
  try {
    if (req.body && req.body.url) {
      const folder = req.query.folder || 'shop-docs';
      const result = await uploadFromUrl(req.body.url, folder);
      return res.json(result);
    }
    if (req.file && req.file.buffer) {
      const folder = req.query.folder || 'shop-docs';
      const result = await uploadBuffer(req.file.buffer, folder, req.file.originalname);
      return res.json(result);
    }
    return res.status(400).json({ message: 'Provide a file or a url' });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message: 'Upload failed' });
  }
}

module.exports = { handleSingleFile, uploadHandler };


