const mongoose = require('mongoose');
const Admin = require('../models/adminModel');
const config = require('../config/config');

const createAdminUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoURI);
    
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: 'admin@shopradar.com' });
    
    if (existingAdmin) {
      console.log('Admin user already exists');
      console.log('Email:', existingAdmin.email);
      console.log('Name:', existingAdmin.name);
      console.log('Role:', existingAdmin.role);
      process.exit(0);
    }

    // Create new admin user (supports overrides via env vars)
    const adminData = {
      email: process.env.ADMIN_EMAIL || 'insanethunder.2103@gmail.com',
      password: process.env.ADMIN_PASSWORD || 'admin@123', // Hashed by pre-save hook
      name: process.env.ADMIN_NAME || 'Admin User',
      role: 'admin',
      isActive: true
    };

    const admin = new Admin(adminData);
    await admin.save();

    console.log('Admin user created successfully!');
    console.log('Email:', admin.email);
    console.log('Name:', admin.name);
    console.log('Role:', admin.role);
    console.log('Password:', process.env.ADMIN_PASSWORD ? '[provided via env]' : 'admin123 (change this!)');

  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run the script
createAdminUser();
