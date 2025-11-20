const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.APP_PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
// Add this line in server.js after other routes
app.use('/api/admin', require('./routes/admin'));

// Add at the top of server.js
const { startPaymentJobs } = require('./jobs/paymentJobs');

// Add after routes
startPaymentJobs();

// Add this line in server.js after other routes
app.use('/api/property-utils', require('./routes/propertyUtils'));

// Update the jobs import in server.js
const { startPaymentJobs } = require('./jobs/paymentJobs');
const { startPropertyJobs } = require('./jobs/propertyJobs');

// Start all jobs
startPaymentJobs();
startPropertyJobs();

// Add these lines in server.js after other routes
app.use('/api/applications', require('./routes/applications'));
app.use('/api/messages', require('./routes/messages'));
// Add these lines in server.js after other routes
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/notifications', require('./routes/notifications'));