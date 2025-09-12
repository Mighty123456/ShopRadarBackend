const mongoose = require('mongoose');
const User = require('../models/userModel');
const config = require('../config/config');

async function testActiveUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoURI);
    console.log('Connected to MongoDB');

    // Create some test users with different lastActive times
    const now = new Date();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Create test users
    const testUsers = [
      {
        email: 'active1@test.com',
        name: 'Active User 1',
        role: 'customer',
        lastActive: now,
        isActive: true
      },
      {
        email: 'active2@test.com',
        name: 'Active User 2',
        role: 'customer',
        lastActive: oneHourAgo,
        isActive: true
      },
      {
        email: 'inactive1@test.com',
        name: 'Inactive User 1',
        role: 'customer',
        lastActive: oneDayAgo,
        isActive: true
      },
      {
        email: 'inactive2@test.com',
        name: 'Inactive User 2',
        role: 'shop',
        lastActive: oneWeekAgo,
        isActive: true
      }
    ];

    // Clear existing test users
    await User.deleteMany({ email: { $regex: /@test\.com$/ } });
    console.log('Cleared existing test users');

    // Insert test users
    const createdUsers = await User.insertMany(testUsers);
    console.log(`Created ${createdUsers.length} test users`);

    // Test active users queries
    console.log('\n--- Testing Active Users Queries ---');
    
    // Last hour
    const activeLastHour = await User.countDocuments({
      lastActive: { $gte: oneHourAgo },
      isActive: true
    });
    console.log(`Active in last hour: ${activeLastHour}`);

    // Last 24 hours
    const activeLastDay = await User.countDocuments({
      lastActive: { $gte: oneDayAgo },
      isActive: true
    });
    console.log(`Active in last 24 hours: ${activeLastDay}`);

    // Last 7 days
    const activeLastWeek = await User.countDocuments({
      lastActive: { $gte: oneWeekAgo },
      isActive: true
    });
    console.log(`Active in last 7 days: ${activeLastWeek}`);

    // Get active users with details
    const activeUsers = await User.find({
      lastActive: { $gte: oneDayAgo },
      isActive: true
    })
    .select('-password -otp')
    .sort({ lastActive: -1 });

    console.log('\n--- Active Users Details ---');
    activeUsers.forEach(user => {
      console.log(`${user.name} (${user.email}) - Last active: ${user.lastActive}`);
    });

    console.log('\nTest completed successfully!');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the test
testActiveUsers();
