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
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
    console.log(`[Server] Health:  http://localhost:${PORT}/api/health`);
    console.log(`[Server] Proxy:   /api/market /api/nse /api/technical /api/screener /api/macro /api/news /api/sentiment`);
  });
}

start();
