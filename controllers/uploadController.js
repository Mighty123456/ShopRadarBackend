const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { uploadFromUrl, uploadBuffer, isCloudinaryConfigured } = require('../services/cloudinaryService');

// Configure multer for file uploads
const upload = multer();

// Middleware to handle multipart/form-data single file under field name 'file'
const handleSingleFile = upload.single('file');

// Function to save file locally
async function saveFileLocally(buffer, filename, folder = 'shop-docs') {
  try {
    console.log('saveFileLocally called with:', { filename, folder, bufferSize: buffer.length });
    
    // Create directory if it doesn't exist
    const uploadDir = path.join(__dirname, '..', 'uploads', folder);
    console.log('Upload directory:', uploadDir);
    
    await fs.mkdir(uploadDir, { recursive: true });
    console.log('Directory created/verified:', uploadDir);
    
    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);
    const uniqueFilename = `${name}_${timestamp}${ext}`;
    console.log('Generated filename:', uniqueFilename);
    
    // Save file
    const filePath = path.join(uploadDir, uniqueFilename);
    console.log('Saving file to:', filePath);
    
    await fs.writeFile(filePath, buffer);
    console.log('File saved successfully to:', filePath);
    
    // Return relative path for database storage
    const relativePath = path.join('uploads', folder, uniqueFilename);
    console.log('Returning relative path:', relativePath);
    
    return {
      localPath: relativePath,
      fullPath: filePath,
      filename: uniqueFilename
    };
  } catch (error) {
    console.error('Error saving file locally:', error);
    throw error;
  }
}

// POST /api/upload
// Accepts: multipart file OR { url }
// Returns: { url, publicId, mimeType, localPath }
async function uploadHandler(req, res) {
  try {
    console.log('Upload handler called');
    console.log('Request body:', req.body);
    console.log('Request file:', req.file ? { 
      originalname: req.file.originalname, 
      mimetype: req.file.mimetype, 
      size: req.file.size,
      bufferLength: req.file.buffer.length 
    } : 'No file');
    
    // Validate file size (max 10MB for Vercel compatibility)
    if (req.file && req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ 
        message: 'File size too large. Maximum size is 10MB.',
        maxSize: '10MB'
      });
    }
    
    if (req.body && req.body.url) {
      console.log('Processing URL upload');
      const folder = req.query.folder || 'shop-docs';
      
      if (isCloudinaryConfigured()) {
        try {
          const result = await uploadFromUrl(req.body.url, folder);
          return res.json(result);
        } catch (cloudinaryError) {
          console.warn('Cloudinary URL upload failed:', cloudinaryError.message);
          return res.status(500).json({ message: 'URL upload failed - Cloudinary not configured' });
        }
      } else {
        return res.status(500).json({ message: 'URL upload not supported - Cloudinary not configured' });
      }
    }
    if (req.file && req.file.buffer) {
      console.log('Processing file upload');
      const folder = req.query.folder || 'shop-docs';
      
      let cloudinaryResult = null;
      let localResult = null;
      
      // Try to save to Cloudinary first (if credentials are available)
      if (isCloudinaryConfigured()) {
        try {
          console.log('Uploading to Cloudinary...');
          cloudinaryResult = await uploadBuffer(req.file.buffer, folder, req.file.originalname);
          console.log('Cloudinary result:', cloudinaryResult);
        } catch (cloudinaryError) {
          console.warn('Cloudinary upload failed:', cloudinaryError.message);
          console.log('Continuing with local storage only...');
        }
      } else {
        console.log('Cloudinary not configured, using local storage only...');
      }
      
      // Always save locally as fallback
      try {
        console.log('Saving locally...');
        localResult = await saveFileLocally(req.file.buffer, req.file.originalname, folder);
        console.log('Local result:', localResult);
      } catch (localError) {
        console.error('Local save failed:', localError);
        throw new Error('Both Cloudinary and local storage failed');
      }
      
      // Return results (prioritize Cloudinary if available, otherwise use local)
      const finalResult = cloudinaryResult ? {
        ...cloudinaryResult,
        localPath: localResult.localPath,
        localFilename: localResult.filename
      } : {
        url: `/api/upload/local/${folder}/${localResult.filename}`,
        publicId: localResult.filename,
        mimeType: req.file.mimetype || 'application/octet-stream',
        localPath: localResult.localPath,
        localFilename: localResult.filename
      };
      
      console.log('Final result:', finalResult);
      return res.json(finalResult);
    }
    console.log('No file or URL provided');
    return res.status(400).json({ message: 'Provide a file or a url' });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message: 'Upload failed' });
  }
}

// GET /api/upload/local/:folder/:filename
// Serves local files
async function serveLocalFile(req, res) {
  try {
    const { folder, filename } = req.params;
    const filePath = path.join(__dirname, '..', 'uploads', folder, filename);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Set appropriate headers
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif'
    };
    
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
    // Send file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving local file:', error);
    res.status(500).json({ message: 'Error serving file' });
  }
}

module.exports = { handleSingleFile, uploadHandler, serveLocalFile };


