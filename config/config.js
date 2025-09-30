const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

module.exports = {
  mongoURI: process.env.MONGODB_URI,
  
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  
  email: {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    service: 'gmail'
  },
  
  otp: {
    length: 6,
    expiresIn: 10 * 60 * 1000,
    maxAttempts: 3,
    resendCooldown: 60 * 60 * 1000
  },
  
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development'
}; 