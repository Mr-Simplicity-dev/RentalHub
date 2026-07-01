const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

// ==================== STARTUP VALIDATION ====================
const REQUIRED_ENV_VARS = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
const missingEnvVars = REQUIRED_ENV_VARS.filter(key => !process.env[key] || !process.env[key].trim());
if (missingEnvVars.length) {
  console.error(`FATAL: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters long for security');
  process.exit(1);
}

// Security startup warnings
if (process.env.NODE_ENV === 'production') {
  if (!process.env.NIN_ENCRYPTION_KEY || process.env.NIN_ENCRYPTION_KEY.length < 64) {
    console.warn('WARNING: NIN_ENCRYPTION_KEY is missing or too short — stored NINs cannot be encrypted/decrypted');
  }
  if (!process.env.SMS_WEBHOOK_SECRET) {
    console.warn('WARNING: SMS_WEBHOOK_SECRET not set — SMS delivery webhook is blocked');
  }
  if ((!process.env.PREMBLY_SECRET_KEY && !process.env.PREMBLY_API_KEY) || process.env.PREMBLY_SECRET_KEY === 'your_secret_here') {
    console.warn('WARNING: PREMBLY_SECRET_KEY is not configured — NIN verification will fail');
  }
  if ((!process.env.PREMBLY_PUBLIC_KEY && !process.env.PREMBLY_APP_ID) || process.env.PREMBLY_PUBLIC_KEY === 'your_public_here') {
    console.warn('WARNING: PREMBLY_PUBLIC_KEY is not configured — NIN verification will fail');
  }
  if (!process.env.MONGODB_URI) {
    console.warn('WARNING: MONGODB_URI not set — blog generation and other cron jobs disabled');
  }
}

const db = require('./config/middleware/database');

const authRoutes = require('./routes/auth');
const propertyRoutes = require('./routes/properties');
const paymentRoutes = require('./routes/payments');
const applicationRoutes = require('./routes/applications');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
const notificationRoutes = require('./routes/notifications');
const superAdminRoutes = require('./routes/superAdmin');
const transportationRoutes = require('./routes/transportation');
const transportationAdminRoutes = require('./routes/transportationAdmin');
const fumigationCleaningRoutes = require('./routes/fumigationCleaning');
const propertyUtilsRoutes = require('./routes/propertyUtils');
const propertyAlertsRoutes = require('./routes/propertyAlerts');
const adRoutes = require('./routes/ads');
const emailMarketingRoutes = require('./routes/emailMarketing');
const smsMarketingRoutes = require('./routes/smsMarketing');
const platformRatingRoutes = require('./routes/platformRatings');
const recruitmentRoutes = require('./routes/recruitment');
const referralRoutes = require('./routes/referrals');
const smsDeliveryRoutes = require('./routes/smsDelivery');
const appLinksRoutes = require('./routes/appLinks');
const downloadsRoutes = require('./routes/downloads');

const disputesRoutes = require('./routes/disputes');
const disputeRoutes = require('./routes/disputeRoutes');
const legalRoutes = require('./routes/legal');
const complianceRoutes = require('./routes/compliance');
const exportRoutes = require('./routes/export');
const financialAdminRoutes = require('./routes/financialAdmin');
const stateAdminRoutes = require('./routes/stateAdmin');

const verificationRoutes = require('./routes/evidenceVerification.routes');
const agentCommissionRoutes = require('./routes/agentCommissions');
const adminAgentRoutes = require('./routes/adminAgents');
const agentWithdrawalRoutes = require('./routes/agentWithdrawals');
const stateMigrationRoutes = require('./routes/stateMigrations');
const supportRoutes = require('./routes/support');
const systemRoutes = require('./routes/system');

const damageReportRoutes = require('./routes/damageReports');
const rentSavingsRoutes = require('./routes/rentSavings');
const adminInspectionRoutes = require('./routes/adminInspections');
const appealRoutes = require('./routes/appeals');
const { startPaymentJobs, startPropertyJobs } = require('./jobs/paymentJobs');
const { startRentSavingsJobs } = require('./jobs/rentSavingsJobs');
const { startSmsDeliveryJobs } = require('./jobs/smsDeliveryJobs');
const { startSmsMarketingJobs } = require('./jobs/smsMarketingJobs');
const { startRecruitmentJobs } = require('./jobs/recruitmentJobs');
const csrfProtection = require('./config/middleware/csrfProtection');
const securityAlertMiddleware = require('./config/middleware/securityAlertMiddleware');
const {
  authSensitiveLimiter,
  paymentOpsLimiter,
  verificationOpsLimiter,
  financeOpsLimiter,
} = require('./config/middleware/securityRateLimiters');

const audit = require('./config/middleware/auditMiddleware');
const { enforceFlags } = require('./config/middleware/featureFlags');
const {
  getAllowedFrontendOrigins,
  getFrontendUrl,
} = require('./config/utils/frontendUrl');
const startScheduler = require('./config/utils/scheduler');
const locationRoutes = require('./routes/locationRoutes');
const { generateSitemap } = require('./utils/sitemapGenerator');
const blogRoutes = require('./routes/blogRoutes');
const cron = require('node-cron');
const mongoose = require('mongoose');

// Enable strict query mode to suppress Mongoose deprecation warning
mongoose.set('strictQuery', true);

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI).catch((err) => {
    console.error('MongoDB connection failed — MongoDB-dependent features (blogs, cron) disabled:', err.message);
  });
} else {
  console.warn('WARNING: MONGODB_URI not set — MongoDB-dependent features (blogs, cron) will not work');
}

const Blog = require('./models/Blog');
const locations = require('./data/nigeriaLocations');
const slugify = require('./utils/slugify');
const { pingGoogle } = require('./utils/pingGoogle');
const { generateAIContent } = require('./utils/aiContentGenerator');
const configureRealtimeSocket = require('./config/utils/realtimeSocket');
const { generateTitles } = require('./config/utils/pageGenerator');
const { generateKeywords } = require('./config/utils/keywordGenerator');
const { saveRanking } = require('./config/utils/rankChecker');
const { generateBacklinks } = require('./utils/backlinkEngine');
const adminSeoRoutes = require('./routes/adminSeoRoutes');
const { checkRanking } = require('./config/utils/serpTracker');
const {
  runEvidenceIntegrityMonitor,
} = require('./services/evidenceIntegrityMonitor.service');
const { runPayoutRetryCycle } = require('./services/payoutRetry.service');

async function runInitialSeoCheck() {
  const hasSerpApiKey =
    typeof process.env.SERP_API_KEY === 'string' &&
    process.env.SERP_API_KEY.trim() &&
    process.env.SERP_API_KEY.trim() !== '...';

  if (!hasSerpApiKey) {
    console.log('Skipping initial ranking check: SERP_API_KEY is not configured');
    return;
  }

  try {
    const results = await checkRanking('houses for rent in ikeja');
    console.log('Initial ranking check results:', results);
  } catch (err) {
    console.error('Initial ranking check failed:', err.message);
  }
}

const scheduleEvidenceIntegrityMonitoring = () => {
  const cronExpression =
    process.env.EVIDENCE_INTEGRITY_CRON?.trim() || '0 */6 * * *';
  const scanLimit = Math.max(
    Number(process.env.EVIDENCE_INTEGRITY_SCAN_LIMIT) || 200,
    1
  );

  const runMonitor = async () => {
    try {
      const summary = await runEvidenceIntegrityMonitor({ limit: scanLimit });
      console.log('Evidence integrity monitor completed', summary);
    } catch (err) {
      console.error('Evidence integrity monitor failed:', err.message);
    }
  };

  runMonitor();
  cron.schedule(cronExpression, runMonitor);
  console.log(`Evidence integrity monitor scheduled (${cronExpression})`);
};

const schedulePayoutRetries = () => {
  const cronExpression = process.env.PAYOUT_RETRY_CRON?.trim() || '*/10 * * * *';

  const runRetries = async () => {
    try {
      const summary = await runPayoutRetryCycle();
      console.log('Payout retry cycle completed', summary);
    } catch (err) {
      console.error('Payout retry cycle failed:', err.message);
    }
  };

  runRetries();
  cron.schedule(cronExpression, runRetries);
  console.log(`Payout retry scheduler started (${cronExpression})`);
};

// MongoDB connection monitoring
mongoose.connection.on('connected', () => {
  console.log('MongoDB connected for cron jobs');
  startMongoCronJobs();
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected — cron jobs paused');
});

const startMongoCronJobs = () => {
  // AI blog generation (reduced from 20 to 3 per day for quality and cost)
  cron.schedule('0 1 * * *', async () => {
    const DAILY_BUDGET_CENTS = Number(process.env.AI_BLOG_DAILY_BUDGET_CENTS) || 30;
    const MAX_POSTS_PER_DAY = Number(process.env.AI_BLOG_MAX_POSTS_PER_DAY) || 3;
    const postsPerDay = Math.min(MAX_POSTS_PER_DAY, Math.floor(DAILY_BUDGET_CENTS / 10));

    if (postsPerDay < 1) {
      console.log('AI blog generation skipped: DAILY_BUDGET_CENTS too low');
      return;
    }

    try {
      console.log('Generating AI blogs...');
      let created = 0;

      for (let i = 0; i < postsPerDay; i++) {
        let attempts = 0;
        let createdPost = false;

        while (!createdPost && attempts < 5) {
          attempts++;

          const state =
            locations[Math.floor(Math.random() * locations.length)];
          const lga =
            state.lgas[Math.floor(Math.random() * state.lgas.length)];

          const location = `${lga}, ${state.displayName}`;

          const titles = generateTitles(location);
          const keywordsList = generateKeywords(state.displayName, lga);
          const title = titles[Math.floor(Math.random() * titles.length)];
          const slug = slugify(title);

          const exists = await Blog.findOne({ slug });
          if (exists) {
            console.log('Duplicate found, retrying...');
            continue;
          }

          const frontendUrl = getFrontendUrl();
          const content = `
# ${title}

Looking for houses for rent in ${location}? This detailed guide explains rental options, pricing, and tips.

## Types of Properties Available
- Self contain apartments
- 1 bedroom flats
- 2 bedroom apartments
- Duplex and family homes

## Cost of Renting in ${location}
Rental prices vary depending on:
- Property size
- Area demand
- Amenities available

## Why Choose ${location}?
- Affordable housing options
- Access to transport and markets
- Growing residential development

## Tips for Renting
- Inspect property before payment
- Compare prices across listings
- Verify landlord details

## Explore More
- Houses for rent in ${location}
- Cheap apartments in ${location}
- Flats available in ${location}

Visit: ${frontendUrl}/nigeria/${slugify(`${state.displayName}`)}

Start your search today and find the best home in ${location}.
`;

          const fullContent = `${generateAIContent(location)}\n\n${generateBacklinks(
            state.displayName,
            lga
          )}\n\n${content}`;

          await Blog.create({
            title,
            slug,
            content: fullContent,
            keywords: keywordsList,
          });

          await saveRanking(keywordsList[0], `${frontendUrl}/nigeria/${slug}`);

          created++;
          createdPost = true;

          console.log('Created:', title);
        }
      }

      console.log(`Total blogs created today: ${created}`);
    } catch (err) {
      console.error('AI blog error:', err.message);
    }
  });

  // Daily sitemap submission
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('Submitting sitemap to Google...');
      await pingGoogle();
      console.log('Sitemap submitted');
    } catch (err) {
      console.error('Sitemap submission failed:', err.message);
    }
  });
};

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const clientBuildPath = path.join(__dirname, 'client', 'build');
const clientIndexPath = path.join(clientBuildPath, 'index.html');
const hasClientBuild = fs.existsSync(clientIndexPath);
const apiRateLimitWindowMs =
  Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const apiRateLimitMax =
  Number(process.env.API_RATE_LIMIT_MAX) || (isProduction ? 2000 : 10000);
const authRateLimitWindowMs =
  Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const authRateLimitMax =
  Number(process.env.AUTH_RATE_LIMIT_MAX) || (isProduction ? 30 : 200);
const allowedOrigins = new Set(getAllowedFrontendOrigins());

app.use('/', locationRoutes);
app.use('/', blogRoutes);
app.use('/.well-known', appLinksRoutes);

app.set('trust proxy', Number(process.env.TRUST_PROXY_COUNT) || 2);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "cdn.jsdelivr.net", "unpkg.com", "js-eu1.hs-scripts.com", "js.hs-scripts.com"],
      imgSrc: ["'self'", "res.cloudinary.com", "data:", "blob:", "js-eu1.hs-scripts.com"],
      connectSrc: ["'self'", "api.paystack.co", "api.hubspot.com", "forms.hubspot.com"],
      fontSrc: ["'self'", "fonts.googleapis.com", "fonts.gstatic.com"],
      styleSrc: ["'self'", "fonts.googleapis.com"],
      mediaSrc: ["'self'", "res.cloudinary.com", "blob:"],
      frameSrc: ["'self'", "app.hubspot.com"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin.replace(/\/+$/, ''))) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Uploaded files are served through authenticated routes only — never via public static
const authenticatedUploadsStaticOptions = {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-RentalHub-Access', 'authenticated-route-required');
  },
};

// Ad-space uploads are served publicly since ad content is inherently public.
// Passport uploads remain authenticated-only via routes/users.js.
const adSpacesUploadPath = path.join(__dirname, 'uploads', 'ad-spaces');
if (fs.existsSync(adSpacesUploadPath)) {
  app.use('/uploads/ad-spaces', express.static(adSpacesUploadPath, {
    dotfiles: 'deny',
    index: false,
    maxAge: '1d',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));
}

const limiter = rateLimit({
  windowMs: apiRateLimitWindowMs,
  max: apiRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please wait a moment and try again.',
  },
  skip: (req) => req.path === '/health',
});

const authLimiter = rateLimit({
  windowMs: authRateLimitWindowMs,
  max: authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication requests. Please wait a moment and try again.',
  },
  skip: (req) => req.method === 'GET',
});

app.use('/api/', limiter);

app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
const hpp = require('hpp');
app.use(hpp());
const inputSanitizer = require('./config/middleware/inputSanitizer');
app.use(inputSanitizer);
app.use(securityAlertMiddleware);
app.use(csrfProtection);

// Add correlation ID for request tracing
const { v4: uuidv4 } = require('uuid');
const logger = require('./config/utils/logger');
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('x-correlation-id', req.correlationId);
  req.logger = logger.child({ correlationId: req.correlationId });
  next();
});

app.use(audit('API Request', 'system'));

app.get('/', (req, res) => {
  if (hasClientBuild) {
    return res.sendFile(clientIndexPath);
  }

  res.json({
    status: 'ok',
    message: 'Rental Hub NG API is running',
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running',
  });
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const sitemap = await generateSitemap();
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (err) {
    res.status(500).send('Error generating sitemap');
  }
});

const publicDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 100 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many download requests. Please try again later.' },
});

// Mobile release downloads must stay public and available even when database-backed
// feature flag checks are unavailable.
app.use('/api/downloads', publicDownloadLimiter, downloadsRoutes);
app.use('/api/sms', smsDeliveryRoutes);
app.use('/api', enforceFlags);

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

// Build standard per-route limiter
const buildRouteLimiter = (max, windowMinutes = 15) => rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests for this service. Please slow down.' },
});

const adminLimiter = buildRouteLimiter(isProduction ? 200 : 500);
const generalOpsLimiter = buildRouteLimiter(isProduction ? 500 : 2000);
const propertyOpsLimiter = buildRouteLimiter(isProduction ? 300 : 1000);

app.use('/api/auth', authLimiter, authSensitiveLimiter, authRoutes);
app.use('/api/properties', propertyOpsLimiter, propertyRoutes);
app.use('/api/payments', paymentOpsLimiter, paymentRoutes);
app.use('/api/applications', generalOpsLimiter, applicationRoutes);
app.use('/api/messages', generalOpsLimiter, messageRoutes);
app.use('/api/users', generalOpsLimiter, userRoutes);
app.use('/api/admin', adminLimiter, adminRoutes);
app.use('/api/admin/seo', adminLimiter, adminSeoRoutes);
app.use('/api/dashboard', generalOpsLimiter, dashboardRoutes);
app.use('/api/notifications', generalOpsLimiter, notificationRoutes);
app.use('/api/super', adminLimiter, superAdminRoutes);
app.use('/api/transportation', generalOpsLimiter, transportationRoutes);
app.use('/api/transportation-admin', adminLimiter, transportationAdminRoutes);
app.use('/api/fumigation-cleaning', generalOpsLimiter, fumigationCleaningRoutes);
app.use('/api/property-utils', generalOpsLimiter, propertyUtilsRoutes);
app.use('/api/property-alerts', generalOpsLimiter, propertyAlertsRoutes);
app.use('/api/ads', generalOpsLimiter, adRoutes);
app.use('/api/email-marketing', generalOpsLimiter, emailMarketingRoutes);
app.use('/api/sms-marketing', generalOpsLimiter, smsMarketingRoutes);
app.use('/api/platform-ratings', generalOpsLimiter, platformRatingRoutes);
app.use('/api/recruitment', generalOpsLimiter, recruitmentRoutes);
app.use('/api/referrals', generalOpsLimiter, referralRoutes);

app.use('/api/disputes', generalOpsLimiter, disputesRoutes);
app.use('/api/disputes', generalOpsLimiter, disputeRoutes);
app.use('/api/legal', generalOpsLimiter, legalRoutes);
app.use('/api/compliance', generalOpsLimiter, complianceRoutes);
app.use('/api/export', generalOpsLimiter, exportRoutes);
app.use('/api/financial-admin', financeOpsLimiter, financialAdminRoutes);
app.use('/api/state-admin', adminLimiter, stateAdminRoutes);

app.use('/api/evidence', verificationOpsLimiter, verificationRoutes);
app.use('/api/commissions', financeOpsLimiter, agentCommissionRoutes);
app.use('/api/admin/agents', adminLimiter, adminAgentRoutes);
app.use('/api/withdrawals', financeOpsLimiter, agentWithdrawalRoutes);
app.use('/api/state-migrations', generalOpsLimiter, stateMigrationRoutes);
app.use('/api/support', adminLimiter, supportRoutes);
app.use('/api/system', adminLimiter, systemRoutes);
app.use('/api/damage-reports', generalOpsLimiter, damageReportRoutes);
app.use('/api/rent-savings', generalOpsLimiter, rentSavingsRoutes);
app.use('/api/admin/inspections', adminLimiter, adminInspectionRoutes);
app.use('/api', generalOpsLimiter, appealRoutes);

if (hasClientBuild) {
  app.use(express.static(clientBuildPath));

  app.get(/^\/(?!api\/|socket\.io\/|uploads\/).*/, (req, res) => {
    res.sendFile(clientIndexPath);
  });
}

app.use((err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  const isServerError = statusCode >= 500;

  if (isProduction && isServerError) {
    console.error('UNHANDLED ERROR (correlationId:', req.correlationId || 'N/A', '):', err.message || err);
    console.error(err.stack);
  } else {
    console.error(`[${req.correlationId || 'N/A'}] Route error (${statusCode}):`, err.message || err);
  }

  const safeMessage = isProduction && isServerError
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';

  const response = {
    success: false,
    message: safeMessage,
  };

  // In development, include correlation ID for debugging
  if (!isProduction && req.correlationId) {
    response.correlationId = req.correlationId;
  }

  // Do NOT include stack traces in responses even in development
  res.status(statusCode).json(response);
});

const PORT = process.env.APP_PORT || 5000;
let backgroundServicesStarted = false;

// const ensureStartupSchema = async () => {
//   try {
//     await db.query(`
//       ALTER TABLE users
//         ALTER COLUMN user_type TYPE VARCHAR(50);
//     `);
//   } catch (err) {
//     // Ignore if already the right type
//     if (!err.message?.includes('already')) {
//       console.error('ensureStartupSchema warning:', err.message);
//     }
//   }
// };

const ensureStartupSchema = async () => {
  // Startup schema changes are disabled.
  // Schema is now handled by migrations.
  return;
};

const startBackgroundServices = () => {
  if (backgroundServicesStarted) {
    return;
  }

  backgroundServicesStarted = true;
  runInitialSeoCheck();
  startPaymentJobs();
  startPropertyJobs();
  startRentSavingsJobs();
  startSmsDeliveryJobs();
  startSmsMarketingJobs();
  startRecruitmentJobs();
  startScheduler();
  scheduleEvidenceIntegrityMonitoring();
  schedulePayoutRetries();
};

const handleServerStartupError = (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Another instance of this server may already be running. Stop the existing process or set APP_PORT to a free port before restarting.`
    );
  } else {
    console.error('Server startup failed:', err);
  }

  process.exit(1);
};

const server = http.createServer(app);

server.once('error', handleServerStartupError);
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  ensureStartupSchema().then(() => startBackgroundServices()).catch((err) => {
    console.error('Startup schema migration failed:', err.message);
    startBackgroundServices();
  });
});

const io = new Server(server, {
  cors: {
    origin: Array.from(allowedOrigins),
    credentials: true,
  },
});

// Socket.io authentication middleware
io.use(async (socket, next) => {
  try {
    const { parseCookies } = require('./config/utils/authCookies');
    const cookies = parseCookies(socket.handshake?.headers?.cookie);
    const token = socket.handshake?.auth?.token ||
      cookies.auth_token ||
      String(socket.handshake?.headers?.authorization || '').replace(/^Bearer\s+/i, '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded.id || decoded.user_id;

    if (!userId) {
      return next(new Error('Invalid token payload'));
    }

    const userResult = await db.query(
      `SELECT id, user_type, is_active, deleted_at, token_version
       FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    if (!userResult.rows.length || userResult.rows[0].deleted_at || userResult.rows[0].is_active === false) {
      return next(new Error('User account is not active'));
    }

    const userData = userResult.rows[0];
    const tokenVersion = decoded.tv || 1;
    const dbVersion = userData.token_version || 1;
    if (tokenVersion < dbVersion) {
      return next(new Error('Session expired. Please log in again.'));
    }

    socket.userId = userId;
    socket.userType = userData.user_type;
    next();
  } catch (err) {
    return next(new Error('Invalid or expired token'));
  }
});

// Export io and realtime via a shared module instead of global variables
const realtime = configureRealtimeSocket(io);
module.exports = { io, realtime };
