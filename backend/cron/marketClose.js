/**
 * Market Close Cron Job — Phase 7
 *
 * Runs at 4:30 PM IST (11:00 UTC) Monday–Friday.
 * - Checks all unresolved predictions against actual closing prices.
 * - Sends push notification with summary if any predictions resolved.
 *
 * Additional cron:
 * - Nifty alert check: every 15 minutes during market hours.
 * - High-conviction call notification: triggered when /api/analyze produces 90%+ confidence.
 */

const cron = require('node-cron');
const { pool } = require('../db/index');
const { broadcastToAllUsers } = require('../routes/notifications');

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

async function pythonGet(path) {
  try {
    const r = await fetch(`${PYTHON_URL}${path}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

function determineCorrectness(verdict, predictedPrice, actualClose) {
  if (!predictedPrice || !actualClose) return null;
  const v = (verdict || '').toUpperCase();
  if (v.includes('BUY'))  return actualClose > predictedPrice;
  if (v.includes('SELL')) return actualClose < predictedPrice;
  return null;
}

// ─── Post-market accuracy check ───────────────────────────────────────────────
// Runs at 4:30 PM IST = 11:00 AM UTC

async function runPostMarketCheck() {
  console.log('[Cron] Post-market accuracy check started...');

  try {
    // Get all unresolved predictions from the past 7 days
    const unresolved = await pool.query(`
      SELECT p.*
      FROM predictions p
      WHERE p.verdict NOT IN ('NEUTRAL', 'HOLD')
        AND NOT EXISTS (SELECT 1 FROM accuracy_log a WHERE a.prediction_id = p.id)
        AND p.predicted_at < NOW() - INTERVAL '1 hour'
        AND p.predicted_at > NOW() - INTERVAL '7 days'
      ORDER BY p.predicted_at DESC
      LIMIT 100
    `);

    if (unresolved.rows.length === 0) {
      console.log('[Cron] No pending predictions to check.');
      return;
    }

    console.log(`[Cron] Found ${unresolved.rows.length} pending predictions.`);

    let hits = 0, misses = 0, errors = 0;
    const byUser = new Map();

    for (const pred of unresolved.rows) {
      try {
        const nseTicker = `${pred.ticker}.NS`;
        const quote = await pythonGet(`/market/quote?ticker=${encodeURIComponent(nseTicker)}`);

        if (!quote?.price) { errors++; continue; }

        const actualClose    = parseFloat(quote.price);
        const predictedPrice = pred.market_price_at_prediction
          ? parseFloat(pred.market_price_at_prediction)
          : null;

        const wasCorrect = determineCorrectness(pred.verdict, predictedPrice, actualClose);
        const changePct  = predictedPrice
          ? parseFloat(((actualClose - predictedPrice) / predictedPrice * 100).toFixed(2))
          : null;

        await pool.query(
          `INSERT INTO accuracy_log (prediction_id, actual_close_price, actual_change_pct, was_correct, notes)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [
            pred.id,
            actualClose,
            changePct,
            wasCorrect,
            `Post-market cron. Predicted: ₹${predictedPrice ?? 'N/A'}, Actual close: ₹${actualClose}`,
          ],
        );

        if (wasCorrect === true)  hits++;
        if (wasCorrect === false) misses++;

        // Track by user for notifications
        if (!byUser.has(pred.user_id)) byUser.set(pred.user_id, { hits: 0, misses: 0 });
        const u = byUser.get(pred.user_id);
        if (wasCorrect === true)  u.hits++;
        if (wasCorrect === false) u.misses++;

      } catch (e) {
        console.error(`[Cron] Error checking ${pred.ticker}:`, e.message);
        errors++;
      }
    }

    console.log(`[Cron] Accuracy check complete: ${hits} hits, ${misses} misses, ${errors} errors.`);

    // Send push notifications per user
    const total = hits + misses;
    if (total > 0) {
      const accuracyPct = total > 0 ? Math.round((hits / total) * 100) : 0;

      await broadcastToAllUsers({
        title: 'Billionaire AI — Market Close Update',
        body:  `${total} prediction${total !== 1 ? 's' : ''} resolved today. ${hits} hit, ${misses} miss. Accuracy: ${accuracyPct}%. Tap to review.`,
        icon:  '/favicon.ico',
        badge: '/favicon.ico',
        tag:   'accuracy-update',
        data:  { url: '/accuracy' },
      });
    }

  } catch (err) {
    console.error('[Cron] Post-market check failed:', err.message);
  }
}

