/**
 * Accuracy Tracker Routes — Phase 7
 *
 * GET  /api/accuracy/predictions  — all predictions with accuracy status joined
 * GET  /api/accuracy/stats        — overall + 7d + 30d stats, best signals/sectors
 * POST /api/accuracy/check/:id    — manually trigger accuracy check for one prediction
 * POST /api/accuracy/run          — run full post-market check for all unresolved predictions
 */

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { pool } = require('../db/index');

const router = express.Router();
router.use(requireAuth);

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

async function pythonGet(path) {
  try {
    const r = await fetch(`${PYTHON_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

// ─── Determine if a prediction was correct ────────────────────────────────────
// BUY/STRONG BUY: correct if close > predicted_price
// SELL/STRONG SELL: correct if close < predicted_price
// NEUTRAL/HOLD: not checked for accuracy (skip)

function determineCorrectness(verdict, predictedPrice, actualClose) {
  if (!predictedPrice || !actualClose) return null;
  const v = (verdict || '').toUpperCase();
  if (v.includes('BUY'))  return actualClose > predictedPrice;
  if (v.includes('SELL')) return actualClose < predictedPrice;
  return null; // NEUTRAL / HOLD — not tracked
}

// ─── Core accuracy check for a single prediction ─────────────────────────────

async function checkPrediction(pred) {
  const nseTicker = `${pred.ticker}.NS`;
  // Fetch current price (post-market close approximation)
  const quote = await pythonGet(`/market/quote?ticker=${encodeURIComponent(nseTicker)}`);
  if (!quote?.price) return null;

  const actualClose    = parseFloat(quote.price);
  const predictedPrice = pred.market_price_at_prediction
    ? parseFloat(pred.market_price_at_prediction)
    : null;

  const wasCorrect  = determineCorrectness(pred.verdict, predictedPrice, actualClose);
  const changePct   = predictedPrice
    ? ((actualClose - predictedPrice) / predictedPrice * 100).toFixed(2)
    : null;

  return {
    actual_close_price: actualClose,
    actual_change_pct:  changePct ? parseFloat(changePct) : null,
    was_correct:        wasCorrect,
    notes: `Checked at market close. Ticker: ${pred.ticker}, Predicted: ₹${predictedPrice ?? 'N/A'}, Actual: ₹${actualClose}`,
  };
}

// ─── GET /api/accuracy/predictions ───────────────────────────────────────────

router.get('/predictions', async (req, res) => {
  try {
    const { filter = 'all', ticker, limit = 100 } = req.query;

    let query = `
      SELECT
        p.*,
        a.actual_close_price,
        a.actual_change_pct,
        a.was_correct,
        a.checked_at,
        a.notes AS accuracy_notes
      FROM predictions p
      LEFT JOIN accuracy_log a ON a.prediction_id = p.id
      WHERE p.user_id = $1
    `;
    const params = [req.userId];

    if (ticker) {
      params.push(ticker.toUpperCase());
      query += ` AND p.ticker = $${params.length}`;
    }

    if (filter === 'hits') {
      query += ' AND a.was_correct = true';
    } else if (filter === 'misses') {
      query += ' AND a.was_correct = false';
    } else if (filter === 'pending') {
      query += ' AND a.id IS NULL AND p.verdict NOT IN (\'NEUTRAL\', \'HOLD\', \'MILD BUY\')';
    }

    query += ` ORDER BY p.predicted_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit) || 100);

    const result = await pool.query(query, params);
    res.json({ predictions: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('[Accuracy] GET predictions error:', err.message);
    res.status(500).json({ error: 'Failed to fetch predictions.' });
  }
});

