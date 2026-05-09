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

const SYSTEM_PROMPT = `You are Billionaire AI — a senior proprietary trader with 20+ years of experience in Indian equity markets (NSE/BSE). You think and speak like someone who has seen every market cycle and is never impressed by noise — only by signal.

VOICE RULES (non-negotiable):
- Never open with filler phrases: no "Great question!", "I'd be happy to help", "Certainly!", "Of course!"
- No hype language: never say "skyrocket", "moon", "amazing opportunity", "definitely going up"
- No uncertain waffle: never say "maybe", "possibly could", "I think perhaps" — state data, then verdict
- Never start a response with the word "I"
- Robotic disclaimers go at the very end only, if needed — never interrupt analysis mid-response
- Use "definitely" only at 90%+ conviction
- If the user writes in Hindi/Hinglish: respond in natural Hinglish throughout the entire response — never switch back mid-response

PERSONALITY:
Calm. Precise. Neutral. Show your work through data. Speak like someone who has seen every market cycle and is not impressed by noise.

HOW TO REFERENCE DATA (weave it naturally):
WRONG: "Based on my analysis of various sources, I believe this stock may go up."
RIGHT: "FII data from NSE shows ₹2,400 Cr net buying in banking today. RSI for HDFC Bank sits at 58 — room to move. Q3 earnings beat by 6%. Three signals agree. This is a reasonable setup."

CONFIDENCE THRESHOLDS:
- 90–100%: "Write this down. High conviction call."
- 75–89%: "Strong signal — multiple indicators agree."
- 60–74%: "Likely positive — proceed with caution."
- 40–59%: "Speculative — small position only."
- Below 40%: "Avoid — signals are mixed or weak."

REQUIRED: Every analysis must close with: "For informational purposes only. Not financial advice."`;

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
    // Build messages array
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

    // Add conversation history (last 12 exchanges)
    for (const msg of history.slice(-12)) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Enrich with live market context if stock-related
    const isMarketQuery = /\b(stock|price|buy|sell|rsi|macd|technical|chart|nifty|sensex|fii|dii|sector|rupee|crude|analysis|invest|trading)\b/i.test(message);
    let liveContext = '';

    if (isMarketQuery) {
      const [fiiDii, indices] = await Promise.allSettled([
        pythonGet('/nse/fii-dii'),
        pythonGet('/market/indices'),
      ]);
      const fii = fiiDii.status === 'fulfilled' ? fiiDii.value : null;
      const idx = indices.status === 'fulfilled' ? indices.value : null;

      if (fii?.fii_net != null) {
        liveContext += `\nFII net flow today: ${fii.fii_net >= 0 ? '+' : ''}₹${fii.fii_net} Cr (${fii.market_mood}), DII: ${fii.dii_net >= 0 ? '+' : ''}₹${fii.dii_net} Cr.`;
      }
      if (idx?.nifty50?.price) {
        liveContext += ` Nifty 50: ${idx.nifty50.price} (${idx.nifty50.change_pct >= 0 ? '+' : ''}${idx.nifty50.change_pct}%).`;
      }
      if (idx?.banknifty?.price) {
        liveContext += ` Bank Nifty: ${idx.banknifty.price} (${idx.banknifty.change_pct >= 0 ? '+' : ''}${idx.banknifty.change_pct}%).`;
      }
    }

    // Check for specific ticker in the message
    const tickerMatch = message.match(/\b([A-Z]{3,10})\b/);
    if (tickerMatch && isMarketQuery) {
      const possibleTicker = tickerMatch[1];
      const quote = await pythonGet(`/market/quote?ticker=${possibleTicker}.NS`);
      if (quote?.price > 0) {
        liveContext += ` ${possibleTicker} live: ₹${quote.price} (${quote.change_pct >= 0 ? '+' : ''}${quote.change_pct}%), 52W range: ₹${quote.week_52_low}–₹${quote.week_52_high}.`;
      }
    }

    const finalMessage = liveContext
      ? `${message}\n\n[Live Market Data:${liveContext}]`
      : message;

    messages.push({ role: 'user', content: finalMessage });

    // Signal to client that data fetch is done and streaming begins
    sseSend(res, { type: 'stream_start' });

    const fullContent = await streamNvidia(res, messages, 1500, 0.3);

    // Async DB saves — do not block response
    const sid = sessionId || uuidv4();
    Promise.all([
      pool.query(
        'INSERT INTO chat_history (user_id, session_id, role, content) VALUES ($1, $2, $3, $4)',
        [req.userId, sid, 'user', message],
      ),
      fullContent && pool.query(
        'INSERT INTO chat_history (user_id, session_id, role, content) VALUES ($1, $2, $3, $4)',
        [req.userId, sid, 'assistant', fullContent],
      ),
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

    // Log prediction to DB
    pool.query(
      `INSERT INTO predictions (user_id, ticker, company_name, verdict, confidence, signal_stack_score, reasoning)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.userId, sym, fund?.company || sym, stack.verdict, stack.confidence,
       stack.bullishCount, `Signals: ${stack.signals.map(s => `${s.name}:${s.value}`).join(', ')}`],
    ).catch(e => console.error('[Analyze] DB save:', e.message));

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

    const [indices, fiiDii, macro, news] = await Promise.allSettled([
      pythonGet('/market/indices'),
      pythonGet('/nse/fii-dii'),
      pythonGet('/macro/snapshot'),
      pythonGet('/news/india-market?tag=false&limit=12'),
    ]);

    const get = r => (r.status === 'fulfilled' ? r.value : null);
    const idxData   = get(indices);
    const fiiData   = get(fiiDii);
    const macroData = get(macro);
    const newsData  = get(news);

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

    prompt += `
Generate a complete morning briefing covering these sections with markdown headers:

**Market Mood** — Overall tone from indices, global cues, and institutional data (3–4 sentences)
**Global Cues** — What happened in US/Asian markets overnight and what it signals for India
**FII/DII Flows** — What institutional money is doing and what it means for today
**Macro Watch** — Rupee, crude oil, and gold impact on specific Indian sectors
**Stocks to Watch** — 4–5 specific stocks/sectors with brief reasoning and key levels
**Key Risks Today** — What could derail the market (be specific, not generic)

Speak like a senior trader delivering the morning desk briefing. Every sentence should carry information. No filler.`;

    sseSend(res, { type: 'stream_start' });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ];

    const fullContent = await streamNvidia(res, messages, 2500, 0.4);

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
