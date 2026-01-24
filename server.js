const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const db = require('./config/middleware/database'); // or wherever your pg Pool is exported from

require('dotenv').config();

const app = express();

// Tell Express it is behind a proxy (Render, Vercel, Nginx, etc.)
app.set('trust proxy', 1);

// -----------------------------------
// Security Middleware
// -----------------------------------
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -----------------------------------
// ROOT & HEALTH ROUTES
// -----------------------------------
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Rental Platform API is running'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// -----------------------------------
// EMAIL VERIFICATION
// -----------------------------------
app.get('/api/auth/verify-email', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      'UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id, email_verified',
      [decoded.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    console.error('Verify email error:', err);
    res.status(400).json({ success: false, message: 'Invalid or expired token' });
  }
});


// -----------------------------------
// ROUTES
// -----------------------------------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/super', superAdminRoutes);


// -----------------------------------
// MISSING FRONTEND ROUTES (SAFE STUBS)
// -----------------------------------

// This matches: GET /api/property-utils/popular-locations?limit=6
app.get('/api/property-utils/popular-locations', async (req, res) => {
  const limit = Number(req.query.limit) || 6;

  // Temporary safe response so frontend renders
  res.json({
    success: true,
    data: [
      { name: 'Lagos', count: 0 },
      { name: 'Abuja', count: 0 },
      { name: 'Port Harcourt', count: 0 },
      { name: 'Ibadan', count: 0 },
      { name: 'Benin', count: 0 },
      { name: 'Abeokuta', count: 0 },
    ].slice(0, limit)
  });
});

// Safety net for featured properties if your route throws
app.get('/api/properties/featured', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 6;

    // If your real implementation exists in routes/properties,
    // this will be overridden there. This is just a guard.
    res.json({
      success: true,
      data: []
    });
  } catch (err) {
    console.error('Featured properties error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load featured properties'
    });
  }
});

// -----------------------------------
// ERROR HANDLER
// -----------------------------------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// -----------------------------------
// CRON JOBS
// -----------------------------------
const { startPaymentJobs } = require('./jobs/paymentJobs');
startPaymentJobs();

// -----------------------------------
// START SERVER
// -----------------------------------
const PORT = process.env.APP_PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

app.use((err, req, res, next) => {
  console.error('UNHANDLED ERROR:', err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: err.message
  });
});