// ─── GET /api/accuracy/stats ──────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    // All-time stats
    const allTime = await pool.query(`
      SELECT
        COUNT(a.id)                                              AS total_checked,
        COUNT(a.id) FILTER (WHERE a.was_correct = true)         AS hits,
        COUNT(a.id) FILTER (WHERE a.was_correct = false)        AS misses,
        ROUND(
          100.0 * COUNT(a.id) FILTER (WHERE a.was_correct = true)
            / NULLIF(COUNT(a.id), 0), 1
        )                                                        AS accuracy_pct,
        COUNT(p.id)                                              AS total_predictions
      FROM predictions p
      LEFT JOIN accuracy_log a ON a.prediction_id = p.id
      WHERE p.user_id = $1
    `, [req.userId]);

    // Last 7 days
    const last7 = await pool.query(`
      SELECT
        COUNT(a.id)                                               AS total_checked,
        COUNT(a.id) FILTER (WHERE a.was_correct = true)          AS hits,
        ROUND(
          100.0 * COUNT(a.id) FILTER (WHERE a.was_correct = true)
            / NULLIF(COUNT(a.id), 0), 1
        )                                                         AS accuracy_pct
      FROM predictions p
      LEFT JOIN accuracy_log a ON a.prediction_id = p.id
      WHERE p.user_id = $1 AND p.predicted_at >= NOW() - INTERVAL '7 days'
    `, [req.userId]);

    // Last 30 days
    const last30 = await pool.query(`
      SELECT
        COUNT(a.id)                                               AS total_checked,
        COUNT(a.id) FILTER (WHERE a.was_correct = true)          AS hits,
        ROUND(
          100.0 * COUNT(a.id) FILTER (WHERE a.was_correct = true)
            / NULLIF(COUNT(a.id), 0), 1
        )                                                         AS accuracy_pct
      FROM predictions p
      LEFT JOIN accuracy_log a ON a.prediction_id = p.id
      WHERE p.user_id = $1 AND p.predicted_at >= NOW() - INTERVAL '30 days'
    `, [req.userId]);

    // Accuracy by verdict type
    const byVerdict = await pool.query(`
      SELECT
        p.verdict,
        COUNT(a.id)                                               AS checked,
        COUNT(a.id) FILTER (WHERE a.was_correct = true)          AS hits,
        ROUND(
          100.0 * COUNT(a.id) FILTER (WHERE a.was_correct = true)
            / NULLIF(COUNT(a.id), 0), 1
        )                                                         AS accuracy_pct
      FROM predictions p
      JOIN accuracy_log a ON a.prediction_id = p.id
      WHERE p.user_id = $1
      GROUP BY p.verdict
      ORDER BY accuracy_pct DESC NULLS LAST
    `, [req.userId]);

    // Top tickers by accuracy
    const byTicker = await pool.query(`
      SELECT
        p.ticker,
        p.company_name,
        COUNT(a.id)                                               AS checked,
        COUNT(a.id) FILTER (WHERE a.was_correct = true)          AS hits,
        ROUND(
          100.0 * COUNT(a.id) FILTER (WHERE a.was_correct = true)
            / NULLIF(COUNT(a.id), 0), 1
        )                                                         AS accuracy_pct
      FROM predictions p
      JOIN accuracy_log a ON a.prediction_id = p.id
      WHERE p.user_id = $1
      GROUP BY p.ticker, p.company_name
      HAVING COUNT(a.id) >= 2
      ORDER BY accuracy_pct DESC NULLS LAST
      LIMIT 10
    `, [req.userId]);

    // Accuracy trend — last 30 checks (for chart)
    const trend = await pool.query(`
      SELECT
        DATE(a.checked_at)                                       AS date,
        COUNT(a.id)                                              AS checked,
        COUNT(a.id) FILTER (WHERE a.was_correct = true)         AS hits,
        ROUND(
          100.0 * COUNT(a.id) FILTER (WHERE a.was_correct = true)
            / NULLIF(COUNT(a.id), 0), 1
        )                                                        AS accuracy_pct
      FROM accuracy_log a
      JOIN predictions p ON p.id = a.prediction_id
      WHERE p.user_id = $1 AND a.checked_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(a.checked_at)
      ORDER BY date ASC
    `, [req.userId]);

    // Pending (not yet checked) count
    const pending = await pool.query(`
      SELECT COUNT(*) AS count
      FROM predictions p
      WHERE p.user_id = $1
        AND p.verdict NOT IN ('NEUTRAL', 'HOLD')
        AND NOT EXISTS (SELECT 1 FROM accuracy_log a WHERE a.prediction_id = p.id)
        AND p.predicted_at < NOW() - INTERVAL '1 hour'
    `, [req.userId]);

    res.json({
      all_time: allTime.rows[0],
      last_7_days: last7.rows[0],
      last_30_days: last30.rows[0],
      by_verdict: byVerdict.rows,
      by_ticker: byTicker.rows,
      trend: trend.rows,
      pending_checks: parseInt(pending.rows[0]?.count ?? 0),
    });
  } catch (err) {
    console.error('[Accuracy] GET stats error:', err.message);
    res.status(500).json({ error: 'Failed to compute accuracy statistics.' });
  }
});

// ─── POST /api/accuracy/check/:id ────────────────────────────────────────────
// Manually check accuracy for a single prediction.

