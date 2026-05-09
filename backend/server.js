// Load .env file if present (local dev). On Replit/Vercel, secrets are injected automatically.
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { testConnection } = require('./db/index');

const app = express();
// Render injects PORT automatically. Fall back to BACKEND_PORT for local dev.
const PORT = process.env.PORT || process.env.BACKEND_PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:5000',
    'http://localhost:5173',
    /\.vercel\.app$/,
    /\.onrender\.com$/,
    /\.replit\.app$/,
    /\.replit\.dev$/,
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Request Logger ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Core Routes ──────────────────────────────────────────────────────────────
app.use('/api/health', require('./routes/health'));
app.use('/api/auth',   require('./routes/auth'));

// ─── AI Intelligence Core Routes (Phase 4) ───────────────────────────────────
app.use('/api', require('./routes/ai'));

// ─── Phase 7 Routes ───────────────────────────────────────────────────────────
app.use('/api/watchlist', require('./routes/watchlist'));
app.use('/api/accuracy',  require('./routes/accuracy'));
app.use('/api/push',      require('./routes/notifications'));

// ─── Phase 8 Routes ───────────────────────────────────────────────────────────
app.use('/api/events',      require('./routes/events'));
app.use('/api/preferences', require('./routes/preferences'));
app.use('/api/history',     require('./routes/history'));

// ─── Data Engine Proxy Routes (Phase 2 + 3) ───────────────────────────────────
// All requests forwarded to Python data service at PYTHON_SERVICE_URL (default localhost:8000)
// Auth is enforced inside the proxy router
const proxy = require('./routes/proxy');
app.use('/api/market',    proxy);
app.use('/api/nse',       proxy);
app.use('/api/technical', proxy);
app.use('/api/screener',  proxy);
app.use('/api/macro',     proxy);
app.use('/api/news',      proxy);
app.use('/api/sentiment', proxy);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  console.log('[Server] Starting Billionaire AI Backend...');
  await testConnection();

  // Run Phase 7 DB migrations (adds unique constraint for push_subscriptions)
  try {
    const { pool } = require('./db/index');
    await pool.query(`
      ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS id SERIAL;
      ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_unique;
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'push_subscriptions_endpoint_unique'
        ) THEN
          ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint);
        END IF;
      END $$;
    `);
    console.log('[Server] Phase 7 DB constraint verified (push_subscriptions.endpoint unique).');
  } catch (e) {
    // Non-fatal — constraint may already exist
    console.warn('[Server] Push subscriptions constraint check:', e.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
    console.log(`[Server] Health:   http://localhost:${PORT}/api/health`);
    console.log(`[Server] Phase 7:  /api/watchlist /api/accuracy /api/push`);
    console.log(`[Server] Proxy:    /api/market /api/nse /api/technical /api/screener /api/macro /api/news /api/sentiment`);
  });

  // Start Phase 7 cron jobs after server is up
  try {
    const { startCronJobs } = require('./cron/marketClose');
    startCronJobs();
  } catch (e) {
    console.warn('[Server] Cron jobs failed to start:', e.message);
  }
}

start();
