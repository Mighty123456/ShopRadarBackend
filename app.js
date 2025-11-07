const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const http = require('http');
const config = require('./config/config');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const shopRoutes = require('./routes/shopRoutes');
const userRoutes = require('./routes/userRoutes');
const activityRoutes = require('./routes/activityRoutes');
const productRoutes = require('./routes/productRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const offerRoutes = require('./routes/offerRoutes');
const mlRoutes = require('./routes/mlRoutes');
const searchRoutes = require('./routes/searchRoutes');
const rankingRoutes = require('./routes/rankingRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const subscriptionRequestRoutes = require('./routes/subscriptionRequestRoutes');
// Removed Google passport strategy initialization
const websocketService = require('./services/websocketService');
const updateLastActive = require('./middleware/updateLastActive');

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: config.jwtSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

app.use(passport.initialize());
app.use(passport.session());

// Update lastActive for authenticated users
app.use(updateLastActive);

// Validate Mongo URI early and connect before starting server
if (!config.mongoURI) {
  console.error('MongoDB connection error: MONGODB_URI is not set in environment');
  process.exit(1);
}

const connectToMongo = async () => {
  try {
    // Check if already connected
    if (mongoose.connection.readyState === 1) {
      return;
    }
    
    await mongoose.connect(config.mongoURI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 20000
    });
    console.log('MongoDB connected');
    console.log('Database name:', mongoose.connection.name);
  } catch (err) {
    console.error('MongoDB connection error:', err);
    throw err;
  }
};

// Connect to MongoDB on each request (for serverless)
app.use(async (req, res, next) => {
  try {
    await connectToMongo();
    next();
  } catch (err) {
    console.error('Database connection failed:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/users', userRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/products', productRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/subscription', subscriptionRequestRoutes);

app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'ShopRadar API is running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      shops: '/api/shops',
      products: '/api/products',
      users: '/api/users'
    }
  });
});

// Debug endpoint to check environment variables (remove in production)
app.get('/debug/env', (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV,
    hasMongoURI: !!process.env.MONGODB_URI,
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasEmailUser: !!process.env.EMAIL_USER,
    mongoURILength: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'ShopRadar API is running' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 3000;

// For Vercel serverless deployment
if (process.env.VERCEL) {
  // Export the app for Vercel
  module.exports = app;
} else {
  // Create HTTP server for local development, after DB connects
  (async () => {
    await connectToMongo();

    const server = http.createServer(app);

    // Initialize WebSocket service
    websocketService.initialize(server);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`WebSocket server initialized`);
    });
  })();
} 