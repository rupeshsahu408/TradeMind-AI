const express = require('express');
const { testConnection } = require('../db/index');

const router = express.Router();

// GET /api/health
router.get('/', async (req, res) => {
  const dbConnected = await testConnection();
  res.json({
    status: 'ok',
    service: 'Billionaire AI Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development',
  });
});

module.exports = router;
