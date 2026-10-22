'use strict';

/* ── Load environment variables FIRST ──────────────────────────────────── */
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');
const fs      = require('fs');

const connectDB   = require('./config/db');
const logger      = require('./utils/logger');
const {
  helmetMW,
  apiLimiter,
  sanitizeMW,
  hppMW,
  compressMW,
} = require('./middleware/security');

const { router: adminAuthRouter, initAdmins } = require('./routes/adminAuth');
const customerAuthRouter = require('./routes/customerAuth');
const productsRouter     = require('./routes/products');
const settingsRouter     = require('./routes/settings');

/* ── Ensure logs/ folder exists ────────────────────────────────────────── */
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

/* ── CORS whitelist ────────────────────────────────────────────────────── */
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    /* Allow requests with no origin (mobile apps, curl, Postman) */
    if (!origin) return cb(null, true);
    if (ALLOWED.includes(origin)) return cb(null, true);
    logger.warn(`CORS blocked: ${origin}`);
    cb(new Error(`CORS: origin "${origin}" not allowed.`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204,
};

/* ════════════════════════════════════════════════════════════════════════
   APP
════════════════════════════════════════════════════════════════════════ */
const app = express();

/* ── Trust proxy (Render / Railway / Heroku put nginx in front) ─────── */
app.set('trust proxy', 1);

/* ── Global security middleware ─────────────────────────────────────── */
app.use(compressMW);                         // gzip
app.use(helmetMW);                           // security headers
app.use(cors(corsOptions));                  // CORS
app.options('*', cors(corsOptions));         // pre-flight for all routes

/* ── Body parsers ───────────────────────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));    // 10 MB allows base64 images
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ── NoSQL injection sanitiser & HPP ───────────────────────────────── */
app.use(sanitizeMW);
app.use(hppMW);

/* ── HTTP request logging (skip in test) ───────────────────────────── */
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: msg => logger.info(msg.trim()) },
    skip: (_req, res) => res.statusCode < 400, // only log errors in prod
  }));
  if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev')); // coloured short log in dev
  }
}

/* ── Global rate limiter (all /api routes) ─────────────────────────── */
app.use('/api', apiLimiter);

/* ════════════════════════════════════════════════════════════════════════
   ROUTES
════════════════════════════════════════════════════════════════════════ */
app.use('/api/admin',    adminAuthRouter);
app.use('/api/auth',     customerAuthRouter);
app.use('/api/products', productsRouter);
app.use('/api/settings', settingsRouter);

/* ── Health check ───────────────────────────────────────────────────── */
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

/* ── Serve frontend static files in production ──────────────────────── */
if (process.env.NODE_ENV === 'production') {
  const publicDir = path.join(__dirname, 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    /* Inject admin env variables into admin.html */
    app.get('/admin', (_req, res) => {
      const adminFile = path.join(publicDir, 'admin.html');
      if (!fs.existsSync(adminFile)) return res.status(404).send('Admin panel not found.');

      let html = fs.readFileSync(adminFile, 'utf8');
      const envScript = `
<script>
  window.ADMIN_1_USER = ${JSON.stringify(process.env.ADMIN_1_USER || '')};
  window.ADMIN_2_USER = ${JSON.stringify(process.env.ADMIN_2_USER || '')};
  window.ADMIN_3_USER = ${JSON.stringify(process.env.ADMIN_3_USER || '')};
  window.ADMIN_4_USER = ${JSON.stringify(process.env.ADMIN_4_USER || '')};
  window.API_BASE     = ${JSON.stringify(process.env.API_BASE_URL || '/api')};
</script>`;
      /* Inject just before </head> — passwords are NEVER injected to client */
      html = html.replace('</head>', envScript + '\n</head>');
      res.send(html);
    });

    /* Serve index.html with API_BASE injected */
    app.get('*', (_req, res) => {
      const indexFile = path.join(publicDir, 'index.html');
      if (!fs.existsSync(indexFile)) return res.status(404).send('Not found.');

      let html = fs.readFileSync(indexFile, 'utf8');
      const envScript = `<script>window.API_BASE=${JSON.stringify(process.env.API_BASE_URL || '/api')};</script>`;
      html = html.replace('</head>', envScript + '\n</head>');
      res.send(html);
    });
  }
}

/* ════════════════════════════════════════════════════════════════════════
   ERROR HANDLING
════════════════════════════════════════════════════════════════════════ */

/* 404 — unknown API route */
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

/* Global error handler */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  /* CORS errors */
  if (err.message && err.message.startsWith('CORS')) {
    return res.status(403).json({ success: false, message: err.message });
  }
  /* Multer errors */
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: `File too large. Max ${process.env.MAX_FILE_SIZE_MB || 5} MB.` });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({ success: false, message: `Too many files. Max ${process.env.MAX_IMAGES_PER_PRODUCT || 6}.` });
  }
  /* Mongoose validation */
  if (err.name === 'ValidationError') {
    const msgs = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ success: false, message: msgs.join('. ') });
  }
  /* Mongoose duplicate key */
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ success: false, message: `${field} already exists.` });
  }

  logger.error(`Unhandled error on ${req.method} ${req.path}: ${err.stack || err.message}`);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred.'
      : err.message,
  });
});

/* ════════════════════════════════════════════════════════════════════════
   STARTUP
════════════════════════════════════════════════════════════════════════ */
const PORT = parseInt(process.env.PORT) || 5000;

async function start() {
  await connectDB();     // connect to MongoDB
  await initAdmins();    // bcrypt-hash admin passwords from .env

  const server = app.listen(PORT, () => {
    logger.info(`🚀 Prime Kicks API running on port ${PORT} [${process.env.NODE_ENV}]`);
    logger.info(`   Health → http://localhost:${PORT}/api/health`);
  });

  /* Graceful shutdown */
  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully...`);
    server.close(async () => {
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      logger.info('MongoDB connection closed.');
      process.exit(0);
    });
    /* Force exit after 10s if graceful shutdown hangs */
    setTimeout(() => { logger.error('Forced exit.'); process.exit(1); }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled Promise Rejection: ${reason}`);
  });
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.stack}`);
    process.exit(1);
  });
}

start();
