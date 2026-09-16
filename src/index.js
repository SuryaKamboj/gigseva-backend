const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { connectDB } = require('./config/db');
const { initFirebase } = require('./config/firebase');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Parsing
app.use(helmet());
app.use(cors({
  origin: true, // Allow all origins in dev
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Health Check
app.get('/api/health', (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  const isConnecting = mongoose.connection.readyState === 2;
  const isDisconnecting = mongoose.connection.readyState === 3;
  const dbStatus = isConnected ? 'connected' : (isConnecting ? 'connecting' : (isDisconnecting ? 'disconnecting' : 'disconnected'));

  const healthData = {
    status: isConnected ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    service: 'gigsevak-backend',
    version: '1.0.0',
    database: {
      status: dbStatus,
      provider: 'mongodb',
      mode: 'external',
      name: mongoose.connection.name || null,
      host: mongoose.connection.host || null
    }
  };

  return res.status(isConnected ? 200 : 503).json(healthData);
});

// Route Mounting
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/workers', require('./routes/workers'));
app.use('/api/services', require('./routes/services'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/tracking', require('./routes/tracking'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.originalUrl} not found` }
  });
});

// Central Error Handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    await connectDB();
    initFirebase();

    const Service = require('./models/Service');
    const count = await Service.countDocuments();
    if (count === 0) {
      console.log('[GigSevak Backend] Empty DB detected. Seeding canonical data...');
      const { seed } = require('./seed');
      await seed(false);
    }

    app.listen(PORT, () => {
      console.log(`[GigSevak Backend] Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });
  } catch (err) {
    console.error('[GigSevak Backend] Failed to start:', err.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;