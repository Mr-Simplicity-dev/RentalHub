const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const path = require('path');
const dotenv = require('dotenv');
const { Server } = require("socket.io");

dotenv.config();

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
const propertyUtilsRoutes = require('./routes/propertyUtils');
const propertyAlertsRoutes = require('./routes/propertyAlerts');

const disputesRoutes = require('./routes/disputes');
const legalRoutes = require('./routes/legal');
const complianceRoutes = require('./routes/compliance');
const exportRoutes = require('./routes/export');

const verificationRoutes = require('./routes/evidenceVerification.routes');

const { startPaymentJobs, startPropertyJobs } = require('./jobs/paymentJobs');

const audit = require('./config/middleware/auditMiddleware');
const { enforceFlags } = require('./config/middleware/featureFlags');
const { getAllowedFrontendOrigins, getFrontendUrl } = require('./config/utils/frontendUrl');
const startScheduler = require('./config/utils/scheduler');
const locationRoutes = require("./routes/locationRoutes");
const { generateSitemap } = require("./utils/sitemapGenerator");
const blogRoutes = require("./routes/blogRoutes");
const cron = require("node-cron");
const mongoose = require("mongoose");

const Blog = require("./models/Blog");
const locations = require("./data/nigeriaLocations");
const slugify = require("./utils/slugify");
const { pingGoogle } = require("./utils/pingGoogle");
const { generateAIContent } = require("./utils/aiContentGenerator");
const { generateTitles } = require("./config/utils/pageGenerator");
const { generateKeywords } = require("./config/utils/keywordGenerator");
const { saveRanking } = require("./config/utils/rankChecker");
const { generateBacklinks } = require("./utils/backlinkEngine");
const adminSeoRoutes = require("./routes/adminSeoRoutes");
const { checkRanking } = require("./config/utils/serpTracker");

async function runInitialSeoCheck() {
  const hasSerpApiKey =
    typeof process.env.SERP_API_KEY === "string" &&
    process.env.SERP_API_KEY.trim() &&
    process.env.SERP_API_KEY.trim() !== "...";

  if (!hasSerpApiKey) {
    console.log("Skipping initial ranking check: SERP_API_KEY is not configured");
    return;
  }

  try {
    const results = await checkRanking("houses for rent in ikeja");
    console.log("✅ Initial ranking check results:", results);
  } catch (err) {
    console.error("❌ Initial ranking check failed:", err.message);
  }
}

runInitialSeoCheck();

// ✅ Ensure DB is connected before cron runs
mongoose.connection.on("connected", () => {
  console.log("✅ MongoDB connected for cron jobs");

  // 🔥 AI BLOG GENERATION (AGGRESSIVE MODE - DAILY)
  cron.schedule("0 1 * * *", async () => {
    try {
      console.log("🚀 Generating AI blogs...");

      const postsPerDay = 20; // 🔥 change to 10 for more aggressive growth
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

    // 🔥 MUCH MORE VARIATIONS (IMPORTANT FOR SCALE)
    const title = titles[Math.floor(Math.random() * titles.length)];

    const slug = slugify(title);

    const exists = await Blog.findOne({ slug });
    if (exists) {
      console.log("⚠️ Duplicate found, retrying...");
      continue; // 🔥 try again instead of wasting loop
    }

    // 🔥 IMPROVED AI CONTENT (LESS REPETITION)
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

Visit: ${frontendUrl}/nigeria/${slugify(
      `${state.displayName}`
    )}

Start your search today and find the best home in ${location}.
`;

    const fullContent = `${generateAIContent(location)}\n\n${generateBacklinks(state.displayName, lga)}\n\n${content}`;

    await Blog.create({
      title,
      slug,
      content: fullContent,
      keywords: keywordsList
    });

    // track SEO rank for primary keyword
    await saveRanking(keywordsList[0], `${frontendUrl}/nigeria/${slug}`);

    created++;
    createdPost = true;

    console.log("✅ Created:", title);
  }
}

      console.log(`🎯 Total blogs created today: ${created}`);

    } catch (err) {
      console.error("❌ AI blog error:", err.message);
    }
  });

  // 🔥 DAILY SITEMAP SUBMISSION (2 AM)
  cron.schedule("0 2 * * *", async () => {
    try {
      console.log("📡 Submitting sitemap to Google...");
      await pingGoogle();
      console.log("✅ Sitemap submitted");
    } catch (err) {
      console.error("❌ Sitemap submission failed:", err.message);
    }
  });

});

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const apiRateLimitWindowMs =
  Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const apiRateLimitMax =
  Number(process.env.API_RATE_LIMIT_MAX) || (isProduction ? 2000 : 10000);
const authRateLimitWindowMs =
  Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const authRateLimitMax =
  Number(process.env.AUTH_RATE_LIMIT_MAX) || (isProduction ? 30 : 200);
const allowedOrigins = new Set(getAllowedFrontendOrigins());

app.use("/", locationRoutes);
app.use("/", blogRoutes);
app.use("/", adminSeoRoutes);

// Trust proxy (Render, Nginx etc)
app.set('trust proxy', 1);

// -----------------------------------
// Security Middleware
// -----------------------------------
app.use(helmet());

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

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limit
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

app.get("/sitemap.xml", async (req, res) => {
  try {
    const sitemap = await generateSitemap();
    res.header("Content-Type", "application/xml");
    res.send(sitemap);
  } catch (err) {
    res.status(500).send("Error generating sitemap");
  }
});

app.use('/api', enforceFlags);

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


// -----------------------------------
// ROUTES
// -----------------------------------
app.use('/api/auth', authLimiter, authRoutes);
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
    origin: Array.from(allowedOrigins),
    credentials: true,
  },
});

global.io = io;

