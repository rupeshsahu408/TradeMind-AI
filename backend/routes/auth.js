const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/index');
const { sessions } = require('../db/sessions');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();
const SALT_ROUNDS = 12;

// GET /api/auth/status — check if any user/PIN is set up
router.get('/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT id FROM users LIMIT 1');
    res.json({ isSetup: result.rows.length > 0 });
  } catch (err) {
    console.error('[Auth] Status check error:', err.message);
    res.status(500).json({ error: 'Database error while checking setup status.' });
  }
});

// POST /api/auth/setup — first-time PIN setup
router.post('/setup', async (req, res) => {
  try {
    const { pin, language = 'english', theme = 'dark' } = req.body;

    if (!pin || typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 4 to 6 digits.' });
    }

    // Ensure no user exists yet
    const existing = await pool.query('SELECT id FROM users LIMIT 1');
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'PIN already configured. Use /api/auth/verify to log in.' });
    }

    const pin_hash = await bcrypt.hash(pin, SALT_ROUNDS);

    const userResult = await pool.query(
      'INSERT INTO users (pin_hash, language, theme) VALUES ($1, $2, $3) RETURNING id',
      [pin_hash, language, theme]
    );
    const userId = userResult.rows[0].id;

    // Create default preferences
    await pool.query(
      `INSERT INTO user_preferences (user_id, trading_style, risk_appetite, min_confidence, notifications_enabled, briefing_auto)
       VALUES ($1, 'all', 'moderate', 60, true, false)`,
      [userId]
    );

    // Create session token
    const token = uuidv4();
    sessions.set(token, { userId, lastActive: Date.now() });

    console.log('[Auth] New user set up. User ID:', userId);
    res.json({ success: true, token, userId, language, theme });
  } catch (err) {
    console.error('[Auth] Setup error:', err.message);
    res.status(500).json({ error: 'Failed to set up PIN. Please try again.' });
  }
});

// POST /api/auth/verify — verify PIN and create session
router.post('/verify', async (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin || typeof pin !== 'string') {
      return res.status(400).json({ error: 'PIN is required.' });
    }

    const result = await pool.query('SELECT id, pin_hash, language, theme FROM users LIMIT 1');
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No user found. Please set up your PIN first.' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(pin, user.pin_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect PIN. Please try again.' });
    }

    const token = uuidv4();
    sessions.set(token, { userId: user.id, lastActive: Date.now() });

    console.log('[Auth] User logged in. User ID:', user.id);
    res.json({
      success: true,
      token,
      userId: user.id,
      language: user.language,
      theme: user.theme,
    });
  } catch (err) {
    console.error('[Auth] Verify error:', err.message);
    res.status(500).json({ error: 'Authentication failed. Please try again.' });
  }
});

// POST /api/auth/logout — invalidate session
router.post('/logout', requireAuth, (req, res) => {
  sessions.delete(req.sessionToken);
  res.json({ success: true });
});

// POST /api/auth/change-pin — change PIN (requires current PIN + new PIN)
router.post('/change-pin', requireAuth, async (req, res) => {
  try {
    const { current_pin, new_pin } = req.body;

    if (!current_pin || !new_pin) {
      return res.status(400).json({ error: 'Both current_pin and new_pin are required.' });
    }
    if (!/^\d{4,6}$/.test(new_pin)) {
      return res.status(400).json({ error: 'New PIN must be 4 to 6 digits.' });
    }
    if (current_pin === new_pin) {
      return res.status(400).json({ error: 'New PIN must be different from current PIN.' });
    }

    // Fetch current hash
    const result = await pool.query('SELECT pin_hash FROM users WHERE id = $1', [req.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const isValid = await bcrypt.compare(current_pin, result.rows[0].pin_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current PIN is incorrect.' });
    }

    const new_hash = await bcrypt.hash(new_pin, SALT_ROUNDS);
    await pool.query('UPDATE users SET pin_hash = $1 WHERE id = $2', [new_hash, req.userId]);

    console.log('[Auth] PIN changed for user:', req.userId);
    res.json({ success: true, message: 'PIN changed successfully.' });
  } catch (err) {
    console.error('[Auth] Change PIN error:', err.message);
    res.status(500).json({ error: 'Failed to change PIN. Please try again.' });
  }
});

// GET /api/auth/me — get current user info (requires auth)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, language, theme, created_at FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const prefs = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [req.userId]
    );
    res.json({
      user: result.rows[0],
      preferences: prefs.rows[0] || null,
    });
  } catch (err) {
    console.error('[Auth] Me error:', err.message);
    res.status(500).json({ error: 'Failed to fetch user info.' });
  }
});

module.exports = router;
