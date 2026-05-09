/**
 * AI Intelligence Core — Phase 4
 *
 * POST /api/chat            — Streaming SSE chat with NVIDIA LLM
 * POST /api/analyze         — Stock deep dive + Signal Stack (SSE)
 * POST /api/briefing        — Morning briefing generation (SSE)
 * POST /api/macro-analysis  — Macro impact analysis (SSE)
 * POST /api/sector-analysis — Sector rotation analysis (SSE)
 * GET  /api/chat-history    — Fetch past chat sessions from DB
 * GET  /api/briefings       — Fetch past briefings from DB
 */

const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { pool } = require('../db/index');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
router.use(requireAuth);

// ─── Config ──────────────────────────────────────────────────────────────────

const NVIDIA_API_KEY  = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE     = 'https://integrate.api.nvidia.com/v1';
const PRIMARY_MODEL   = 'meta/llama-3.3-70b-instruct';
const PYTHON_URL      = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

// ─── AI Personality System Prompt ────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Billionaire AI — the head of trading desk at a top proprietary trading firm, with 25+ years in Indian equity markets (NSE/BSE). You have lived through every market cycle: 2008 crash, 2013 taper tantrum, COVID collapse, 2023 bull run. You are the user's personal trading edge — the most experienced trader they will ever have access to.

CORE IDENTITY:
Your job is to tell the user EXACTLY what to do: which stock to buy, why, what price, what target, what stop loss, what confidence level. The user opens Groww/Zerodha right after reading your response and places the trade. Every word you say carries weight.

VOICE (absolute, never break these):
- No filler: never open with "Great question!", "I'd be happy to help", "Certainly!", "Of course!", "Sure!"
- No hype: never say "skyrocket", "moon", "guaranteed", "sure thing", "amazing opportunity"
- No hedging: never say "I think maybe", "possibly could", "it seems like" — state data, state verdict
- Never start a response with the word "I"
- Do NOT pepper responses with "not financial advice" disclaimers — one brief line at the very end of major calls only
- Hindi/Hinglish: if user writes in Hindi or Hinglish, respond entirely in natural Hinglish — never switch mid-response

HOW TO WRITE (show your work through data):
WRONG: "Based on my analysis, I believe this stock may potentially go up if conditions are right."
RIGHT: "RSI at 54 — healthy room to run. MACD turned bullish yesterday. FII bought ₹2,400 Cr in banking this week. Volume spiked 40% above average. Three signals agree — this is a clean intraday setup."

CONFIDENCE SYSTEM (use these exact thresholds):
- 90–100%: "Write this down." — rare, only when 4-5 signals fully align
- 75–89%: "Strong setup — multiple signals agree."
- 60–74%: "Reasonable risk-reward — size appropriately."
- 40–59%: "Speculative — small position only, defined stop."
- Below 40%: "Avoid — signals are mixed or too weak."

