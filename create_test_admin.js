const mongoose = require('mongoose');
const Admin = require('./models/adminModel');
const config = require('./config/config');

async function createTestAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoURI);
    console.log('✅ Connected to MongoDB');

    // Check if test admin already exists
    const existingAdmin = await Admin.findOne({ email: 'insanethunder.2103@gmail.com' });
    if (existingAdmin) {
      console.log('⚠️ Test admin already exists');
      console.log('   Email:', existingAdmin.email);
      console.log('   Name:', existingAdmin.name);
      console.log('   Role:', existingAdmin.role);
      return;
    }

    // Create test admin
    console.log('👤 Creating test admin...');
    
    const admin = new Admin({
      email: 'insanethunder.2103@gmail.com',
      password: 'admin@123',
      name: 'Test Admin',
      role: 'admin',
      isActive: true
    });

    await admin.save();
    console.log('✅ Test admin created successfully!');
    console.log('📧 Email: insanethunder.2103@gmail.com');
    console.log('🔑 Password: admin@123');
    console.log('👤 Name: Test Admin');
    console.log('🔐 Role: admin');

  } catch (error) {
    console.error('❌ Error creating test admin:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  createTestAdmin();
}

module.exports = { createTestAdmin };

