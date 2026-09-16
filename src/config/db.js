const mongoose = require('mongoose');

/**
 * Sanitizes MongoDB connection error messages to prevent credential leakage in logs
 */
const sanitizeError = (err) => {
  if (!err || !err.message) return 'Unknown database error';
  return err.message.replace(/mongodb(\+srv)?:\/\/[^@]+@/, 'mongodb$1://***:***@');
};

/**
 * Connect to external MongoDB Atlas database.
 * NOTE: Embedded in-memory fallback has been completely removed.
 * If connection fails, the backend will fail-fast and abort startup.
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('[MongoDB FATAL] MONGODB_URI environment variable is not defined.');
    console.error('[MongoDB FATAL] Embedded fallback is DISABLED. Exiting process.');
    process.exit(1);
  }

  // Bind connection lifecycle events (once)
  if (mongoose.connection.listenerCount('connected') === 0) {
    mongoose.connection.on('connected', () => {
      console.log(`[MongoDB] Connected to database: ${mongoose.connection.name} on host: ${mongoose.connection.host}`);
    });

    mongoose.connection.on('error', (err) => {
      console.error(`[MongoDB Runtime Error] ${sanitizeError(err)}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB Warning] Lost connection to MongoDB database.');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[MongoDB] Successfully reconnected to MongoDB database.');
    });
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: process.env.NODE_ENV !== 'production',
    });

    console.log(`[MongoDB] Successfully connected to external database: ${conn.connection.name} on host: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error(`[MongoDB FATAL] Failed to connect to external MongoDB: ${sanitizeError(err)}`);
    console.error('[MongoDB FATAL] Embedded fallback is DISABLED. Server startup aborted.');
    throw err;
  }
};

module.exports = { connectDB };
