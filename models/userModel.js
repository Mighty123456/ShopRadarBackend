const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String },
  fullName: { type: String },
  role: { type: String, default: 'customer' },
  googleId: { type: String, unique: true, sparse: true },
  name: { type: String },
  picture: { type: String },
  isEmailVerified: { type: Boolean, default: false },
  otp: {
    code: { type: String },
    expiresAt: { type: Date }
  },
  otpAttempts: { type: Number, default: 0 },
  lastOtpSent: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema); 