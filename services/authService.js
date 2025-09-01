const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

const generateToken = (user) => {
  return jwt.sign({ id: user._id, email: user.email }, config.jwtSecret, { expiresIn: '1d' });
};

const generateRefreshToken = (user) => {
  return jwt.sign({ id: user._id }, config.jwtSecret, { expiresIn: '7d' });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

module.exports = { hashPassword, comparePassword, generateToken, generateRefreshToken, verifyToken }; 


