import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import db from './config/middleware/database.js';

import authRoutes from './routes/auth.js';
import propertyRoutes from './routes/properties.js';
import paymentRoutes from './routes/payments.js';
import applicationRoutes from './routes/applications.js';
import messageRoutes from './routes/messages.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';
import superAdminRoutes from './routes/superAdmin.js';
import propertyUtilsRoutes from './routes/propertyUtils.js';
import propertyAlertsRoutes from './routes/propertyAlerts.js';

import paymentJobs from './jobs/paymentJobs.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const { startPaymentJobs, startPropertyJobs } = paymentJobs;

// Tell Express it is behind a proxy (Render, Vercel, Nginx, etc.)
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

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
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
    message: 'Rental Platform API is running',
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

    const result = await db.query(
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

// -----------------------------------
// ERROR HANDLER
// -----------------------------------
app.use((err, req, res, next) => {
  console.error(err.stack);
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
    error: err.message,
  });
});