router.post('/check/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid prediction ID.' });
    }

    // Fetch prediction and verify ownership
    const predResult = await pool.query(
      'SELECT * FROM predictions WHERE id = $1 AND user_id = $2',
      [parseInt(id), req.userId],
    );
    if (predResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prediction not found.' });
    }

    const pred = predResult.rows[0];

    // Check if already logged
    const existing = await pool.query(
      'SELECT id FROM accuracy_log WHERE prediction_id = $1',
      [pred.id],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Accuracy already checked for this prediction.' });
    }

    const result = await checkPrediction(pred);
    if (!result) {
      return res.status(422).json({ error: `Could not fetch current price for ${pred.ticker}. Try again later.` });
    }

    await pool.query(
      `INSERT INTO accuracy_log (prediction_id, actual_close_price, actual_change_pct, was_correct, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [pred.id, result.actual_close_price, result.actual_change_pct, result.was_correct, result.notes],
    );

    console.log(`[Accuracy] Checked prediction ${pred.id} (${pred.ticker}): ${result.was_correct ? 'HIT ✅' : result.was_correct === false ? 'MISS ❌' : 'N/A'}`);

    res.json({
      success:           true,
      prediction_id:     pred.id,
      ticker:            pred.ticker,
      verdict:           pred.verdict,
      was_correct:       result.was_correct,
      actual_close:      result.actual_close_price,
      actual_change_pct: result.actual_change_pct,
    });
  } catch (err) {
    console.error('[Accuracy] Check error:', err.message);
    res.status(500).json({ error: 'Failed to check accuracy.' });
  }
});

// ─── POST /api/accuracy/run ───────────────────────────────────────────────────
// Run post-market check for ALL unresolved predictions older than 1 hour.
// Called by cron job at 4:30 PM IST. Also exposable via manual trigger.

router.post('/run', async (req, res) => {
  try {
    // Get all unresolved predictions for this user (or all users if internal cron call)
    const isInternal = req.headers['x-internal-cron'] === process.env.SESSION_SECRET;
    let query, params;

    if (isInternal) {
      query = `
        SELECT p.* FROM predictions p
        WHERE p.verdict NOT IN ('NEUTRAL', 'HOLD')
          AND NOT EXISTS (SELECT 1 FROM accuracy_log a WHERE a.prediction_id = p.id)
          AND p.predicted_at < NOW() - INTERVAL '1 hour'
          AND p.predicted_at > NOW() - INTERVAL '7 days'
        LIMIT 50
      `;
      params = [];
    } else {
      query = `
        SELECT p.* FROM predictions p
        WHERE p.user_id = $1
          AND p.verdict NOT IN ('NEUTRAL', 'HOLD')
          AND NOT EXISTS (SELECT 1 FROM accuracy_log a WHERE a.prediction_id = p.id)
          AND p.predicted_at < NOW() - INTERVAL '1 hour'
          AND p.predicted_at > NOW() - INTERVAL '7 days'
        LIMIT 20
      `;
      params = [req.userId];
    }

    const unresolved = await pool.query(query, params);

    if (unresolved.rows.length === 0) {
      return res.json({ success: true, message: 'No pending predictions to check.', checked: 0 });
    }

    let hits = 0, misses = 0, errors = 0;
    const results = [];

    for (const pred of unresolved.rows) {
      try {
        const result = await checkPrediction(pred);
        if (!result) { errors++; continue; }

        await pool.query(
          `INSERT INTO accuracy_log (prediction_id, actual_close_price, actual_change_pct, was_correct, notes)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [pred.id, result.actual_close_price, result.actual_change_pct, result.was_correct, result.notes],
        );

        if (result.was_correct === true)  hits++;
        if (result.was_correct === false) misses++;

        results.push({
          ticker:      pred.ticker,
          verdict:     pred.verdict,
          was_correct: result.was_correct,
          actual:      result.actual_close_price,
        });
      } catch (e) {
        console.error(`[Accuracy] Run: error for ${pred.ticker}:`, e.message);
        errors++;
      }
    }

    console.log(`[Accuracy] Run complete: ${hits} hits, ${misses} misses, ${errors} errors`);

    res.json({
      success:  true,
      checked:  unresolved.rows.length - errors,
      hits,
      misses,
      errors,
      results,
    });
  } catch (err) {
    console.error('[Accuracy] Run error:', err.message);
    res.status(500).json({ error: 'Failed to run accuracy check.' });
  }
});

module.exports = router;