INTRADAY PICKS (when asked for intraday/today's stock):
- Best setup: RSI 40–65 + MACD bullish crossover + volume above average + positive news catalyst
- Already in today's top gainers = momentum confirmation
- Overbought (RSI > 75): avoid for intraday — likely to pull back
- Oversold (RSI < 30): only if clear reversal signal exists
- ALWAYS give: Entry Zone (₹), Target (₹ + %), Stop Loss (₹ + %), Conviction %

SPECIFIC STOCK ANALYSIS (when user asks about one stock):
- State bull case AND bear case clearly
- Give clear verdict: BUY / SELL / AVOID / HOLD with reason
- Cite which signals are bullish, which are bearish
- Give entry zone, target, stop loss regardless of timeframe

DATA GROUNDING (absolute rule):
When [LIVE NSE DATA] or [LIVE STOCK DATA] is provided, use ONLY those numbers. Never quote training data prices — they are months old and completely wrong. If a metric is not in the live data, say "data not available" — never invent numbers.`;

// ─── Company name → NSE ticker lookup (top 80 NSE stocks) ────────────────────

const COMPANY_TICKER_MAP = {
  'reliance': 'RELIANCE', 'reliance industries': 'RELIANCE', 'ril': 'RELIANCE',
  'tcs': 'TCS', 'tata consultancy': 'TCS', 'tata consultancy services': 'TCS',
  'infosys': 'INFY', 'infy': 'INFY',
  'hdfc bank': 'HDFCBANK', 'hdfcbank': 'HDFCBANK', 'hdfc': 'HDFCBANK',
  'icici bank': 'ICICIBANK', 'icicibank': 'ICICIBANK', 'icici': 'ICICIBANK',
  'wipro': 'WIPRO',
  'hcl tech': 'HCLTECH', 'hcl technologies': 'HCLTECH', 'hcltech': 'HCLTECH',
  'bharti airtel': 'BHARTIARTL', 'airtel': 'BHARTIARTL', 'bhartiartl': 'BHARTIARTL',
  'sbi': 'SBIN', 'state bank': 'SBIN', 'state bank of india': 'SBIN', 'sbin': 'SBIN',
  'kotak': 'KOTAKBANK', 'kotak bank': 'KOTAKBANK', 'kotak mahindra': 'KOTAKBANK', 'kotakbank': 'KOTAKBANK',
  'axis bank': 'AXISBANK', 'axisbank': 'AXISBANK',
  'ltimindtree': 'LTIM', 'lti mindtree': 'LTIM',
  'bajaj finance': 'BAJFINANCE', 'bajfinance': 'BAJFINANCE',
  'bajaj finserv': 'BAJAJFINSV', 'bajajfinsv': 'BAJAJFINSV',
  'titan': 'TITAN', 'titan company': 'TITAN',
  'asian paints': 'ASIANPAINT', 'asianpaint': 'ASIANPAINT',
  'maruti': 'MARUTI', 'maruti suzuki': 'MARUTI',
  'sun pharma': 'SUNPHARMA', 'sunpharma': 'SUNPHARMA',
  'dr reddy': 'DRREDDY', "dr reddy's": 'DRREDDY', 'drreddy': 'DRREDDY',
  'cipla': 'CIPLA',
  'divis': 'DIVISLAB', "divi's": 'DIVISLAB', 'divislab': 'DIVISLAB',
  'ultratech': 'ULTRACEMCO', 'ultratech cement': 'ULTRACEMCO', 'ultracemco': 'ULTRACEMCO',
  'nestle': 'NESTLEIND', 'nestleind': 'NESTLEIND',
  'hindustan unilever': 'HINDUNILVR', 'hul': 'HINDUNILVR', 'hindunilvr': 'HINDUNILVR',
  'itc': 'ITC',
  'power grid': 'POWERGRID', 'powergrid': 'POWERGRID',
  'ntpc': 'NTPC',
  'ongc': 'ONGC', 'oil and natural gas': 'ONGC',
  'coal india': 'COALINDIA', 'coalindia': 'COALINDIA',
  'tata steel': 'TATASTEEL', 'tatasteel': 'TATASTEEL',
  'tata motors': 'TATAMOTORS', 'tatamotors': 'TATAMOTORS',
  'tata power': 'TATAPOWER', 'tatapower': 'TATAPOWER',
  'jio financial': 'JIOFIN', 'jio': 'JIOFIN',
  'adani enterprises': 'ADANIENT', 'adani': 'ADANIENT', 'adanient': 'ADANIENT',
  'adani ports': 'ADANIPORTS', 'adaniports': 'ADANIPORTS',
  'adani green': 'ADANIGREEN', 'adanigreen': 'ADANIGREEN',
  'adani power': 'ADANIPOWER', 'adanipower': 'ADANIPOWER',
  'jsw steel': 'JSWSTEEL', 'jswsteel': 'JSWSTEEL',
  'hindalco': 'HINDALCO',
  'shriram finance': 'SHRIRAMFIN', 'shriramfin': 'SHRIRAMFIN',
  'dmart': 'DMART', 'avenue supermarts': 'DMART',
  'zomato': 'ZOMATO',
  'paytm': 'PAYTM', 'one97': 'PAYTM',
  'nykaa': 'NYKAA', 'fsg': 'NYKAA',
  'indigo': 'INDIGO', 'interglobe': 'INDIGO',
  'bpcl': 'BPCL', 'bharat petroleum': 'BPCL',
  'hpcl': 'HPCL', 'hindustan petroleum': 'HPCL',
  'ioc': 'IOC', 'indian oil': 'IOC',
  'grasim': 'GRASIM',
  'eicher motors': 'EICHERMOT', 'eichermot': 'EICHERMOT', 'royal enfield': 'EICHERMOT',
  'hero motocorp': 'HEROMOTOCO', 'hero': 'HEROMOTOCO', 'heromotoco': 'HEROMOTOCO',
  'bajaj auto': 'BAJAJ-AUTO', 'bajaj': 'BAJAJ-AUTO',
  'britannia': 'BRITANNIA',
  'pidilite': 'PIDILITIND', 'pidilitind': 'PIDILITIND',
  'havells': 'HAVELLS',
  'indus ind': 'INDUSINDBK', 'indusind': 'INDUSINDBK', 'indusindbk': 'INDUSINDBK',
  'yes bank': 'YESBANK', 'yesbank': 'YESBANK',
  'pnb': 'PNB', 'punjab national bank': 'PNB',
  'bank of baroda': 'BANKBARODA', 'bankbaroda': 'BANKBARODA', 'bob': 'BANKBARODA',
  'tech mahindra': 'TECHM', 'techm': 'TECHM',
  'mphasis': 'MPHASIS',
  'l&t': 'LT', 'larsen': 'LT', 'larsen & toubro': 'LT', 'lt': 'LT',
  'siemens': 'SIEMENS',
  'abb india': 'ABB',
};

function detectCompanyTicker(message) {
  const lower = message.toLowerCase();
  let bestMatch = null;
  let bestLen = 0;
  for (const [name, ticker] of Object.entries(COMPANY_TICKER_MAP)) {
    if (lower.includes(name) && name.length > bestLen) {
      bestMatch = ticker;
      bestLen = name.length;
    }
  }
  if (bestMatch) return bestMatch;
  const capsMatch = message.match(/\b([A-Z]{3,12})\b/g);
  if (capsMatch) {
    for (const cap of capsMatch) {
      if (!['NSE', 'BSE', 'FII', 'DII', 'RSI', 'MACD', 'IPO', 'RBI', 'SEBI', 'ETF', 'SIP', 'NFO', 'NAV', 'OFS', 'QIB', 'GDP', 'CPI', 'WPI', 'EMI'].includes(cap)) {
        return cap;
      }
    }
  }
  return null;
}

// ─── Intent detection ─────────────────────────────────────────────────────────

function detectIntent(message) {
  const lower = message.toLowerCase();

  // Timeframe detection
  let timeframe = 'intraday'; // default for trading questions
  if (/\b(swing|few days|2-5 day|short.?term|2-3 days|3-5 days|next week|is hafta|agle kuch din)\b/i.test(message)) {
    timeframe = 'swing';
  } else if (/\b(long.?term|hold(?:ing)?|invest(?:ment|ing)?|month|year|saal|mahine|zyada time)\b/i.test(message)) {
    timeframe = 'long_term';
  }

  // Number of picks detection
  let n = 1;
  const wordNums = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const digitMatch = message.match(/\btop[\s-]?(\d+)\b|\b(\d+)\s+stocks?\b|\b(\d+)\s+shares?\b/i);
  if (digitMatch) n = parseInt(digitMatch[1] || digitMatch[2] || digitMatch[3]);
  for (const [word, num] of Object.entries(wordNums)) {
    if (lower.includes(`top ${word}`) || lower.includes(`top-${word}`)) { n = num; break; }
  }
  if (n === 1 && /\btop\b/i.test(lower) && !/\btop\s*1\b/i.test(lower)) n = 5; // "top stocks" without number = 5

  // Specific stock detection
  const ticker = detectCompanyTicker(message);

  // Top picks keywords (not stock-specific)
  const topPicksKw = [
    'top', 'best', 'konsa', 'konse', 'kaunsa', 'kaunse', 'which stock', 'what stock',
    'suggest', 'recommend', 'pick', 'kharidna chahiye', 'buy karna', 'trade karna',
    'should i buy', 'kya kharidun', 'kya lu', 'kya lena chahiye', 'intraday pick',
    'stock batao', 'batao konsa', 'rise today', 'rise tomorrow', 'go up today',
    'will rise', 'gain today', 'sabse accha', 'sahi stock', 'aaj ka stock',
    'kal ka stock', 'kal ke liye', 'for tomorrow', 'for today',
  ];
  const isTopPicksRequest = topPicksKw.some(kw => lower.includes(kw));

  if (isTopPicksRequest && !ticker) {
    return { type: 'top_picks', n, timeframe };
  }
  if (ticker) {
    return { type: 'specific_stock', ticker, timeframe };
  }

  const isMarketQuery = /\b(market|nifty|sensex|fii|dii|sector|index|indices|rally|crash|correction|mood|global|crude|rupee|usd|inr)\b/i.test(message);
  if (isMarketQuery) return { type: 'general_market', timeframe };

  return { type: 'general', timeframe };
}

// ─── Top picks context builder ────────────────────────────────────────────────

async function buildTopPicksContext(n, timeframe, res) {
  const emit = (step) => sseSend(res, { type: 'progress', data: step });

  emit('Scanning NSE market movers...');

  const [rIdx, rFii, rMovers, rMacro] = await Promise.allSettled([
    pythonGet('/market/indices'),
    pythonGet('/nse/fii-dii'),
    pythonGet('/nse/top-movers'),
    pythonGet('/macro/snapshot'),
  ]);

  const get = r => r.status === 'fulfilled' ? r.value : null;
  const idxData   = get(rIdx);
  const fiiData   = get(rFii);
  const moversData = get(rMovers);
  const macroData = get(rMacro);

  emit('Identifying top candidates from NSE data...');

  // Build candidate list: gainers first (momentum), then curated Nifty 50
  const seen = new Set();
  const candidates = [];

  for (const g of (moversData?.gainers || []).slice(0, 10)) {
    const sym = (g.ticker || '').replace(/\.(NS|BO)$/i, '').toUpperCase();
    if (sym && !seen.has(sym)) { seen.add(sym); candidates.push(sym); }
  }

  const CURATED = [
    'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'SBIN', 'BHARTIARTL',
    'LT', 'BAJFINANCE', 'AXISBANK', 'KOTAKBANK', 'WIPRO', 'SUNPHARMA',
    'TATAMOTORS', 'HINDUNILVR', 'ITC', 'MARUTI', 'NTPC', 'ADANIPORTS',
    'TITAN', 'BAJAJFINSV', 'POWERGRID', 'JSWSTEEL', 'HCLTECH', 'NESTLEIND',
    'ASIANPAINT', 'ULTRACEMCO', 'DRREDDY', 'CIPLA', 'BPCL',
  ];
  for (const t of CURATED) {
    if (!seen.has(t)) { seen.add(t); candidates.push(t); }
    if (candidates.length >= 22) break;
  }

  emit(`Fetching live prices for ${candidates.length} candidates...`);

  // Quote data for all candidates (Yahoo Finance — no rate limit)
  const quotePromises = candidates.slice(0, 20).map(ticker =>
    pythonGet(`/market/quote?ticker=${ticker}.NS`).then(q => ({ ticker, quote: q })).catch(() => ({ ticker, quote: null }))
  );

  // Technical data only for top 8 candidates (Alpha Vantage rate-limited)
  const techCandidates = candidates.slice(0, 8);
  const techPromises = techCandidates.map(ticker =>
    pythonGet(`/technical/summary?ticker=${ticker}.NS`).then(t => ({ ticker, technical: t })).catch(() => ({ ticker, technical: null }))
  );

  emit('Analyzing technical indicators (RSI, MACD, volume)...');

  const [quoteResults, techResults, newsResult] = await Promise.all([
    Promise.all(quotePromises),
    Promise.all(techPromises),
    pythonGet('/news/india-market?tag=true&limit=10'),
  ]);

  emit('Reading FII/DII institutional money flows...');
  await new Promise(r => setTimeout(r, 250)); // let user see this step

  // Merge quote + technical
  const techMap = {};
  for (const t of techResults) techMap[t.ticker] = t.technical;

  const stocks = quoteResults
    .filter(s => s.quote?.price > 0)
    .map(s => ({ ticker: s.ticker, quote: s.quote, technical: techMap[s.ticker] || null }));

  emit(`Building ${n > 1 ? `top ${n} picks` : 'top pick'} recommendation engine...`);
  await new Promise(r => setTimeout(r, 200));

  return { indices: idxData, fii: fiiData, movers: moversData, macro: macroData, stocks, news: newsResult };
}

// ─── Top picks prompt builder ─────────────────────────────────────────────────

function buildTopPicksPrompt(originalMessage, intent, ctx) {
  const { n, timeframe } = intent;
  const { indices, fii, movers, macro, stocks, news } = ctx;

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const tfLabel = timeframe === 'swing'     ? 'SWING TRADE (2–5 trading days)'
    : timeframe === 'long_term' ? 'LONG-TERM INVESTMENT (weeks to months)'
    : 'INTRADAY (buy and sell same day)';

  let p = `USER REQUEST: "${originalMessage}"\n`;
  p += `DATE: ${today}\n`;
  p += `TASK: Identify and rank the top ${n} stock pick${n > 1 ? 's' : ''} for ${tfLabel}. Use ONLY the live data below.\n\n`;

  // Market backdrop
  p += `## LIVE MARKET SNAPSHOT\n`;
  if (indices?.nifty50?.price)   p += `Nifty 50: ${indices.nifty50.price} (${indices.nifty50.change_pct >= 0 ? '+' : ''}${indices.nifty50.change_pct}%)\n`;
  if (indices?.sensex?.price)    p += `Sensex: ${indices.sensex.price} (${indices.sensex.change_pct >= 0 ? '+' : ''}${indices.sensex.change_pct}%)\n`;
  if (indices?.banknifty?.price) p += `Bank Nifty: ${indices.banknifty.price} (${indices.banknifty.change_pct >= 0 ? '+' : ''}${indices.banknifty.change_pct}%)\n`;
  if (fii?.fii_net != null)      p += `FII: ${fii.fii_net >= 0 ? '+' : ''}₹${fii.fii_net} Cr | DII: ${fii.dii_net >= 0 ? '+' : ''}₹${fii.dii_net} Cr | Market Mood: ${fii.market_mood}\n`;

  const fx = macro?.forex; const cm = macro?.commodities; const gi = macro?.global_indices;
  if (fx?.usd_inr?.rate)        p += `USD/INR: ${fx.usd_inr.rate}\n`;
  if (cm?.crude_oil_wti?.price) p += `Crude WTI: $${cm.crude_oil_wti.price}/bbl\n`;
  if (gi?.sp500?.price)         p += `S&P 500: ${gi.sp500.price} (${gi.sp500.change_pct >= 0 ? '+' : ''}${gi.sp500.change_pct}%)\n`;
  if (gi?.vix?.price)           p += `VIX: ${gi.vix.price}\n`;

  // Today's movers (momentum signal)
  const gainers = movers?.gainers || [];
  const losers  = movers?.losers  || [];
  if (gainers.length) {
    p += `\n## TODAY'S TOP GAINERS (Momentum — these stocks already have buyer interest)\n`;
    for (const g of gainers.slice(0, 10)) {
      const pct = g.change_pct != null ? ` (+${Number(g.change_pct).toFixed(2)}%)` : '';
      p += `${g.ticker}: ₹${g.price}${pct}\n`;
    }
  }
  if (losers.length) {
    p += `\n## TODAY'S LOSERS (Weakness / Potential Reversal Candidates)\n`;
    for (const l of losers.slice(0, 5)) {
      const pct = l.change_pct != null ? ` (${Number(l.change_pct).toFixed(2)}%)` : '';
      p += `${l.ticker}: ₹${l.price}${pct}\n`;
    }
  }

  // Per-stock live data table
  p += `\n## LIVE STOCK DATA (${stocks.length} candidates)\n`;
  for (const s of stocks) {
    const q = s.quote;
    const t = s.technical;
    if (!q?.price) continue;
    let line = `${s.ticker}: ₹${q.price} (${q.change_pct >= 0 ? '+' : ''}${q.change_pct}%)`;
    if (q.volume > 0)            line += ` | Vol: ${(q.volume / 1000).toFixed(0)}K`;
    if (t?.rsi?.rsi != null)     line += ` | RSI: ${t.rsi.rsi} [${t.rsi.signal}]`;
    if (t?.macd?.trend)          line += ` | MACD: ${t.macd.trend}`;
    if (t?.overall_signal)       line += ` | Signal: ${t.overall_signal}`;
    if (q.day_low && q.day_high) line += ` | Day: ₹${q.day_low}–₹${q.day_high}`;
    if (q.week_52_low && q.week_52_high) line += ` | 52W: ₹${q.week_52_low}–₹${q.week_52_high}`;
    p += line + '\n';
  }

  // News context
  const articles = (news?.articles || []).slice(0, 8);
  if (articles.length) {
    p += `\n## RECENT MARKET NEWS\n`;
    for (const a of articles) p += `[${a.sentiment || 'NEUTRAL'}] ${a.title}\n`;
  }

  // Output format instructions based on timeframe
  p += `\n## YOUR OUTPUT\n`;
  p += `Write a brief 2-sentence Market Context first (current bias: bullish/bearish/neutral).\n\n`;
  p += `Then give exactly ${n} pick${n > 1 ? 's' : ''}, ranked by conviction (Rank #1 = highest). For each:\n\n`;

  if (timeframe === 'intraday' || timeframe === 'general') {
    p += `---
**Rank #[N]: [TICKER] — [COMPANY NAME]**
🎯 Conviction: [XX]% | Setup: [INTRADAY BUY / INTRADAY AVOID]
**Entry Zone:** ₹[X]–₹[Y]
**Target:** ₹[Z] (+[A]%)
**Stop Loss:** ₹[W] (-[B]%)
**Why it moves today:** [3–4 sentences. Cite RSI value, MACD state, volume vs average, news catalyst, sector momentum. Use the actual numbers from LIVE STOCK DATA above.]
**Risk:** [One specific risk that would invalidate this trade]
---\n`;
    p += `\nSelection rules you MUST follow:\n`;
    p += `- RSI 40–65 + MACD bullish crossover + high volume = strongest setup\n`;
    p += `- Stock already in TODAY'S TOP GAINERS list = momentum confirmed\n`;
    p += `- RSI > 75: avoid (overbought intraday)\n`;
    p += `- RSI < 30: avoid unless clear reversal signal\n`;
    p += `- If market mood is BEARISH: warn the user and prefer defensive/low-beta plays\n`;
  } else if (timeframe === 'swing') {
    p += `---
**Rank #[N]: [TICKER] — [COMPANY NAME]**
🎯 Conviction: [XX]% | Timeframe: 3–7 trading days
**Entry Zone:** ₹[X]–₹[Y]
**Target:** ₹[Z] (+[A]%)
**Stop Loss:** ₹[W] (-[B]%)
**Bull case:** [Technical breakout or fundamental catalyst. 2–3 sentences.]
**Bear case:** [What would invalidate this swing trade.]
---\n`;
  } else {
    p += `---
**Rank #[N]: [TICKER] — [COMPANY NAME]**
🎯 Conviction: [XX]% | Timeframe: weeks to months
**Entry Zone:** ₹[X]–₹[Y]
**Target:** ₹[Z] (+[A]%)
**Stop Loss:** ₹[W] (-[B]%)
**Bull case:** [Growth drivers, fundamentals, sector tailwinds. 3 sentences.]
**Bear case:** [Valuation risk, headwinds, what could go wrong. 2 sentences.]
---\n`;
  }

  p += `\nStart with Rank #1. Use actual ₹ prices from the live data. Be direct. The user is opening their broker app right now.`;
  return p;
}

