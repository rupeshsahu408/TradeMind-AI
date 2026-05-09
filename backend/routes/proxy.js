/**
 * Python Data Service Proxy
 *
 * All /api/market/*, /api/nse/*, /api/technical/*, /api/screener/*, /api/macro/*
 * requests are forwarded to the Python FastAPI service running on port 8000.
 *
 * Frontend only talks to the Node.js backend — single origin, auth enforced here.
 */

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();
const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

// ─── Generic proxy handler ────────────────────────────────────────────────────
async function proxyToPython(req, res) {
  // req.originalUrl = /api/market/indices?foo=bar
  // Strip /api prefix to get the Python service path
  const pythonPath = req.originalUrl.replace(/^\/api/, '');
  const targetUrl  = `${PYTHON_URL}${pythonPath}`;

  try {
    const fetchOptions = {
      method:  req.method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(targetUrl, fetchOptions);
    const data     = await upstream.json();

    res.status(upstream.status).json(data);
  } catch (err) {
    console.error(`[Proxy] Failed forwarding ${req.method} ${req.originalUrl} → ${targetUrl}:`, err.message);
    res.status(503).json({
      error:   'Data service temporarily unavailable.',
      detail:  err.message,
      path:    req.originalUrl,
    });
  }
}

// All proxy routes require authentication
router.use(requireAuth);
router.all('*', proxyToPython);

module.exports = router;
