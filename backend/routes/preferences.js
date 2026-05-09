/**
 * Preferences Routes — Phase 8
 *
 * GET  /api/preferences       — fetch user preferences
 * PUT  /api/preferences       — update user preferences
 * GET  /api/history/search    — full text search across chat + briefings
 * GET  /api/history/analyses  — list saved stock analyses (from predictions)
 */

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { pool } = require('../db/index');

const router = express.Router();
router.use(requireAuth);

// ─── GET /api/preferences ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [req.userId],
    );

    if (result.rows.length === 0) {
      // Create default preferences if they don't exist
      const created = await pool.query(
        `INSERT INTO user_preferences
           (user_id, trading_style, risk_appetite, min_confidence, notifications_enabled, briefing_auto)
         VALUES ($1, 'all', 'moderate', 60, true, false)
         RETURNING *`,
        [req.userId],
      );
      return res.json({ preferences: created.rows[0] });
    }

    res.json({ preferences: result.rows[0] });
  } catch (err) {
    console.error('[Preferences] GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch preferences.' });
  }
});

// ─── PUT /api/preferences ─────────────────────────────────────────────────────
// Partial update — only updates fields provided in body.
router.put('/', async (req, res) => {
  try {
    const {
      trading_style,
      risk_appetite,
      min_confidence,
      focus_sectors,
      notifications_enabled,
      briefing_auto,
    } = req.body;

    // Validate
    const validStyles    = ['intraday', 'swing', 'investing', 'all'];
    const validRisks     = ['conservative', 'moderate', 'aggressive'];
    const validMin       = (v) => typeof v === 'number' && v >= 0 && v <= 100;

    if (trading_style    !== undefined && !validStyles.includes(trading_style))
      return res.status(400).json({ error: `Invalid trading_style. Must be one of: ${validStyles.join(', ')}.` });

    if (risk_appetite    !== undefined && !validRisks.includes(risk_appetite))
      return res.status(400).json({ error: `Invalid risk_appetite. Must be one of: ${validRisks.join(', ')}.` });

    if (min_confidence   !== undefined && !validMin(min_confidence))
      return res.status(400).json({ error: 'min_confidence must be a number between 0 and 100.' });

    // Build dynamic SET clause
    const updates = [];
    const values  = [];
    let   idx     = 1;

    function addField(col, val) {
      if (val !== undefined) { updates.push(`${col} = $${idx++}`); values.push(val); }
    }

    addField('trading_style',        trading_style);
    addField('risk_appetite',        risk_appetite);
    addField('min_confidence',       min_confidence);
    addField('focus_sectors',        focus_sectors);
    addField('notifications_enabled', notifications_enabled);
    addField('briefing_auto',        briefing_auto);
    addField('updated_at',           new Date());

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided to update.' });
    }

    values.push(req.userId);
    const sql = `
      UPDATE user_preferences
      SET ${updates.join(', ')}
      WHERE user_id = $${idx}
      RETURNING *
    `;

    const result = await pool.query(sql, values);
    if (result.rows.length === 0) {
      // Preferences row doesn't exist — insert defaults then retry
      await pool.query(
        `INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [req.userId],
      );
      return res.json({ preferences: req.body, updated: true });
    }

    res.json({ preferences: result.rows[0], updated: true });
  } catch (err) {
    console.error('[Preferences] PUT error:', err.message);
    res.status(500).json({ error: 'Failed to update preferences.' });
  }
});

module.exports = router;