// ─── Nifty alert check ────────────────────────────────────────────────────────
// Runs every 15 minutes Mon–Fri during market hours (9:15 AM – 3:30 PM IST)

let lastNiftyPrice = null;

async function checkNiftyAlert() {
  try {
    const indices = await pythonGet('/market/indices');
    if (!indices?.nifty50?.price) return;

    const currentPrice = parseFloat(indices.nifty50.price);

    if (lastNiftyPrice !== null) {
      const changePct = ((currentPrice - lastNiftyPrice) / lastNiftyPrice) * 100;

      if (Math.abs(changePct) >= 1.0) {
        const direction = changePct > 0 ? 'risen' : 'fallen';
        const emoji     = changePct > 0 ? '📈' : '📉';
        const signStr   = changePct > 0 ? '+' : '';

        await broadcastToAllUsers({
          title: `${emoji} Nifty 50 Alert`,
          body:  `Nifty 50 has ${direction} ${signStr}${changePct.toFixed(2)}% to ${currentPrice.toLocaleString('en-IN')}. Check the market.`,
          icon:  '/favicon.ico',
          badge: '/favicon.ico',
          tag:   'nifty-alert',
          data:  { url: '/' },
        });

        console.log(`[Cron] Nifty alert sent: ${signStr}${changePct.toFixed(2)}%`);
        lastNiftyPrice = currentPrice;
      }
    } else {
      lastNiftyPrice = currentPrice;
    }
  } catch (err) {
    console.error('[Cron] Nifty check error:', err.message);
  }
}

// ─── FII Alert ────────────────────────────────────────────────────────────────
// Runs once per day at 2:00 PM IST (8:30 UTC) — checks FII flow

async function checkFiiAlert() {
  try {
    const fiiData = await pythonGet('/nse/fii-dii');
    if (!fiiData?.fii_net) return;

    const fiiNet = parseFloat(fiiData.fii_net);

    if (Math.abs(fiiNet) >= 5000) {
      const direction = fiiNet > 0 ? 'net buying' : 'net selling';
      const emoji     = fiiNet > 0 ? '🟢' : '🔴';
      const absStr    = Math.abs(fiiNet).toLocaleString('en-IN');

      await broadcastToAllUsers({
        title: `${emoji} Large FII Activity`,
        body:  `FII showing unusually large ${direction}: ₹${absStr} Cr. This could move the market.`,
        icon:  '/favicon.ico',
        badge: '/favicon.ico',
        tag:   'fii-alert',
        data:  { url: '/' },
      });

      console.log(`[Cron] FII alert sent: ₹${fiiNet} Cr`);
    }
  } catch (err) {
    console.error('[Cron] FII check error:', err.message);
  }
}

// ─── Register all cron jobs ───────────────────────────────────────────────────

function startCronJobs() {
  // Post-market accuracy check: 4:30 PM IST = 11:00 UTC Mon–Fri
  cron.schedule('0 11 * * 1-5', () => {
    console.log('[Cron] Triggering post-market accuracy check (4:30 PM IST)...');
    runPostMarketCheck();
  }, { timezone: 'UTC' });

  // Nifty ±1% alert: every 15 minutes Mon–Fri 3:45–10:00 UTC (9:15–3:30 PM IST)
  cron.schedule('*/15 3-10 * * 1-5', () => {
    checkNiftyAlert();
  }, { timezone: 'UTC' });

  // FII large flow alert: once at 2:00 PM IST = 8:30 UTC Mon–Fri
  cron.schedule('30 8 * * 1-5', () => {
    console.log('[Cron] Checking FII flow for alert...');
    checkFiiAlert();
  }, { timezone: 'UTC' });

  console.log('[Cron] All market cron jobs scheduled.');
  console.log('[Cron]   - Post-market check: Mon–Fri 4:30 PM IST (11:00 UTC)');
  console.log('[Cron]   - Nifty alert:       Mon–Fri every 15 min during market hours');
  console.log('[Cron]   - FII alert:          Mon–Fri 2:00 PM IST (8:30 UTC)');
}

module.exports = { startCronJobs, runPostMarketCheck };