// ─── Python service helper ────────────────────────────────────────────────────

async function pythonGet(path) {
  try {
    const r = await fetch(`${PYTHON_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

// ─── SSE response helper ──────────────────────────────────────────────────────

function sseSetup(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
}

function sseSend(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sseDone(res) {
  res.write('data: [DONE]\n\n');
}

// ─── NVIDIA streaming ─────────────────────────────────────────────────────────

async function streamNvidia(res, messages, maxTokens = 1500, temperature = 0.3) {
  if (!NVIDIA_API_KEY) {
    sseSend(res, { error: 'NVIDIA_API_KEY is not configured on the server.' });
    sseDone(res);
    return '';
  }

  let fullContent = '';

  try {
    const response = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: PRIMARY_MODEL,
        messages,
        stream: true,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[AI] NVIDIA API error:', response.status, errText.slice(0, 300));
      sseSend(res, { error: `AI service error (${response.status}). Please try again.` });
      sseDone(res);
      return '';
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          sseDone(res);
          return fullContent;
        }
        try {
          const parsed = JSON.parse(data);
          const token  = parsed.choices?.[0]?.delta?.content;
          if (token != null) {
            fullContent += token;
            sseSend(res, { token });
          }
          // Handle finish_reason
          if (parsed.choices?.[0]?.finish_reason === 'stop') {
            sseDone(res);
            return fullContent;
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    // Flush any remaining buffer
    if (buffer.trim().startsWith('data:')) {
      const data = buffer.trim().slice(5).trim();
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);
          const token  = parsed.choices?.[0]?.delta?.content;
          if (token) { fullContent += token; sseSend(res, { token }); }
        } catch {}
      }
    }

  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      sseSend(res, { error: 'AI request timed out. Please try again.' });
    } else {
      console.error('[AI] Stream error:', err.message);
      sseSend(res, { error: 'Connection to AI service lost. Please try again.' });
    }
  }

  sseDone(res);
  return fullContent;
}

// ─── Stock context aggregator ─────────────────────────────────────────────────

async function buildStockContext(ticker) {
  const sym       = ticker.replace('.NS', '').replace('.BO', '').toUpperCase();
  const nseTicker = `${sym}.NS`;

  // Phase 1: Quote + Fundamentals first to extract company name for better news search
  const [rQuote, rFund] = await Promise.allSettled([
    pythonGet(`/market/quote?ticker=${nseTicker}`),
    pythonGet(`/market/fundamentals?ticker=${nseTicker}`),
  ]);

  const get = r => (r.status === 'fulfilled' ? r.value : null);
  const quoteData = get(rQuote);
  const fundData  = get(rFund);

  // Use company name (stripped of Ltd/Limited) for more relevant news
  const rawCo = fundData?.company || quoteData?.company || sym;
  const newsQuery = rawCo
    .replace(/\s+(Limited|Ltd\.?|Inc\.?|Corp\.?|Industries|Enterprises|Technologies)$/i, '')
    .trim();

  // Phase 2: All remaining data with improved news query (72h window)
  const [techSummary, news, fiiDii, options] =
    await Promise.allSettled([
      pythonGet(`/technical/summary?ticker=${nseTicker}`),
      pythonGet(`/news/search?q=${encodeURIComponent(newsQuery)}&hours=72&tag=true&limit=8`),
      pythonGet('/nse/fii-dii'),
      pythonGet(`/nse/options?ticker=${sym}`),
    ]);

  return {
    ticker:       sym,
    quote:        quoteData,
    fundamentals: fundData,
    technical:    get(techSummary),
    news:         get(news),
    fiiDii:       get(fiiDii),
    options:      get(options),
  };
}

// ─── Signal Stack computation ─────────────────────────────────────────────────

function computeSignalStack(ctx) {
  const signals = [];

  // Signal 1 — Technical: RSI + MACD
  const rsi      = ctx.technical?.rsi?.rsi;
  const macdTrend = ctx.technical?.macd?.trend;
  if (rsi != null) {
    if (rsi >= 40 && rsi <= 65 && macdTrend === 'bullish')
      signals.push({ name: 'Technical', value: 'BULLISH', detail: `RSI ${rsi} — healthy range. MACD bullish crossover.` });
    else if ((rsi > 70 || rsi < 30) || macdTrend === 'bearish')
      signals.push({ name: 'Technical', value: 'BEARISH', detail: `RSI ${rsi}${rsi > 70 ? ' — overbought' : rsi < 30 ? ' — oversold' : ''}. MACD ${macdTrend || 'bearish'}.` });
    else
      signals.push({ name: 'Technical', value: 'NEUTRAL', detail: `RSI ${rsi} — neutral zone. No extreme momentum.` });
  } else {
    signals.push({ name: 'Technical', value: 'NEUTRAL', detail: 'Technical data unavailable.' });
  }

  // Signal 2 — Fundamental: PE ratio
  const pe = ctx.fundamentals?.pe_ratio;
  if (pe != null) {
    const peNum = parseFloat(pe);
    if (!isNaN(peNum)) {
      if (peNum < 20)
        signals.push({ name: 'Fundamental', value: 'BULLISH', detail: `P/E ${peNum} — attractively valued.` });
      else if (peNum > 45)
        signals.push({ name: 'Fundamental', value: 'BEARISH', detail: `P/E ${peNum} — elevated valuation risk.` });
      else
        signals.push({ name: 'Fundamental', value: 'NEUTRAL', detail: `P/E ${peNum} — fair value range.` });
    } else {
      signals.push({ name: 'Fundamental', value: 'NEUTRAL', detail: 'Fundamentals data unavailable.' });
    }
  } else {
    signals.push({ name: 'Fundamental', value: 'NEUTRAL', detail: 'Fundamentals data unavailable.' });
  }

  // Signal 3 — News Sentiment
  const articles = ctx.news?.articles || [];
  const posCount = articles.filter(a => a.sentiment === 'POSITIVE').length;
  const negCount = articles.filter(a => a.sentiment === 'NEGATIVE').length;
  const total    = articles.length;
  if (total > 0) {
    if (posCount / total >= 0.6)
      signals.push({ name: 'News', value: 'BULLISH', detail: `${posCount}/${total} articles positive.` });
    else if (negCount / total >= 0.6)
      signals.push({ name: 'News', value: 'BEARISH', detail: `${negCount}/${total} articles negative.` });
    else
      signals.push({ name: 'News', value: 'NEUTRAL', detail: `Mixed news: ${posCount} positive, ${negCount} negative.` });
  } else {
    signals.push({ name: 'News', value: 'NEUTRAL', detail: 'No recent news found.' });
  }

  // Signal 4 — Options (PCR as market sentiment proxy)
  const pcr = ctx.options?.put_call_ratio;
  if (pcr != null) {
    if (pcr > 1.2)
      signals.push({ name: 'Options', value: 'BULLISH', detail: `PCR ${pcr} — heavy put buying suggests bullish contrarian signal.` });
    else if (pcr < 0.8)
      signals.push({ name: 'Options', value: 'BEARISH', detail: `PCR ${pcr} — call-heavy. Complacency risk.` });
    else
      signals.push({ name: 'Options', value: 'NEUTRAL', detail: `PCR ${pcr} — balanced options activity.` });
  } else {
    signals.push({ name: 'Options', value: 'NEUTRAL', detail: 'Options data unavailable.' });
  }

  // Signal 5 — Institutional (FII/DII net flow)
  const fiiNet = ctx.fiiDii?.fii_net;
  if (fiiNet != null) {
    if (fiiNet > 500)
      signals.push({ name: 'Institutional', value: 'BULLISH', detail: `FII net buying ₹${fiiNet.toLocaleString('en-IN')} Cr today.` });
    else if (fiiNet < -500)
      signals.push({ name: 'Institutional', value: 'BEARISH', detail: `FII net selling ₹${Math.abs(fiiNet).toLocaleString('en-IN')} Cr today.` });
    else if (fiiNet > 0)
      signals.push({ name: 'Institutional', value: 'NEUTRAL', detail: `FII marginal buyers (+₹${fiiNet} Cr). DII: ${ctx.fiiDii?.dii_net >= 0 ? '+' : ''}₹${ctx.fiiDii?.dii_net} Cr.` });
    else
      signals.push({ name: 'Institutional', value: 'NEUTRAL', detail: `FII marginal sellers (₹${fiiNet} Cr). Institutional activity muted.` });
  } else {
    signals.push({ name: 'Institutional', value: 'NEUTRAL', detail: 'FII/DII data unavailable.' });
  }

  // Confidence scoring
  const bullishCount = signals.filter(s => s.value === 'BULLISH').length;
  const bearishCount = signals.filter(s => s.value === 'BEARISH').length;

  let confidence, verdict;
  if      (bullishCount === 5) { confidence = 93; verdict = 'STRONG BUY';  }
  else if (bullishCount === 4) { confidence = 82; verdict = 'BUY';         }
  else if (bullishCount === 3) { confidence = 67; verdict = 'MILD BUY';    }
  else if (bearishCount === 5) { confidence = 93; verdict = 'STRONG SELL'; }
  else if (bearishCount === 4) { confidence = 82; verdict = 'SELL';        }
  else if (bearishCount === 3) { confidence = 67; verdict = 'MILD SELL';   }
  else                          { confidence = 45; verdict = 'NEUTRAL';     }

  return { signals, bullishCount, bearishCount, confidence, verdict };
}

// ─── POST /api/chat ───────────────────────────────────────────────────────────

router.post('/chat', async (req, res) => {
  const { message, history = [], sessionId } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  sseSetup(res);

  try {
    const llmMessages = [{ role: 'system', content: SYSTEM_PROMPT }];
    for (const msg of history.slice(-12)) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        llmMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const intent = detectIntent(message);
    let userPrompt    = message;
    let tokenLimit    = 1500;
    let sourcesPayload = null;

    // ── TOP PICKS (intraday / swing / long-term) ──────────────────────────────
    if (intent.type === 'top_picks') {
      tokenLimit = 4500;
      const ctx = await buildTopPicksContext(intent.n, intent.timeframe, res);
      userPrompt = buildTopPicksPrompt(message, intent, ctx);

    // ── SPECIFIC STOCK DEEP ANALYSIS ──────────────────────────────────────────
    } else if (intent.type === 'specific_stock') {
      tokenLimit = 3000;
      const ticker = intent.ticker;

      sseSend(res, { type: 'progress', data: `Fetching live price data for ${ticker}...` });

      const [rIdx, rFii] = await Promise.allSettled([
        pythonGet('/market/indices'),
        pythonGet('/nse/fii-dii'),
      ]);
      const fii = rFii.status === 'fulfilled' ? rFii.value : null;
      const idx = rIdx.status === 'fulfilled' ? rIdx.value : null;

      const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      let liveData = `DATE: ${today}\n`;
      if (idx?.nifty50?.price)   liveData += `Nifty 50: ${idx.nifty50.price} (${idx.nifty50.change_pct >= 0 ? '+' : ''}${idx.nifty50.change_pct}%)\n`;
      if (idx?.sensex?.price)    liveData += `Sensex: ${idx.sensex.price} (${idx.sensex.change_pct >= 0 ? '+' : ''}${idx.sensex.change_pct}%)\n`;
      if (idx?.banknifty?.price) liveData += `Bank Nifty: ${idx.banknifty.price} (${idx.banknifty.change_pct >= 0 ? '+' : ''}${idx.banknifty.change_pct}%)\n`;
      if (fii?.fii_net != null)  liveData += `FII: ${fii.fii_net >= 0 ? '+' : ''}₹${fii.fii_net} Cr | DII: ${fii.dii_net >= 0 ? '+' : ''}₹${fii.dii_net} Cr | Mood: ${fii.market_mood}\n`;

      sseSend(res, { type: 'progress', data: `Loading technical indicators for ${ticker}...` });

      const [qRes, fRes, tRes, nRes] = await Promise.allSettled([
        pythonGet(`/market/quote?ticker=${ticker}.NS`),
        pythonGet(`/market/fundamentals?ticker=${ticker}.NS`),
        pythonGet(`/technical/summary?ticker=${ticker}.NS`),
        pythonGet(`/news/search?q=${encodeURIComponent(ticker + ' India stock')}&hours=72&tag=true&limit=8`),
      ]);

      sseSend(res, { type: 'progress', data: `Scanning news and sentiment for ${ticker}...` });

      const q    = qRes.status === 'fulfilled' ? qRes.value : null;
      const fund = fRes.status === 'fulfilled' ? fRes.value : null;
      const tech = tRes.status === 'fulfilled' ? tRes.value : null;
      const newsData = nRes.status === 'fulfilled' ? nRes.value : null;

      if (q?.price) {
        liveData += `\n--- ${q.company || ticker} (${ticker}) LIVE DATA ---\n`;
        liveData += `Price: ₹${q.price} | Change: ${q.change_pct >= 0 ? '+' : ''}${q.change_pct}%\n`;
        liveData += `Day Range: ₹${q.day_low}–₹${q.day_high} | Open: ₹${q.open || 'N/A'} | Prev Close: ₹${q.prev_close}\n`;
        liveData += `52W: ₹${q.week_52_low}–₹${q.week_52_high}\n`;
        if (q.volume > 0)     liveData += `Volume: ${q.volume.toLocaleString('en-IN')}\n`;
        if (q.market_cap > 0) liveData += `Market Cap: ₹${(q.market_cap / 1e7).toFixed(0)} Cr\n`;
      }
      if (fund?.pe_ratio != null) {
        liveData += `P/E: ${fund.pe_ratio}`;
        if (fund.price_to_book) liveData += ` | P/B: ${fund.price_to_book}`;
        if (fund.roe)           liveData += ` | ROE: ${fund.roe}%`;
        if (fund.eps)           liveData += ` | EPS: ₹${fund.eps}`;
        if (fund.sector)        liveData += ` | Sector: ${fund.sector}`;
        liveData += '\n';
        if (fund.dividend_yield) liveData += `Dividend Yield: ${fund.dividend_yield}%\n`;
        if (fund.market_cap_cr)  liveData += `Market Cap (Screener): ₹${fund.market_cap_cr} Cr\n`;
      }
      if (tech?.rsi?.rsi != null)  liveData += `RSI(14): ${tech.rsi.rsi} [${tech.rsi.signal}] — ${tech.rsi.interpretation || ''}\n`;
      if (tech?.macd?.trend)       liveData += `MACD: ${tech.macd.trend} | Histogram: ${tech.macd.histogram}\n`;
      if (tech?.overall_signal)    liveData += `Overall Technical Signal: ${tech.overall_signal}\n`;

      const companyName = q?.company || fund?.company || ticker;
      const articles = (newsData?.articles || [])
        .filter(a => a.url && a.title && !a.title.includes('[Removed]'))
        .slice(0, 6)
        .map(a => ({ title: a.title, url: a.url, source: a.source, published_at: a.published_at, sentiment: a.sentiment || null }));

      if (articles.length) {
        liveData += `\nRecent News:\n`;
        for (const a of articles.slice(0, 5)) liveData += `[${a.sentiment || 'NEUTRAL'}] ${a.title}\n`;
      }

      sseSend(res, { type: 'progress', data: 'Building full analysis...' });

      sourcesPayload = {
        ticker, company: companyName, price: q?.price || null, articles,
        links: [
          { label: 'NSE India',    url: `https://www.nseindia.com/get-quotes/equity?symbol=${ticker}`,                      icon: 'nse'      },
          { label: 'Screener.in',  url: `https://www.screener.in/company/${ticker}/`,                                        icon: 'screener' },
          { label: 'TradingView',  url: `https://www.tradingview.com/chart/?symbol=NSE%3A${ticker}`,                        icon: 'chart'    },
          { label: 'Moneycontrol', url: `https://www.moneycontrol.com/india/stockpricequote/${ticker.toLowerCase()}`,        icon: 'mc'       },
        ],
      };

      const tfNote = intent.timeframe === 'intraday' ? ' Focus on intraday setup: entry zone, target, stop loss, and conviction %.'
        : intent.timeframe === 'swing' ? ' Focus on swing trade setup (2–5 days): entry, target, stop, key catalyst.'
        : intent.timeframe === 'long_term' ? ' Focus on long-term investment thesis: bull case, bear case, fair value.'
        : '';

      userPrompt = `${message}${tfNote}\n\n[LIVE STOCK DATA — use ONLY these numbers]\n${liveData}[END LIVE DATA]\n\nProvide:\n1. **Price Snapshot** — where the stock stands right now\n2. **Technical View** — RSI interpretation, MACD state, trend direction\n3. **Fundamental View** — valuation (P/E vs sector), ROE, earnings quality\n4. **News & Sentiment** — positive catalysts, negative risks from recent news\n5. **Verdict** — BUY / SELL / AVOID / HOLD with entry zone, target, stop loss, conviction %`;

    // ── GENERAL MARKET / MIXED QUERY ─────────────────────────────────────────
    } else {
      const isMarketQuery = (
        /\b(stock|share|price|buy|sell|rsi|macd|nifty|sensex|fii|dii|sector|market|invest|trading|portfolio|khareed|becho|target|entry|exit|earnings|results|profit|revenue)\b/i.test(message) ||
        Object.keys(COMPANY_TICKER_MAP).some(n => message.toLowerCase().includes(n))
      );

      if (isMarketQuery) {
        sseSend(res, { type: 'progress', data: 'Checking live market data...' });

        const [rFii, rIdx] = await Promise.allSettled([
          pythonGet('/nse/fii-dii'),
          pythonGet('/market/indices'),
        ]);
        const fii = rFii.status === 'fulfilled' ? rFii.value : null;
        const idx = rIdx.status === 'fulfilled' ? rIdx.value : null;

        const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        let liveData = `DATE: ${today}\n`;
        if (idx?.nifty50?.price)   liveData += `Nifty 50: ${idx.nifty50.price} (${idx.nifty50.change_pct >= 0 ? '+' : ''}${idx.nifty50.change_pct}%)\n`;
        if (idx?.sensex?.price)    liveData += `Sensex: ${idx.sensex.price} (${idx.sensex.change_pct >= 0 ? '+' : ''}${idx.sensex.change_pct}%)\n`;
        if (idx?.banknifty?.price) liveData += `Bank Nifty: ${idx.banknifty.price} (${idx.banknifty.change_pct >= 0 ? '+' : ''}${idx.banknifty.change_pct}%)\n`;
        if (fii?.fii_net != null)  liveData += `FII: ${fii.fii_net >= 0 ? '+' : ''}₹${fii.fii_net} Cr | DII: ${fii.dii_net >= 0 ? '+' : ''}₹${fii.dii_net} Cr | Mood: ${fii.market_mood}\n`;

        userPrompt = `${message}\n\n[LIVE NSE DATA]\n${liveData}[END LIVE DATA]`;
      }
    }

    if (sourcesPayload) sseSend(res, { type: 'sources', data: sourcesPayload });
    sseSend(res, { type: 'stream_start' });

    llmMessages.push({ role: 'user', content: userPrompt });

    const fullContent = await streamNvidia(res, llmMessages, tokenLimit, 0.3);

    const sid = sessionId || uuidv4();
    Promise.all([
      pool.query('INSERT INTO chat_history (user_id, session_id, role, content) VALUES ($1, $2, $3, $4)', [req.userId, sid, 'user', message]),
      fullContent && pool.query('INSERT INTO chat_history (user_id, session_id, role, content) VALUES ($1, $2, $3, $4)', [req.userId, sid, 'assistant', fullContent]),
    ]).catch(e => console.error('[Chat] DB save:', e.message));

  } catch (err) {
    console.error('[Chat] Unhandled error:', err.message);
    sseSend(res, { error: 'Chat failed unexpectedly. Please try again.' });
    sseDone(res);
  } finally {
    res.end();
  }
});

