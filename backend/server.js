// Load .env file if present (local dev). On Replit/Vercel, secrets are injected automatically.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const { testConnection } = require('./db/index');

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:5000',
    'http://localhost:5173',
    /\.vercel\.app$/,
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

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/health', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));

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
    console.log(`[Server] Health: http://localhost:${PORT}/api/health`);
  });
}

start();
