/**
 * Events Routes — Phase 8
 *
 * GET  /api/events            — all upcoming market-moving events
 * POST /api/events/:id/analyze — AI pre-event streaming analysis
 */

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(requireAuth);

const PYTHON_URL  = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const NVIDIA_URL  = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_KEY  = process.env.NVIDIA_API_KEY;
const AI_MODEL    = 'meta/llama-3.3-70b-instruct';

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

function sseSetup(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
}

function sseSend(res, payload) {
  if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sseDone(res) {
  if (!res.writableEnded) {
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

// ─── Static event database ────────────────────────────────────────────────────

const STATIC_EVENTS = [
  // ── RBI MPC Meetings ──────────────────────────────────────────────────────
  { id: 'rbi-20250606', type: 'rbi', date: '2025-06-06', title: 'RBI MPC Meeting', description: 'Monetary Policy Committee decision. Current repo rate: 6.25%. Watch for rate action signal.', impact: 'HIGH' },
  { id: 'rbi-20250808', type: 'rbi', date: '2025-08-08', title: 'RBI MPC Meeting', description: 'Bi-monthly MPC review. Key focus: inflation trajectory, GDP growth, global risk.', impact: 'HIGH' },
  { id: 'rbi-20251010', type: 'rbi', date: '2025-10-10', title: 'RBI MPC Meeting', description: 'Pre-festive season MPC. Often sets tone for year-end market mood.', impact: 'HIGH' },
  { id: 'rbi-20251205', type: 'rbi', date: '2025-12-05', title: 'RBI MPC Meeting', description: 'Year-end MPC. Forward guidance for 2026 closely watched.', impact: 'HIGH' },
  { id: 'rbi-20260206', type: 'rbi', date: '2026-02-06', title: 'RBI MPC Meeting', description: 'Post-Budget MPC meeting. Rate outlook aligned with Union Budget fiscal stance.', impact: 'HIGH' },
  { id: 'rbi-20260407', type: 'rbi', date: '2026-04-07', title: 'RBI MPC Meeting', description: 'New fiscal year first MPC. Sets monetary direction for FY2026-27.', impact: 'HIGH' },
  { id: 'rbi-20260606', type: 'rbi', date: '2026-06-06', title: 'RBI MPC Meeting', description: 'Mid-year review. Q1 FY27 GDP and monsoon impact key factors.', impact: 'HIGH' },

  // ── US Federal Reserve FOMC ────────────────────────────────────────────────
  { id: 'fed-20250618', type: 'fed', date: '2025-06-18', title: 'US Fed FOMC Decision', description: 'Federal Reserve rate decision. Affects USD/INR and capital flows into India.', impact: 'HIGH' },
  { id: 'fed-20250730', type: 'fed', date: '2025-07-30', title: 'US Fed FOMC Decision', description: 'Fed policy meeting. Any cut signal would be bullish for emerging markets.', impact: 'HIGH' },
  { id: 'fed-20250917', type: 'fed', date: '2025-09-17', title: 'US Fed FOMC Decision', description: 'September FOMC — historically a key meeting for major policy pivots.', impact: 'HIGH' },
  { id: 'fed-20251105', type: 'fed', date: '2025-11-05', title: 'US Fed FOMC Decision', description: 'Post-election FOMC. Watch for shift in forward guidance.', impact: 'HIGH' },
  { id: 'fed-20251217', type: 'fed', date: '2025-12-17', title: 'US Fed FOMC Decision', description: 'Year-end FOMC. Final rate decision of 2025.', impact: 'HIGH' },
  { id: 'fed-20260128', type: 'fed', date: '2026-01-28', title: 'US Fed FOMC Decision', description: 'First FOMC of 2026. Full year rate guidance expected.', impact: 'HIGH' },
  { id: 'fed-20260318', type: 'fed', date: '2026-03-18', title: 'US Fed FOMC Decision', description: 'Q1 2026 FOMC. Inflation trajectory and jobs data key inputs.', impact: 'HIGH' },
  { id: 'fed-20260506', type: 'fed', date: '2026-05-06', title: 'US Fed FOMC Decision', description: 'May FOMC meeting. Mid-year assessment of the US economic cycle.', impact: 'HIGH' },

  // ── NSE/BSE Market Holidays ────────────────────────────────────────────────
  { id: 'holiday-20250815', type: 'holiday', date: '2025-08-15', title: 'Independence Day', description: 'NSE and BSE are closed. No trading in equity, derivatives, or currency segments.', impact: 'MEDIUM' },
  { id: 'holiday-20251002', type: 'holiday', date: '2025-10-02', title: 'Gandhi Jayanti', description: 'NSE/BSE market holiday. Mahatma Gandhi birthday.', impact: 'MEDIUM' },
  { id: 'holiday-20251020', type: 'holiday', date: '2025-10-20', title: 'Diwali — Muhurat Trading', description: 'Muhurat trading session on Diwali evening. Symbolic trading for auspicious start to Samvat new year.', impact: 'MEDIUM' },
  { id: 'holiday-20251021', type: 'holiday', date: '2025-10-21', title: 'Diwali Laxmi Pujan Holiday', description: 'NSE/BSE closed. Full holiday following Diwali.', impact: 'MEDIUM' },
  { id: 'holiday-20251107', type: 'holiday', date: '2025-11-07', title: 'Balipratipada Holiday', description: 'NSE/BSE closed for Diwali week.', impact: 'LOW' },
  { id: 'holiday-20251126', type: 'holiday', date: '2025-11-26', title: 'Gurunanak Jayanti', description: 'NSE/BSE market holiday.', impact: 'LOW' },
  { id: 'holiday-20260126', type: 'holiday', date: '2026-01-26', title: 'Republic Day', description: 'NSE/BSE closed. National holiday.', impact: 'MEDIUM' },
  { id: 'holiday-20260302', type: 'holiday', date: '2026-03-02', title: 'Mahashivratri', description: 'NSE/BSE market holiday.', impact: 'LOW' },
  { id: 'holiday-20260320', type: 'holiday', date: '2026-03-20', title: 'Holi', description: 'NSE/BSE closed. No trading sessions.', impact: 'LOW' },
  { id: 'holiday-20260402', type: 'holiday', date: '2026-04-02', title: 'Ram Navami', description: 'NSE/BSE market holiday.', impact: 'LOW' },
  { id: 'holiday-20260414', type: 'holiday', date: '2026-04-14', title: 'Dr. Ambedkar Jayanti / Good Friday', description: 'NSE/BSE closed across India.', impact: 'LOW' },
  { id: 'holiday-20260501', type: 'holiday', date: '2026-05-01', title: 'Maharashtra Day', description: 'NSE/BSE closed for Maharashtra Day.', impact: 'LOW' },

  // ── Union Budget ───────────────────────────────────────────────────────────
  { id: 'budget-20260201', type: 'budget', date: '2026-02-01', title: 'Union Budget 2026-27', description: 'Finance Minister presents the Annual Union Budget. Tax policy, capex plans, and sectoral allocations drive significant volatility. One of the most market-moving events of the year.', impact: 'CRITICAL' },

  // ── F&O Monthly Expiry ─────────────────────────────────────────────────────
  { id: 'expiry-20250626', type: 'expiry', date: '2025-06-26', title: 'Monthly F&O Expiry (June)', description: 'Nifty and BankNifty June series expiry. Expect higher volatility and short-covering near 3:30 PM.', impact: 'MEDIUM' },
  { id: 'expiry-20250731', type: 'expiry', date: '2025-07-31', title: 'Monthly F&O Expiry (July)', description: 'July series F&O expiry. Index OI unwinding session.', impact: 'MEDIUM' },
  { id: 'expiry-20250828', type: 'expiry', date: '2025-08-28', title: 'Monthly F&O Expiry (August)', description: 'August series expiry day. Pre-expiry volatility typically picks up from previous week.', impact: 'MEDIUM' },
  { id: 'expiry-20250925', type: 'expiry', date: '2025-09-25', title: 'Monthly F&O Expiry (September)', description: 'September quarter-end expiry. Often coincides with FII rebalancing.', impact: 'HIGH' },
  { id: 'expiry-20251030', type: 'expiry', date: '2025-10-30', title: 'Monthly F&O Expiry (October)', description: 'October expiry — mid-festive season. Diwali mood can influence direction.', impact: 'MEDIUM' },
  { id: 'expiry-20251127', type: 'expiry', date: '2025-11-27', title: 'Monthly F&O Expiry (November)', description: 'November series expiry day.', impact: 'MEDIUM' },
  { id: 'expiry-20251224', type: 'expiry', date: '2025-12-24', title: 'Monthly F&O Expiry + Quarter-End (December)', description: 'December quarter-end expiry. Year-end portfolio rebalancing by FIIs and DIIs.', impact: 'HIGH' },
  { id: 'expiry-20260129', type: 'expiry', date: '2026-01-29', title: 'Monthly F&O Expiry (January)', description: 'January series expiry. Q3 results season typically running.', impact: 'MEDIUM' },
  { id: 'expiry-20260226', type: 'expiry', date: '2026-02-26', title: 'Monthly F&O Expiry (February)', description: 'Post-Budget February expiry. Budget-driven positions get unwound.', impact: 'MEDIUM' },
  { id: 'expiry-20260326', type: 'expiry', date: '2026-03-26', title: 'Monthly F&O Expiry + FY Quarter-End (March)', description: 'Financial year-end expiry. Highest FII/DII rebalancing pressure of the year.', impact: 'HIGH' },
  { id: 'expiry-20260430', type: 'expiry', date: '2026-04-30', title: 'Monthly F&O Expiry (April)', description: 'New financial year first expiry. Q4 results season earnings surprises drive direction.', impact: 'MEDIUM' },
  { id: 'expiry-20260528', type: 'expiry', date: '2026-05-28', title: 'Monthly F&O Expiry (May)', description: 'May series expiry. Summer earnings season winds down.', impact: 'MEDIUM' },
];

const EVENT_TYPE_LABELS = {
  rbi:      'RBI MPC',
  fed:      'US Fed',
  holiday:  'Market Holiday',
  budget:   'Union Budget',
  expiry:   'F&O Expiry',
  earnings: 'Earnings',
};

// ─── GET /api/events ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { from, to, type } = req.query;

    const fromDate = from ? new Date(from) : new Date();
    fromDate.setHours(0, 0, 0, 0);
    const toDate = to ? new Date(to) : (() => {
      const d = new Date(); d.setDate(d.getDate() + 90); return d;
    })();

    let events = STATIC_EVENTS.filter(e => {
      const d = new Date(e.date);
      return d >= fromDate && d <= toDate && (!type || e.type === type);
    });

    // Try to add earnings events from Python
    try {
      const earnings = await pythonGet('/market/upcoming-earnings');
      if (earnings?.events && Array.isArray(earnings.events)) {
        const earningEvents = earnings.events
          .filter(e => {
            const d = new Date(e.date);
            return d >= fromDate && d <= toDate && (!type || type === 'earnings');
          })
          .map(e => ({
            id:          `earnings-${e.ticker}-${(e.date || '').replace(/-/g, '')}`,
            type:        'earnings',
            date:        e.date,
            ticker:      e.ticker,
            title:       `${e.company || e.ticker} — Quarterly Results`,
            description: `${e.company || e.ticker} (${e.ticker}) quarterly earnings announcement.${e.eps_estimate ? ` EPS estimate: ${e.eps_estimate}.` : ''}`,
            impact:      'HIGH',
          }));
        events = [...events, ...earningEvents];
      }
    } catch { /* earnings fetch failed — proceed with static events */ }

    events.sort((a, b) => new Date(a.date) - new Date(b.date));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const withMeta = events.map(e => ({
      ...e,
      type_label:  EVENT_TYPE_LABELS[e.type] || e.type,
      days_until:  Math.round((new Date(e.date) - today) / (1000 * 60 * 60 * 24)),
    }));

    res.json({ events: withMeta, total: withMeta.length });
  } catch (err) {
    console.error('[Events] GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch events.' });
  }
});