// ─── POST /api/analyze ───────────────────────────────────────────────────────

router.post('/analyze', async (req, res) => {
  const { ticker } = req.body;
  if (!ticker?.trim()) {
    return res.status(400).json({ error: 'Ticker is required.' });
  }

  sseSetup(res);

  try {
    const sym = ticker.replace('.NS', '').replace('.BO', '').toUpperCase();

    // Tell client we're fetching data
    sseSend(res, { type: 'fetching' });

    const ctx   = await buildStockContext(sym);
    const stack = computeSignalStack(ctx);

    // Send signal stack payload before streaming analysis text
    sseSend(res, { type: 'signal_stack', data: stack });
    sseSend(res, { type: 'stream_start' });

    // Build rich analysis prompt
    const q    = ctx.quote;
    const fund = ctx.fundamentals;
    const tech = ctx.technical;
    const arts = ctx.news?.articles?.slice(0, 4) || [];
    const fii  = ctx.fiiDii;
    const opts = ctx.options;

    let prompt = `Perform a complete deep dive analysis on **${sym}** (NSE India).\n\n`;
    prompt += `## Live Market Snapshot\n`;

    if (q?.price) {
      prompt += `- Price: ₹${q.price} | Change: ${q.change_pct >= 0 ? '+' : ''}${q.change_pct}% | Day: ₹${q.day_low}–₹${q.day_high}\n`;
      prompt += `- 52-Week Range: ₹${q.week_52_low}–₹${q.week_52_high} | Prev Close: ₹${q.prev_close}\n`;
    }

    if (fund?.pe_ratio != null) {
      prompt += `- P/E: ${fund.pe_ratio} | P/B: ${fund.price_to_book || 'N/A'} | ROE: ${fund.roe || 'N/A'}% | EPS: ${fund.eps || 'N/A'}\n`;
      prompt += `- Market Cap: ₹${fund.market_cap_cr || 'N/A'} Cr | Sector: ${fund.sector || 'N/A'} | Dividend Yield: ${fund.dividend_yield || 'N/A'}%\n`;
    }

    if (tech?.rsi?.rsi != null) {
      prompt += `- RSI(14): ${tech.rsi.rsi} [${tech.rsi.signal}] — ${tech.rsi.interpretation}\n`;
    }
    if (tech?.macd?.macd != null) {
      prompt += `- MACD: ${tech.macd.macd} | Signal Line: ${tech.macd.signal} | Histogram: ${tech.macd.histogram} | Trend: ${tech.macd.trend}\n`;
    }

    if (fii?.fii_net != null) {
      prompt += `- FII Net: ${fii.fii_net >= 0 ? '+' : ''}₹${fii.fii_net} Cr | DII Net: ${fii.dii_net >= 0 ? '+' : ''}₹${fii.dii_net} Cr | Mood: ${fii.market_mood}\n`;
    }
    if (opts?.put_call_ratio != null) {
      prompt += `- Options PCR: ${opts.put_call_ratio} | ATM Strike: ₹${opts.atm_strike} | Sentiment: ${opts.sentiment}\n`;
    }

    if (arts.length > 0) {
      prompt += `\n## Recent News (last 24h)\n`;
      for (const a of arts) {
        prompt += `- [${a.sentiment || 'NEUTRAL'}] ${a.title}\n`;
      }
    }

    prompt += `\n## Signal Stack\n`;
    for (const s of stack.signals) {
      prompt += `- ${s.name}: **${s.value}** — ${s.detail}\n`;
    }
    prompt += `- Overall: ${stack.bullishCount}/5 bullish | Confidence: ${stack.confidence}% | Verdict: **${stack.verdict}**\n`;

    prompt += `
Based on all the above data, provide a complete analysis structured as:

**1. Market Snapshot** (2–3 sentences with key numbers)
**2. Technical Breakdown** (RSI + MACD interpretation, support/resistance levels if deducible)
**3. Fundamental View** (valuation, earnings quality, sector positioning)
**4. News & Sentiment** (what the market is saying, any catalysts)
**5. Institutional Activity** (FII/DII flow — what smart money is doing)
**6. Final Verdict** (confidence level, entry logic, key risks, timeframe)

Be direct. Use specific numbers. Speak like a senior prop trader delivering a call.`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ];

    const fullContent = await streamNvidia(res, messages, 2200, 0.25);

    // Log prediction to DB — include market_price_at_prediction for accuracy tracking
    const currentPrice = q?.price ? parseFloat(q.price) : null;
    pool.query(
      `INSERT INTO predictions
         (user_id, ticker, company_name, verdict, confidence, signal_stack_score,
          reasoning, market_price_at_prediction, timeframe)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        req.userId, sym, fund?.company || sym,
        stack.verdict, stack.confidence, stack.bullishCount,
        `Signals: ${stack.signals.map(s => `${s.name}:${s.value}`).join(', ')}`,
        currentPrice,
        'swing',
      ],
    ).catch(e => console.error('[Analyze] DB save:', e.message));

    // High-conviction call notification: 90%+ confidence → push to user
    if (stack.confidence >= 90) {
      try {
        const { sendToUser } = require('./notifications');
        const emoji = stack.verdict.includes('BUY') ? '🚀' : '⚠️';
        sendToUser(req.userId, {
          title: `${emoji} High Conviction Call — ${sym}`,
          body:  `${stack.verdict} | ${stack.confidence}% confidence | ${stack.bullishCount}/5 signals. Tap to review.`,
          icon:  '/favicon.ico',
          badge: '/favicon.ico',
          tag:   `conviction-${sym}`,
          data:  { url: `/stock/${sym}` },
        });
      } catch (e) {
        console.warn('[Analyze] Could not send conviction notification:', e.message);
      }
    }

  } catch (err) {
    console.error('[Analyze] Error:', err.message);
    sseSend(res, { error: 'Analysis failed. Please try again.' });
    sseDone(res);
  } finally {
    res.end();
  }
});

// ─── POST /api/briefing ──────────────────────────────────────────────────────

router.post('/briefing', async (req, res) => {
  sseSetup(res);

  try {
    sseSend(res, { type: 'fetching' });

    const [indices, fiiDii, macro, news, topMovers] = await Promise.allSettled([
      pythonGet('/market/indices'),
      pythonGet('/nse/fii-dii'),
      pythonGet('/macro/snapshot'),
      pythonGet('/news/india-market?tag=false&limit=12'),
      pythonGet('/nse/top-movers'),
    ]);

    const get = r => (r.status === 'fulfilled' ? r.value : null);
    const idxData      = get(indices);
    const fiiData      = get(fiiDii);
    const macroData    = get(macro);
    const newsData     = get(news);
    const moversData   = get(topMovers);

    const dateStr = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    let prompt = `Generate today's morning market briefing for an Indian equity trader.\n`;
    prompt += `Date: ${dateStr}\n\n`;
    prompt += `## Live Data\n`;

    if (idxData?.nifty50?.price) {
      prompt += `- Nifty 50: ${idxData.nifty50.price} (${idxData.nifty50.change_pct >= 0 ? '+' : ''}${idxData.nifty50.change_pct}%)\n`;
    }
    if (idxData?.sensex?.price) {
      prompt += `- Sensex: ${idxData.sensex.price} (${idxData.sensex.change_pct >= 0 ? '+' : ''}${idxData.sensex.change_pct}%)\n`;
    }
    if (idxData?.banknifty?.price) {
      prompt += `- Bank Nifty: ${idxData.banknifty.price} (${idxData.banknifty.change_pct >= 0 ? '+' : ''}${idxData.banknifty.change_pct}%)\n`;
    }

    if (fiiData?.fii_net != null) {
      prompt += `- FII Net: ${fiiData.fii_net >= 0 ? '+' : ''}₹${fiiData.fii_net} Cr | DII Net: ${fiiData.dii_net >= 0 ? '+' : ''}₹${fiiData.dii_net} Cr | Mood: ${fiiData.market_mood}\n`;
    }

    const c = macroData?.commodities;
    const f = macroData?.forex;
    const g = macroData?.global_indices;
    const gn = macroData?.gift_nifty;

    if (f?.usd_inr?.rate) prompt += `- USD/INR: ${f.usd_inr.rate} (${f.usd_inr.change_pct >= 0 ? '+' : ''}${f.usd_inr.change_pct}%)\n`;
    if (c?.crude_oil_wti?.price) prompt += `- Crude WTI: $${c.crude_oil_wti.price}/bbl (${c.crude_oil_wti.change_pct >= 0 ? '+' : ''}${c.crude_oil_wti.change_pct}%)\n`;
    if (c?.gold?.price) prompt += `- Gold: $${c.gold.price}/oz\n`;
    if (g?.sp500?.price) prompt += `- S&P 500: ${g.sp500.price} (${g.sp500.change_pct >= 0 ? '+' : ''}${g.sp500.change_pct}%)\n`;
    if (g?.nasdaq?.price) prompt += `- Nasdaq: ${g.nasdaq.price} (${g.nasdaq.change_pct >= 0 ? '+' : ''}${g.nasdaq.change_pct}%)\n`;
    if (g?.nikkei?.price) prompt += `- Nikkei: ${g.nikkei.price} (${g.nikkei.change_pct >= 0 ? '+' : ''}${g.nikkei.change_pct}%)\n`;
    if (g?.vix?.price) prompt += `- VIX: ${g.vix.price}\n`;
    if (gn?.gift_nifty_approx) prompt += `- GIFT Nifty (est.): ${gn.gift_nifty_approx} | Direction: ${gn.direction} | Gap: ${gn.gap_vs_prev_close_pct >= 0 ? '+' : ''}${gn.gap_vs_prev_close_pct}%\n`;

    const headlines = newsData?.articles?.slice(0, 6).map(a => `- ${a.title}`).join('\n');
    if (headlines) {
      prompt += `\n## Top Market Headlines\n${headlines}\n`;
    }

    if (moversData?.gainers?.length) {
      prompt += `\n## Today's Top Gainers\n`;
      for (const s of moversData.gainers.slice(0, 6)) {
        const pct = s.change_pct != null ? `${s.change_pct >= 0 ? '+' : ''}${Number(s.change_pct).toFixed(2)}%` : '';
        prompt += `- ${s.ticker}${s.company ? ` (${s.company})` : ''}: ₹${s.price} ${pct}\n`;
      }
    }
    if (moversData?.losers?.length) {
      prompt += `\n## Today's Top Losers\n`;
      for (const s of moversData.losers.slice(0, 6)) {
        const pct = s.change_pct != null ? `${Number(s.change_pct).toFixed(2)}%` : '';
        prompt += `- ${s.ticker}${s.company ? ` (${s.company})` : ''}: ₹${s.price} ${pct}\n`;
      }
    }

    prompt += `
Generate a complete morning briefing covering these sections with markdown headers:

**Market Mood** — Overall tone from indices, global cues, and institutional data (3–4 sentences)
**Global Cues** — What happened in US/Asian markets overnight and what it signals for India
**FII/DII Flows** — What institutional money is doing and what it means for today
**Macro Watch** — Rupee, crude oil, and gold impact on specific Indian sectors

**Top 10 Stock Picks** — List exactly 10 NSE-listed stocks. For each, use this exact block format:
> **TICKER** | VERDICT: BUY / SELL / AVOID | CONVICTION: XX%
> Target: +XX% | Stop Loss: -XX%
> _Reason: 2-sentence data-driven reasoning. Cite specific signals — RSI zone, FII/DII flow direction, sector trend, news catalyst, or technical level._

Rules for the 10 picks:
- Cover at least 5 different sectors (Banking, IT, Pharma, Auto, FMCG, Energy, Metal, Infra, etc.)
- No more than 2 picks from the same sector
- Conviction % must reflect signal quality: 85%+ only when 4+ signals align
- Express Target and Stop Loss as % moves from current price (not absolute prices)
- AVOID picks must state the specific risk or event to wait out
- If today's gainers/losers data is provided above, use those stocks as context — they show where money is moving

**Key Risks Today** — Exactly 3 specific risks that could derail today's market (no generic statements like "global uncertainty")

Speak like a senior fund manager giving the morning desk briefing. Every sentence must carry actionable information. No filler. No hedging on the picks.`;

    sseSend(res, { type: 'stream_start' });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ];

    const fullContent = await streamNvidia(res, messages, 3500, 0.4);

    // Save briefing to DB
    pool.query(
      'INSERT INTO briefings (user_id, content, market_mood, fii_net_flow) VALUES ($1, $2, $3, $4)',
      [req.userId, fullContent || 'Morning briefing generated', fiiData?.market_mood || 'unknown', fiiData?.fii_net ?? null],
    ).catch(e => console.error('[Briefing] DB save:', e.message));

  } catch (err) {
    console.error('[Briefing] Error:', err.message);
    sseSend(res, { error: 'Briefing generation failed. Please try again.' });
    sseDone(res);
  } finally {
    res.end();
  }
});

