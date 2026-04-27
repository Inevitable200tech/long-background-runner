/**
 * db.js
 * MongoDB connection manager
 */

const mongoose = require('mongoose');
const config = require('../config/config');

let isConnected = false;

/**
 * Connect to MongoDB
 * @returns {Promise<boolean>} true if connected successfully
 */
async function connect() {
  if (isConnected) return true;

  const uri = config.mongodb.uri;
  if (!uri) {
    console.warn('⚠️ MONGODB_URI not set — MongoDB history disabled, using file fallback.');
    return false;
  }

  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000
    });
    isConnected = true;
    console.log('✅ MongoDB connected successfully');

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
      isConnected = false;
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
      isConnected = false;
    });

    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    isConnected = false;
    return false;
  }
}

/**
 * Check if MongoDB is connected
 * @returns {boolean}
 */
function connected() {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * Disconnect from MongoDB
 */
async function disconnect() {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('🔌 MongoDB disconnected');
  }
}

module.exports = { connect, connected, disconnect };