// ─── POST /api/events/:id/analyze — AI streaming pre-event analysis ───────────
router.post('/:id/analyze', async (req, res) => {
  const { id } = req.params;
  const event   = STATIC_EVENTS.find(e => e.id === id) || req.body.event;

  if (!event) return res.status(404).json({ error: 'Event not found.' });

  sseSetup(res);
  sseSend(res, { meta: 'fetching' });

  // Fetch macro context in parallel
  let macroCtx = '';
  try {
    const [forex, commodities] = await Promise.allSettled([
      pythonGet('/macro/forex'),
      pythonGet('/macro/commodities'),
    ]);
    const fx   = forex.status === 'fulfilled' ? forex.value : null;
    const cmds = commodities.status === 'fulfilled' ? commodities.value : null;
    const usdInr = fx?.usd_inr?.rate     ? `USD/INR: ₹${Number(fx.usd_inr.rate).toFixed(2)}` : '';
    const crude  = cmds?.crude_oil_brent?.price ? `Brent Crude: $${Number(cmds.crude_oil_brent.price).toFixed(2)}/bbl` : '';
    macroCtx = [usdInr, crude].filter(Boolean).join(' | ');
  } catch { /* non-fatal */ }

  if (!NVIDIA_KEY) {
    sseSend(res, { error: 'NVIDIA_API_KEY is not configured.' });
    sseDone(res);
    return;
  }

  const eventDate = new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const daysUntil = Math.round((new Date(event.date) - new Date()) / (1000 * 60 * 60 * 24));
  const timeframe = daysUntil <= 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;

  const SYSTEM = `You are Billionaire AI — a senior Indian market analyst. Speak like a professional trader. Calm. Precise. Data-backed. No hype. Never use filler phrases. Do not start with "I". Short sentences. Every claim backed by data.`;

  const prompt = `Upcoming market event: ${event.title}
Date: ${eventDate} (${timeframe})
Type: ${EVENT_TYPE_LABELS[event.type] || event.type}
Impact: ${event.impact}
Context: ${event.description}
${event.ticker ? `Stock: ${event.ticker}` : ''}
${macroCtx ? `Macro context: ${macroCtx}` : ''}

Write a professional pre-event analysis covering:
1. What this event means for Indian markets
2. Historical precedent — what typically happens before/after this event type
3. Specific sectors and stocks to watch (with tickers)
4. Key Nifty/BankNifty levels if relevant
5. Your outlook — bullish or cautious, with clear reasoning
6. Risk management guidance around this event

Keep it 300–400 words. Trader language. No waffle.`;

  sseSend(res, { meta: 'stream_start' });

  try {
    const response = await fetch(`${NVIDIA_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NVIDIA_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model:       AI_MODEL,
        messages:    [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
        stream:      true,
        max_tokens:  700,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      sseSend(res, { error: `AI service error (${response.status}). Please try again.` });
      sseDone(res);
      return;
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') { sseDone(res); return; }
        try {
          const parsed = JSON.parse(data);
          const token  = parsed.choices?.[0]?.delta?.content;
          if (token) sseSend(res, { token });
          if (parsed.choices?.[0]?.finish_reason === 'stop') { sseDone(res); return; }
        } catch { /* skip */ }
      }
    }
  } catch (err) {
    console.error('[Events] AI error:', err.message);
    sseSend(res, { error: 'Analysis failed. Please try again.' });
  } finally {
    sseDone(res);
  }
});

module.exports = router;