// ─── POST /api/macro-analysis ────────────────────────────────────────────────

router.post('/macro-analysis', async (req, res) => {
  sseSetup(res);

  try {
    sseSend(res, { type: 'fetching' });

    const macroData = await pythonGet('/macro/snapshot');

    sseSend(res, { type: 'stream_start' });

    let prompt = `Analyze the current macro environment and its specific impact on Indian equity markets.\n\n`;

    const f  = macroData?.forex;
    const c  = macroData?.commodities;
    const g  = macroData?.global_indices;
    const gn = macroData?.gift_nifty;

    if (f?.usd_inr?.rate) prompt += `USD/INR: ${f.usd_inr.rate} (${f.usd_inr.change_pct >= 0 ? '+' : ''}${f.usd_inr.change_pct}%)\n`;
    if (c?.crude_oil_wti?.price) prompt += `Crude Oil (WTI): $${c.crude_oil_wti.price}/bbl (${c.crude_oil_wti.change_pct >= 0 ? '+' : ''}${c.crude_oil_wti.change_pct}%)\n`;
    if (c?.crude_oil_brent?.price) prompt += `Crude Oil (Brent): $${c.crude_oil_brent.price}/bbl\n`;
    if (c?.gold?.price) prompt += `Gold: $${c.gold.price}/oz\n`;
    if (g?.sp500?.price) prompt += `S&P 500: ${g.sp500.price} (${g.sp500.change_pct >= 0 ? '+' : ''}${g.sp500.change_pct}%)\n`;
    if (g?.vix?.price) prompt += `VIX: ${g.vix.price}\n`;
    if (gn?.gift_nifty_approx) prompt += `GIFT Nifty (est.): ${gn.gift_nifty_approx} | Gap: ${gn.gap_vs_prev_close_pct >= 0 ? '+' : ''}${gn.gap_vs_prev_close_pct}%\n`;

    prompt += `
Provide a precise macro impact analysis:

**Rupee Impact** — Which sectors benefit and which suffer at the current USD/INR level. Be specific: name the sectors and representative stocks.
**Crude Oil Impact** — Effect on OMCs (HPCL, BPCL), aviation (IndiGo), IT (TCS, Infosys earn USD), chemicals, tyre sector.
**Global Risk Signal** — What the VIX level and S&P 500 direction signal for Indian markets.
**FII Flow Implication** — What current global conditions suggest for FII behavior in Indian markets.
**Overall Macro Verdict** — In 2–3 sentences, what the macro environment means for the Indian trader today.`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ];

    await streamNvidia(res, messages, 1200, 0.3);

  } catch (err) {
    console.error('[MacroAnalysis] Error:', err.message);
    sseSend(res, { error: 'Macro analysis failed. Please try again.' });
    sseDone(res);
  } finally {
    res.end();
  }
});

