/**
 * History / Research Log Routes — Phase 8
 *
 * GET /api/history/sessions   — list all chat sessions with first message preview
 * GET /api/history/session/:sid — full chat session messages
 * GET /api/history/briefings  — list all saved morning briefings
 * GET /api/history/briefing/:id — full briefing content
 * GET /api/history/analyses   — list all saved stock deep dives (predictions)
 * GET /api/history/search     — full text search across chat + briefings
 */

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { pool } = require('../db/index');

const router = express.Router();
router.use(requireAuth);

// ─── GET /api/history/sessions ────────────────────────────────────────────────
// List all unique chat sessions, showing first user message as preview.
router.get('/sessions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (session_id)
         session_id,
         MIN(created_at) OVER (PARTITION BY session_id) AS started_at,
         MAX(created_at) OVER (PARTITION BY session_id) AS last_message_at,
         COUNT(*) OVER (PARTITION BY session_id) AS message_count,
         FIRST_VALUE(content) OVER (
           PARTITION BY session_id ORDER BY created_at ASC
           ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
         ) AS preview,
         FIRST_VALUE(role) OVER (
           PARTITION BY session_id ORDER BY created_at ASC
           ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
         ) AS first_role
       FROM chat_history
       WHERE user_id = $1
       ORDER BY session_id, started_at DESC`,
      [req.userId],
    );

    // Sort by started_at descending (most recent first)
    const sessions = result.rows
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
      .map(r => ({
        session_id:       r.session_id,
        started_at:       r.started_at,
        last_message_at:  r.last_message_at,
        message_count:    parseInt(r.message_count),
        preview:          (r.preview || '').substring(0, 140),
      }));

    res.json({ sessions, total: sessions.length });
  } catch (err) {
    console.error('[History] Sessions error:', err.message);
    res.status(500).json({ error: 'Failed to fetch chat sessions.' });
  }
});

// ─── GET /api/history/session/:sid ────────────────────────────────────────────
// Fetch all messages in a specific session.
router.get('/session/:sid', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, role, content, created_at
       FROM chat_history
       WHERE user_id = $1 AND session_id = $2
       ORDER BY created_at ASC`,
      [req.userId, req.params.sid],
    );
    res.json({ messages: result.rows, session_id: req.params.sid });
  } catch (err) {
    console.error('[History] Session detail error:', err.message);
    res.status(500).json({ error: 'Failed to fetch session.' });
  }
});

// ─── GET /api/history/briefings ───────────────────────────────────────────────
// List all saved morning briefings, newest first.
router.get('/briefings', async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const result = await pool.query(
      `SELECT id, market_mood, fii_net_flow, generated_at,
              LEFT(content, 300) AS preview,
              COALESCE(array_length(top_picks, 1), 0) AS picks_count
       FROM briefings
       WHERE user_id = $1
       ORDER BY generated_at DESC
       LIMIT $2`,
      [req.userId, parseInt(limit)],
    );
    res.json({ briefings: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('[History] Briefings error:', err.message);
    res.status(500).json({ error: 'Failed to fetch briefings.' });
  }
});

// ─── GET /api/history/briefing/:id ────────────────────────────────────────────
// Fetch full briefing content by ID.
router.get('/briefing/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM briefings WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found.' });
    }
    res.json({ briefing: result.rows[0] });
  } catch (err) {
    console.error('[History] Briefing detail error:', err.message);
    res.status(500).json({ error: 'Failed to fetch briefing.' });
  }
});

// ─── GET /api/history/analyses ────────────────────────────────────────────────
// List all saved stock deep dive predictions.
router.get('/analyses', async (req, res) => {
  try {
    const { limit = 50, ticker } = req.query;
    const params = [req.userId, parseInt(limit)];
    let whereExtra = '';
    if (ticker) {
      params.push(ticker.toUpperCase());
      whereExtra = `AND UPPER(ticker) = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT id, ticker, company_name, verdict, confidence, signal_stack_score,
              market_price_at_prediction, timeframe, predicted_at,
              LEFT(reasoning, 200) AS reasoning_preview
       FROM predictions
       WHERE user_id = $1 ${whereExtra}
       ORDER BY predicted_at DESC
       LIMIT $2`,
      params,
    );
    res.json({ analyses: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('[History] Analyses error:', err.message);
    res.status(500).json({ error: 'Failed to fetch analyses.' });
  }
});

// ─── GET /api/history/search ──────────────────────────────────────────────────
// Full-text search across chat history + briefings + predictions.
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters.' });
    }

    const term = `%${q.trim()}%`;

    const [chatRes, briefRes, predRes] = await Promise.all([
      // Search chat history
      pool.query(
        `SELECT 'chat' AS source_type,
                id, session_id, role, created_at,
                LEFT(content, 200) AS excerpt,
                NULL AS ticker
         FROM chat_history
         WHERE user_id = $1
           AND content ILIKE $2
         ORDER BY created_at DESC
         LIMIT 15`,
        [req.userId, term],
      ),
      // Search briefings
      pool.query(
        `SELECT 'briefing' AS source_type,
                id, NULL AS session_id, NULL AS role, generated_at AS created_at,
                LEFT(content, 200) AS excerpt,
                NULL AS ticker
         FROM briefings
         WHERE user_id = $1
           AND content ILIKE $2
         ORDER BY generated_at DESC
         LIMIT 10`,
        [req.userId, term],
      ),
      // Search predictions/analyses
      pool.query(
        `SELECT 'analysis' AS source_type,
                id, NULL AS session_id, NULL AS role, predicted_at AS created_at,
                CONCAT(verdict, ' — ', LEFT(COALESCE(reasoning, ''), 150)) AS excerpt,
                ticker
         FROM predictions
         WHERE user_id = $1
           AND (ticker ILIKE $2 OR company_name ILIKE $2 OR reasoning ILIKE $2)
         ORDER BY predicted_at DESC
         LIMIT 10`,
        [req.userId, term],
      ),
    ]);

    const results = [
      ...chatRes.rows,
      ...briefRes.rows,
      ...predRes.rows,
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ results, total: results.length, query: q.trim() });
  } catch (err) {
    console.error('[History] Search error:', err.message);
    res.status(500).json({ error: 'Search failed. Please try again.' });
  }
});

module.exports = router;
