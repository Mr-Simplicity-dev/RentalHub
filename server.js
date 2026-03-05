const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const path = require('path');
const dotenv = require('dotenv');
const { Server } = require("socket.io");

const db = require('./config/middleware/database');

// const authRoutes = require('./routes/auth');
const propertyRoutes = require('./routes/properties');
const paymentRoutes = require('./routes/payments');
const applicationRoutes = require('./routes/applications');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
const notificationRoutes = require('./routes/notifications');
// const superAdminRoutes = require('./routes/superAdmin');
const propertyUtilsRoutes = require('./routes/propertyUtils');
const propertyAlertsRoutes = require('./routes/propertyAlerts');

const disputesRoutes = require('./routes/disputes');
const legalRoutes = require('./routes/legal');
const complianceRoutes = require('./routes/compliance');
const exportRoutes = require('./routes/export');

const verificationRoutes = require('./routes/evidenceVerification.routes');

const { startPaymentJobs, startPropertyJobs } = require('./jobs/paymentJobs');

const audit = require('./config/middleware/auditMiddleware');
const startScheduler = require('./config/utils/scheduler');
const authRoutes = require('./routes/auth').default;
const superAdminRoutes = require('./routes/superAdmin').default;

dotenv.config();

const app = express();

// Trust proxy (Render, Nginx etc)
app.set('trust proxy', 1);

// -----------------------------------
// Security Middleware
// -----------------------------------
app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

app.use('/api/', limiter);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Audit middleware
app.use(audit('API Request', 'system'));

// -----------------------------------
// ROOT & HEALTH
// -----------------------------------
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Rental Platform API is running',
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running',
  });
});

// -----------------------------------
// EMAIL VERIFICATION
// -----------------------------------
app.get('/api/auth/verify-email', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Token missing',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await db.query(
      `UPDATE users
       SET email_verified = TRUE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email_verified`,
      [decoded.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      message: 'Email verified successfully',
    });
  } catch (err) {
    console.error('Verify email error:', err);

    res.status(400).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
});

console.log('authRoutes:', typeof authRoutes);
console.log('propertyRoutes:', typeof propertyRoutes);
console.log('paymentRoutes:', typeof paymentRoutes);
console.log('applicationRoutes:', typeof applicationRoutes);
console.log('messageRoutes:', typeof messageRoutes);
console.log('userRoutes:', typeof userRoutes);
console.log('adminRoutes:', typeof adminRoutes);
console.log('dashboardRoutes:', typeof dashboardRoutes);
console.log('notificationRoutes:', typeof notificationRoutes);
console.log('superAdminRoutes:', typeof superAdminRoutes);
console.log('propertyUtilsRoutes:', typeof propertyUtilsRoutes);
console.log('propertyAlertsRoutes:', typeof propertyAlertsRoutes);
console.log('disputesRoutes:', typeof disputesRoutes);
console.log('legalRoutes:', typeof legalRoutes);
console.log('complianceRoutes:', typeof complianceRoutes);
console.log('exportRoutes:', typeof exportRoutes);
console.log('verificationRoutes:', typeof verificationRoutes);

// -----------------------------------
// ROUTES
// -----------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/super', superAdminRoutes);
app.use('/api/property-utils', propertyUtilsRoutes);
app.use('/api/property-alerts', propertyAlertsRoutes);

app.use('/api/disputes', disputesRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/export', exportRoutes);

app.use('/evidence', verificationRoutes);

// -----------------------------------
// ERROR HANDLER
// -----------------------------------
app.use((err, req, res, next) => {
  console.error('UNHANDLED ERROR:', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// -----------------------------------
// CRON JOBS
// -----------------------------------
startPaymentJobs();
startPropertyJobs();
startScheduler();

// -----------------------------------
// START SERVER
// -----------------------------------
const PORT = process.env.APP_PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

global.io = io;