// ─── POST /api/sector-analysis ───────────────────────────────────────────────

router.post('/sector-analysis', async (req, res) => {
  const { sector = 'general market' } = req.body;

  sseSetup(res);

  try {
    sseSend(res, { type: 'fetching' });

    const [fiiDii, macro] = await Promise.allSettled([
      pythonGet('/nse/fii-dii'),
      pythonGet('/macro/snapshot'),
    ]);

    const fiiData   = fiiDii.status === 'fulfilled'  ? fiiDii.value  : null;
    const macroData = macro.status === 'fulfilled'   ? macro.value   : null;

    sseSend(res, { type: 'stream_start' });

    let prompt = `Analyze the **${sector}** sector for today in the Indian equity market (NSE).\n\n`;

    if (fiiData?.fii_net != null) {
      prompt += `FII net: ${fiiData.fii_net >= 0 ? '+' : ''}₹${fiiData.fii_net} Cr | DII: ${fiiData.dii_net >= 0 ? '+' : ''}₹${fiiData.dii_net} Cr | Mood: ${fiiData.market_mood}\n`;
    }
    if (macroData?.forex?.usd_inr?.rate) {
      prompt += `USD/INR: ${macroData.forex.usd_inr.rate}\n`;
    }
    if (macroData?.commodities?.crude_oil_wti?.price) {
      prompt += `Crude WTI: $${macroData.commodities.crude_oil_wti.price}\n`;
    }

    prompt += `
Provide:

**Sector Outlook** — Current momentum, key drivers (2–3 sentences)
**Key Catalysts** — What is driving or weighing on this sector right now
**Stocks to Watch** — Top 3 stocks in this sector with brief reasoning and key price levels
**Rotation Signal** — Is money moving into or out of this sector? Evidence?
**Risk Factors** — Sector-specific risks to watch`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ];

    await streamNvidia(res, messages, 1200, 0.3);

  } catch (err) {
    console.error('[SectorAnalysis] Error:', err.message);
    sseSend(res, { error: 'Sector analysis failed. Please try again.' });
    sseDone(res);
  } finally {
    res.end();
  }
});

