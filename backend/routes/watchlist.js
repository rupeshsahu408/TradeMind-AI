/**
 * Watchlist Routes — Phase 7
 *
 * GET    /api/watchlist         — fetch user's watchlist with live prices + sentiment
 * POST   /api/watchlist         — add a stock to watchlist
 * DELETE /api/watchlist/:id     — remove stock from watchlist
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

// ─── GET /api/watchlist ───────────────────────────────────────────────────────
// Returns all watchlist items, enriched with live price and news sentiment.

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, ticker, company_name, added_at FROM watchlist WHERE user_id = $1 ORDER BY added_at DESC',
      [req.userId],
    );

    if (result.rows.length === 0) {
      return res.json({ watchlist: [] });
    }

    // Fetch live prices + sentiment for all tickers in parallel
    const enriched = await Promise.allSettled(
      result.rows.map(async (item) => {
        const nseTicker = item.ticker.includes('.') ? item.ticker : `${item.ticker}.NS`;
        const sym = item.ticker.replace(/\.(NS|BO)$/i, '');

        // Fetch quote and news in parallel
        const [quoteRes, newsRes] = await Promise.allSettled([
          pythonGet(`/market/quote?ticker=${encodeURIComponent(nseTicker)}`),
          pythonGet(`/news/search?q=${encodeURIComponent(item.company_name || sym)}&hours=24&tag=true&limit=6`),
        ]);

        const quote = quoteRes.status === 'fulfilled' ? quoteRes.value : null;
        const news  = newsRes.status === 'fulfilled'  ? newsRes.value  : null;

        // Compute net sentiment from news
        let sentiment_pulse = 'NEUTRAL';
        if (news?.articles?.length > 0) {
          const pos = news.articles.filter(a => a.sentiment === 'POSITIVE').length;
          const neg = news.articles.filter(a => a.sentiment === 'NEGATIVE').length;
          const total = news.articles.length;
          if (pos / total >= 0.55) sentiment_pulse = 'POSITIVE';
          else if (neg / total >= 0.55) sentiment_pulse = 'NEGATIVE';
        }

        return {
          id:             item.id,
          ticker:         sym,
          company_name:   item.company_name || quote?.company || sym,
          added_at:       item.added_at,
          // Live price data
          price:          quote?.price          ?? null,
          change:         quote?.change         ?? null,
          change_pct:     quote?.change_pct     ?? null,
          day_high:       quote?.day_high        ?? null,
          day_low:        quote?.day_low         ?? null,
          week_52_high:   quote?.week_52_high    ?? null,
          week_52_low:    quote?.week_52_low     ?? null,
          volume:         quote?.volume          ?? null,
          market_cap:     quote?.market_cap      ?? null,
          prev_close:     quote?.prev_close      ?? null,
          // Sentiment
          sentiment_pulse,
          news_count:     news?.total ?? 0,
        };
      }),
    );

    const watchlist = enriched.map((r, i) =>
      r.status === 'fulfilled' ? r.value : {
        ...result.rows[i],
        ticker: result.rows[i].ticker.replace(/\.(NS|BO)$/i, ''),
        price: null, change_pct: null, sentiment_pulse: 'NEUTRAL',
      }
    );

    res.json({ watchlist });
  } catch (err) {
    console.error('[Watchlist] GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch watchlist.' });
  }
});

// ─── POST /api/watchlist ──────────────────────────────────────────────────────
// Add a stock. Validates ticker against live price, rejects if not found.

router.post('/', async (req, res) => {
  try {
    const { ticker } = req.body;
    if (!ticker?.trim()) {
      return res.status(400).json({ error: 'Ticker symbol is required.' });
    }

    const sym       = ticker.trim().toUpperCase().replace(/\.(NS|BO)$/i, '');
    const nseTicker = `${sym}.NS`;

    // Check duplicate
    const dup = await pool.query(
      "SELECT id FROM watchlist WHERE user_id = $1 AND ticker = $2",
      [req.userId, sym],
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: `${sym} is already in your watchlist.` });
    }

    // Validate ticker — must return a real price
    const quote = await pythonGet(`/market/quote?ticker=${encodeURIComponent(nseTicker)}`);
    if (!quote?.price || quote.price <= 0) {
      // Try BSE if NSE not found
      const bseQuote = await pythonGet(`/market/quote?ticker=${encodeURIComponent(sym + '.BO')}`);
      if (!bseQuote?.price || bseQuote.price <= 0) {
        return res.status(404).json({
          error: `Ticker "${sym}" not found on NSE or BSE. Check the symbol and try again.`,
        });
      }
    }

    const company_name = quote?.company || sym;

    // Insert into DB
    const insertResult = await pool.query(
      'INSERT INTO watchlist (user_id, ticker, company_name) VALUES ($1, $2, $3) RETURNING id, added_at',
      [req.userId, sym, company_name],
    );

    const row = insertResult.rows[0];
    console.log(`[Watchlist] Added ${sym} for user ${req.userId}`);

    res.json({
      success: true,
      item: {
        id:           row.id,
        ticker:       sym,
        company_name: company_name,
        added_at:     row.added_at,
        price:        quote?.price        ?? null,
        change_pct:   quote?.change_pct   ?? null,
        sentiment_pulse: 'NEUTRAL',
      },
    });
  } catch (err) {
    console.error('[Watchlist] POST error:', err.message);
    res.status(500).json({ error: 'Failed to add stock to watchlist.' });
  }
});

// ─── DELETE /api/watchlist/:id ────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid watchlist item ID.' });
    }

    const result = await pool.query(
      'DELETE FROM watchlist WHERE id = $1 AND user_id = $2 RETURNING id, ticker',
      [parseInt(id), req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Watchlist item not found.' });
    }

    console.log(`[Watchlist] Removed ${result.rows[0].ticker} for user ${req.userId}`);
    res.json({ success: true, removed: result.rows[0].ticker });
  } catch (err) {
    console.error('[Watchlist] DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to remove stock from watchlist.' });
  }
});

module.exports = router;