// ─── GET /api/chat-history ───────────────────────────────────────────────────

router.get('/chat-history', async (req, res) => {
  try {
    const { limit = 50, session_id } = req.query;
    let query  = 'SELECT * FROM chat_history WHERE user_id = $1';
    const params = [req.userId];

    if (session_id) {
      query += ' AND session_id = $2';
      params.push(session_id);
    }
    query += ` ORDER BY created_at ASC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit) || 50);

    const result = await pool.query(query, params);
    res.json({ history: result.rows });
  } catch (err) {
    console.error('[ChatHistory] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch chat history.' });
  }
});

// ─── GET /api/briefings ──────────────────────────────────────────────────────

router.get('/briefings', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, market_mood, fii_net_flow, generated_at FROM briefings WHERE user_id = $1 ORDER BY generated_at DESC LIMIT 30',
      [req.userId],
    );
    res.json({ briefings: result.rows });
  } catch (err) {
    console.error('[Briefings] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch briefings.' });
  }
});

// ─── GET /api/predictions ────────────────────────────────────────────────────

router.get('/predictions', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM predictions WHERE user_id = $1 ORDER BY predicted_at DESC LIMIT 50',
      [req.userId],
    );
    res.json({ predictions: result.rows });
  } catch (err) {
    console.error('[Predictions] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch predictions.' });
  }
});

module.exports = router;
