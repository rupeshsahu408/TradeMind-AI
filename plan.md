# Billionaire AI — Complete Development Roadmap

> **Tagline:** "Research like a hedge fund. Trade like a billionaire."
> **Purpose:** A personal AI-powered trading assistant for Indian markets (NSE/BSE) that performs deep multi-source research, analyzes market data, and delivers probability-based stock predictions with full reasoning and verified sources.
> **Owner:** Personal use only in Phase 1–3. Public SaaS in Phase 7+.
> **Total Cost to Launch:** ₹0 (all tools and APIs used are free tier)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Data Sources](#data-sources)
4. [Database Schema](#database-schema)
5. [Phase 1 — Project Setup & Foundation](#phase-1)
6. [Phase 2 — Data Engine (Market Data)](#phase-2)
7. [Phase 3 — News & Sentiment Engine](#phase-3)
8. [Phase 4 — AI Brain Integration](#phase-4)
9. [Phase 5 — Core UI (Command Center + Chat)](#phase-5)
10. [Phase 6 — Stock Deep Dive + Morning Briefing](#phase-6)
11. [Phase 7 — Watchlist, Accuracy Tracker, Alerts](#phase-7)
12. [Phase 8 — Advanced Features](#phase-8)
13. [Phase 9 — SaaS Preparation](#phase-9)
14. [Confidence System](#confidence-system)
15. [Signal Stack Logic](#signal-stack-logic)
16. [Screen Map](#screen-map)

---

## Project Overview

**Billionaire AI** is a personal AI trading assistant built specifically for the Indian stock market (NSE/BSE). It works like a top-level professional trader — researching data from dozens of sources simultaneously, identifying patterns, and delivering confident, sourced, probability-based predictions in plain Hindi or English.

### What It Does
- Researches stocks from 15+ data sources simultaneously
- Analyzes technical patterns, fundamentals, news, social sentiment, and global macroeconomics
- Produces a "Signal Stack" score — how many independent signals agree
- Delivers a final verdict with confidence percentage and full reasoning
- Logs every prediction and tracks accuracy post-market
- Generates on-demand morning briefings with top stock picks
- Sends browser push notifications for important market events

### What Makes It Different
- Not a screener. Not just a news aggregator. It THINKS like a trader.
- Multi-source cross-referencing — a call is only high-conviction when multiple independent signals agree
- Full transparency — every claim has a source
- Tracks its own accuracy — builds trust over time
- Speaks in Hindi or English based on user preference

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 18+ | UI framework |
| Vite | 5+ | Build tool and dev server |
| TypeScript | 5+ | Type safety |
| Tailwind CSS | 3+ | Styling |
| shadcn/ui | latest | UI component library |
| Recharts | 2+ | Stock charts and data visualization |
| wouter | 3+ | Client-side routing |
| lucide-react | latest | Icons |

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20+ | Runtime |
| Express | 4+ | HTTP server and API routes |
| Python | 3.11+ | Data fetching service (yfinance, scraping) |
| FastAPI | latest | Python microservice HTTP server |
| Drizzle ORM | latest | Database ORM for PostgreSQL |

### AI
| Tool | Purpose |
|------|---------|
| Google Gemini 2.5 Flash | Core AI model — synthesizes all data, generates analysis, chat responses |
| Gemini Vision | Chart image analysis (when user uploads chart screenshot) |
| Gemini Web Search (grounding) | Built-in real-time web search during analysis |

### Database
| Tool | Purpose |
|------|---------|
| Neon.tech (PostgreSQL) | Primary database — stores users, preferences, predictions, chat history, watchlist, accuracy log |

### Infrastructure
| Tool | Purpose |
|------|---------|
| Replit | Hosting and development environment |
| Web Push (web-push npm) | Browser push notifications |

---

## Data Sources

### Market Data (Free)
| Source | Library/Method | Data Provided |
|--------|---------------|---------------|
| Yahoo Finance | yfinance (Python) | Live prices, OHLCV, fundamentals, earnings, NSE/BSE |
| NSE India | Web scraping (requests + BeautifulSoup) | Options chain, FII/DII data, circuit limits, live quotes |
| Alpha Vantage | REST API (free key) | RSI, MACD, Bollinger Bands, EMA, SMA |
| Screener.in | Web scraping | Deep Indian company fundamentals, 10-year financial data |
| Investing.com | Web scraping | SGX Nifty pre-market, crude oil, gold, global indices |
| Trendlyne | Web scraping | Promoter buying/selling, shareholding changes |

### News (Free)
| Source | Method | Data Provided |
|--------|--------|---------------|
| NewsAPI.org | REST API (free key) | Global + Indian news by ticker or topic |
| Economic Times | RSS Feed | Live Indian stock market news |
| Moneycontrol | RSS Feed | Indian market analysis and breaking news |
| LiveMint | RSS Feed | Premium Indian financial journalism |
| Business Standard | RSS Feed | Corporate news, earnings, results |
| Google News | Web scraping | Breaking news on any stock, last 1 hour |

### Social Sentiment (Free)
| Source | Method | Data Provided |
|--------|--------|---------------|
| Reddit | PRAW library (free API key) | Posts/comments from r/IndiaInvestments, r/IndianStreetBets, r/stocks |
| Twitter/X | Web scraping (public profiles) | Tweets from top Indian market analysts (no paid API) |
| YouTube | YouTube Data API v3 (free key) | Financial channel videos, comments, trending stock mentions |
| Google Trends | pytrends (Python) | Search interest spikes for any stock |

### Macro & Global (Free)
| Source | Method | Data Provided |
|--------|--------|---------------|
| Yahoo Finance | yfinance | US markets (Dow, S&P 500, Nasdaq), global indices |
| Investing.com | Web scraping | USD/INR, crude oil, gold price |
| RBI Website | Web scraping | Official policy rates, announcements, MPC decisions |
| SEBI Website | Web scraping | Insider trading disclosures, bulk deals, block deals |

---

## Database Schema

All tables stored in Neon PostgreSQL.

```sql
-- User profile and authentication
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  pin_hash VARCHAR(255) NOT NULL,
  language VARCHAR(10) DEFAULT 'english', -- 'english' or 'hindi'
  theme VARCHAR(10) DEFAULT 'dark',        -- 'dark' or 'light'
  created_at TIMESTAMP DEFAULT NOW()
);

-- User personalization preferences
CREATE TABLE user_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  trading_style VARCHAR(50) DEFAULT 'all',     -- 'intraday', 'swing', 'investing', 'all'
  risk_appetite VARCHAR(20) DEFAULT 'moderate', -- 'conservative', 'moderate', 'aggressive'
  min_confidence INTEGER DEFAULT 60,            -- Only show calls above this %
  focus_sectors TEXT[],                         -- e.g. ['banking', 'it', 'pharma']
  notifications_enabled BOOLEAN DEFAULT TRUE,
  briefing_auto BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User's watchlist
CREATE TABLE watchlist (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  ticker VARCHAR(20) NOT NULL,              -- e.g. 'RELIANCE.NS'
  company_name VARCHAR(100),
  added_at TIMESTAMP DEFAULT NOW()
);

-- AI chat conversation history
CREATE TABLE chat_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  session_id VARCHAR(50),
  role VARCHAR(10) NOT NULL,               -- 'user' or 'assistant'
  content TEXT NOT NULL,
  language VARCHAR(10) DEFAULT 'english',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Every AI prediction logged here
CREATE TABLE predictions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  ticker VARCHAR(20),
  company_name VARCHAR(100),
  verdict VARCHAR(20) NOT NULL,            -- 'STRONG_BUY', 'BUY', 'HOLD', 'AVOID'
  confidence INTEGER NOT NULL,             -- 0-100
  signal_stack_score INTEGER,              -- 0-5
  reasoning TEXT,
  sources TEXT[],
  risk_factors TEXT,
  potential_gain_pct DECIMAL,
  potential_loss_pct DECIMAL,
  predicted_at TIMESTAMP DEFAULT NOW(),
  market_price_at_prediction DECIMAL,
  timeframe VARCHAR(20)                    -- 'intraday', 'swing', 'short_term'
);

-- Post-market accuracy check results
CREATE TABLE accuracy_log (
  id SERIAL PRIMARY KEY,
  prediction_id INTEGER REFERENCES predictions(id),
  actual_close_price DECIMAL,
  actual_change_pct DECIMAL,
  was_correct BOOLEAN,
  checked_at TIMESTAMP DEFAULT NOW(),
  notes TEXT
);

-- Saved morning briefing reports
CREATE TABLE briefings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  content TEXT NOT NULL,
  top_picks TEXT[],
  market_mood VARCHAR(20),                 -- 'bullish', 'bearish', 'neutral'
  fii_net_flow DECIMAL,
  generated_at TIMESTAMP DEFAULT NOW()
);

-- Browser push notification subscriptions
CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Alert rules set by user
CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  ticker VARCHAR(20),
  alert_type VARCHAR(30),                  -- 'price_above', 'price_below', 'news_catalyst', 'conviction_call'
  threshold_value DECIMAL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  last_triggered_at TIMESTAMP
);
```

---

## Phase 1
### Project Setup & Foundation
**Goal:** Working repository with all base configuration, frontend skeleton, backend skeleton, database connected.
**Estimated Size:** Small
**Tests:** App loads in browser, database connects, API health check passes.

#### Tasks
- [ ] Initialize monorepo structure:
  ```
  billionaire-ai/
  ├── frontend/          (React + Vite)
  ├── backend/           (Node.js + Express)
  ├── data-service/      (Python + FastAPI)
  ├── plan.md
  └── README.md
  ```
- [ ] Frontend setup:
  - Create React + Vite + TypeScript project
  - Install Tailwind CSS, shadcn/ui, wouter, lucide-react, Recharts
  - Configure `vite.config.ts` to run on `0.0.0.0:5000` (Replit proxy requirement)
  - Set `server.allowedHosts: true` in Vite config
  - Create base `index.css` with dark/light CSS variables (no red placeholders)
  - Setup ThemeProvider with dark/light toggle, saved to localStorage
  - Setup wouter Router in `App.tsx` with all routes registered (pages stubbed)
- [ ] Backend setup:
  - Create Node.js + Express project on port `3001`
  - Install: `express`, `cors`, `dotenv`, `drizzle-orm`, `@neondatabase/serverless`, `web-push`, `node-cron`
  - Create `/api/health` endpoint returning `{ status: 'ok' }`
  - Setup Drizzle ORM connected to Neon PostgreSQL
  - Run all database migrations (create all tables from schema above)
- [ ] Python data service setup:
  - Create FastAPI project on port `8000`
  - Install: `fastapi`, `uvicorn`, `yfinance`, `requests`, `beautifulsoup4`, `praw`, `pytrends`, `feedparser`, `alpha_vantage`
  - Create `/health` endpoint
- [ ] Environment variables setup:
  - `GEMINI_API_KEY` — Google Gemini API key
  - `NEON_DATABASE_URL` — Neon PostgreSQL connection string
  - `NEWS_API_KEY` — NewsAPI.org free key
  - `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` — Reddit API credentials
  - `ALPHA_VANTAGE_KEY` — Alpha Vantage free key
  - `YOUTUBE_API_KEY` — YouTube Data API v3 free key
  - `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` — Web Push keys (generate once)
- [ ] PIN authentication:
  - Simple PIN setup screen on first launch
  - PIN stored as bcrypt hash in `users` table
  - Session token stored in localStorage (no JWT complexity needed in Phase 1)
  - All routes behind PIN check middleware

**Completion Check:** Open app → PIN screen appears → enter PIN → dashboard skeleton loads → no console errors.

---

## Phase 2
### Data Engine — Market Data
**Goal:** Python data service can fetch live NSE/BSE market data and expose it via clean API endpoints.
**Estimated Size:** Small-Medium
**Tests:** Call each endpoint and verify real data returns.

#### Tasks
- [ ] yfinance endpoints in Python FastAPI:
  - `GET /market/quote?ticker=RELIANCE.NS` — live price, change%, volume
  - `GET /market/indices` — Nifty 50, Sensex, Bank Nifty (live)
  - `GET /market/history?ticker=RELIANCE.NS&period=1mo&interval=1d` — OHLCV history
  - `GET /market/fundamentals?ticker=RELIANCE.NS` — P/E, market cap, EPS, promoter%, 52W high/low
  - `GET /market/earnings?ticker=RELIANCE.NS` — earnings history, next results date
  - `GET /market/intraday?ticker=RELIANCE.NS&interval=15m` — 15-minute candles
- [ ] NSE India scraper:
  - `GET /nse/fii-dii` — Today's FII and DII net buy/sell in ₹ crores
  - `GET /nse/options?ticker=RELIANCE` — Options chain, Put/Call ratio
  - `GET /nse/top-movers` — Top gainers and losers today
  - `GET /nse/circuit-stocks` — Stocks hitting upper/lower circuit
- [ ] Alpha Vantage endpoints:
  - `GET /technical/rsi?ticker=RELIANCE.NS` — RSI value + overbought/oversold signal
  - `GET /technical/macd?ticker=RELIANCE.NS` — MACD value + trend signal
  - `GET /technical/bollinger?ticker=RELIANCE.NS` — Bollinger Bands
- [ ] Screener.in scraper:
  - `GET /screener/fundamentals?ticker=RELIANCE` — 10-year financial data, peer comparison
- [ ] Investing.com scraper:
  - `GET /macro/commodities` — Crude oil price, Gold price
  - `GET /macro/sgx-nifty` — SGX Nifty pre-market value
  - `GET /macro/forex` — USD/INR, EUR/INR
- [ ] Data caching layer:
  - Cache each endpoint response in memory for 5 minutes
  - Prevents hitting rate limits and speeds up responses
- [ ] Node.js backend proxy:
  - Backend forwards market data requests to Python service
  - Frontend only talks to Node.js backend (single origin)

**Completion Check:** `GET /market/indices` returns real Nifty 50, Sensex, Bank Nifty values. `GET /nse/fii-dii` returns today's FII/DII numbers.

---

## Phase 3
### News & Sentiment Engine
**Goal:** System can fetch, parse, and sentiment-tag news and social data for any stock.
**Estimated Size:** Small-Medium
**Tests:** Search news for "HDFC Bank" and get back recent articles with sentiment tags.

#### Tasks
- [ ] NewsAPI integration:
  - `GET /news/search?q=HDFC+Bank&from=24h` — last 24hr news, returns headline + summary + url + source
  - Results cached for 15 minutes per query
- [ ] RSS Feed parser (using `feedparser`):
  - `GET /news/feed?source=et` — Economic Times latest articles
  - `GET /news/feed?source=mc` — Moneycontrol latest articles
  - `GET /news/feed?source=mint` — LiveMint latest articles
  - `GET /news/feed?source=bs` — Business Standard latest articles
  - Combine all feeds into single `/news/india-market` endpoint
- [ ] Google News scraper:
  - `GET /news/google?q=Reliance+Industries&hours=1` — breaking news last 1 hour
- [ ] Reddit sentiment:
  - `GET /sentiment/reddit?ticker=HDFCBANK` — searches r/IndiaInvestments + r/IndianStreetBets for ticker mentions
  - Returns: mention count, positive count, negative count, top 3 comments
- [ ] Twitter/X scraper:
  - `GET /sentiment/twitter?query=HDFCBANK` — scrapes public profile tweets of top Indian market analysts
  - Returns: tweet texts + timestamps (last 10 relevant tweets)
  - Target profiles (public, no login needed): @Nifty50India type handles and major Indian market analyst accounts
- [ ] YouTube sentiment:
  - `GET /sentiment/youtube?ticker=HDFC+Bank` — searches recent videos mentioning the stock
  - Returns: video titles, view counts, channel names, publish dates
- [ ] Google Trends:
  - `GET /sentiment/trends?ticker=HDFCBANK` — interest over last 7 days for this search term
  - Returns: trend direction (rising/falling/stable) + peak interest score
- [ ] AI Sentiment Tagging:
  - Each news article passed through Gemini with prompt: classify as POSITIVE/NEGATIVE/NEUTRAL for the stock
  - Returns tagged articles array

**Completion Check:** Call `/news/search?q=Tata+Motors` and get back 5+ recent news articles with POSITIVE/NEGATIVE/NEUTRAL tags.

---

## Phase 4
### AI Brain Integration
**Goal:** Gemini 2.5 Flash connected to all data sources. AI can generate full stock analysis on demand.
**Estimated Size:** Medium
**Tests:** Ask AI "Analyze RELIANCE.NS" and receive a structured response with verdict, reasoning, and signal stack.

#### Tasks
- [ ] Gemini API setup in Node.js backend:
  - Install `@google/generative-ai`
  - Initialize Gemini 2.5 Flash with API key
  - Enable web search grounding (Gemini's built-in search)
- [ ] Data aggregator function:
  - `aggregateStockData(ticker)` — calls all Phase 2 + Phase 3 endpoints in parallel, combines results into one object
  - Runs all fetches simultaneously using `Promise.all()` for speed
- [ ] Signal Stack calculator:
  - Input: aggregated stock data
  - Evaluates 5 independent signals:
    1. **Technical Signal** — RSI + MACD + trend direction (bullish/bearish/neutral)
    2. **Fundamental Signal** — P/E vs sector average, promoter holding trend, earnings beat/miss
    3. **News Sentiment Signal** — majority of news positive/negative in last 24h
    4. **Social Signal** — Reddit + Twitter/X net sentiment
    5. **Institutional Signal** — FII/DII activity for stock's sector
  - Returns: score 0–5 and each signal's verdict
- [ ] Confidence Calculator:
  - Maps Signal Stack score to confidence %:
    - 5/5 signals agree → 90–100%
    - 4/5 → 75–89%
    - 3/5 → 60–74%
    - 2/5 → 40–59%
    - 0–1/5 → below 40%
  - Also factors in: news severity, FII flow size, RSI extremes
- [ ] AI Analysis Prompt Template:
  ```
  You are Billionaire AI — a professional Indian stock market analyst.
  You have the following real data for [TICKER]:
  [AGGREGATED DATA BLOCK]
  Signal Stack Score: [X]/5
  Signals: [Technical: BULLISH, Fundamental: NEUTRAL, News: POSITIVE, Social: BULLISH, Institutional: BULLISH]
  
  Generate a complete stock analysis in [HINDI/ENGLISH] with this exact structure:
  1. VERDICT: [STRONG BUY / BUY / HOLD / AVOID]
  2. CONFIDENCE: [X]%
  3. CONVICTION MESSAGE: [only if 90%+: "Write this down. High conviction call."]
  4. REASONING: [3-5 clear points explaining the verdict]
  5. SIGNAL STACK: [explain each signal briefly]
  6. RISK FACTORS: [why this could go wrong — "Why It Could Fail"]
  7. RISK-REWARD: [Potential gain: X%, Potential loss: Y%, Ratio: Z]
  8. SOURCES: [list all data sources used]
  
  Be direct. Be honest. Show your reasoning. Never fabricate data.
  ```
- [ ] POST `/api/analyze` endpoint:
  - Input: `{ ticker, language }`
  - Runs aggregateStockData → Signal Stack → Confidence → Gemini prompt
  - Streams response back to frontend (token by token)
  - Saves prediction to `predictions` table in Neon DB
- [ ] POST `/api/chat` endpoint:
  - Input: `{ message, sessionId, language, chatHistory }`
  - AI has context of last 10 messages + full current market data
  - Gemini decides what data to fetch based on the question
  - Streams response back
  - Saves to `chat_history` table
- [ ] Chart analysis function:
  - `GET /api/chart-analysis?ticker=RELIANCE.NS&timeframe=1mo`
  - Fetches OHLCV data → passes to Gemini with prompt asking for pattern identification
  - Gemini explains: trend, support/resistance levels, chart pattern name, what it suggests

**Completion Check:** `POST /api/analyze` with `{ ticker: "RELIANCE.NS", language: "english" }` returns a streaming response with VERDICT, CONFIDENCE %, REASONING, SIGNAL STACK, and SOURCES.

---

## Phase 5
### Core UI — Command Center + AI Chat
**Goal:** Fully functional dashboard and chat interface. The two most-used screens of the app.
**Estimated Size:** Medium
**Tests:** Dashboard shows live data. Chat responds to questions with streaming AI responses.

#### Tasks
- [ ] PIN Authentication Screen (`/login`):
  - Clean PIN entry UI (4–6 digit)
  - On first launch: PIN setup flow
  - On subsequent launches: PIN verify
  - Dark/light theme works on this screen too
- [ ] App shell:
  - Persistent sidebar with navigation links to all screens
  - Active route highlighted
  - Language toggle (Hindi/English) in header — persists via user preferences in DB
  - Dark/Light theme toggle in header
  - Sidebar collapses on mobile (hamburger menu)
- [ ] Command Center (`/`):
  - **Market Indices Bar:** Nifty 50, Sensex, Bank Nifty — live price + % change, color-coded green/red
  - **Market Mood Widget:** Bullish/Bearish/Neutral badge + one-sentence reason (AI generated)
  - **FII/DII Widget:** Net flow today in ₹ crores — FII [+₹3,240 Cr] DII [-₹1,100 Cr]
  - **Top 3 Conviction Calls Widget:** Today's top picks with confidence % badge
  - **Macro Snapshot:** USD/INR, Crude Oil, Gold — with arrow indicating direction
  - **Live News Ticker:** Scrolling headline bar at bottom of page, auto-updates every 2 minutes
  - **Sector Heat Map:** Color-coded sectors (green = gaining, red = falling)
  - All data fetches on page load, shows loading skeletons while fetching
- [ ] AI Research Chat (`/chat`):
  - Chat message list with user bubbles (right) and AI bubbles (left)
  - AI response streams word-by-word (typewriter effect using SSE or streaming fetch)
  - Each AI response includes collapsible "Sources" section (closed by default, click to expand)
  - Signal Stack shown as visual bar (5 dots, filled = signal agrees)
  - Confidence shown as colored badge (green/amber/orange/red based on %)
  - Input box at bottom with send button + voice input button (optional)
  - "New Chat" button to start fresh session
  - Chat history list in sidebar showing past sessions
  - Language toggle affects AI response language immediately
  - Example prompt chips shown on empty state: "Top stocks today", "Nifty outlook", "Analyse HDFC Bank"

**Completion Check:** Open app → PIN → dashboard shows real Nifty value, real FII/DII data, real news. Go to chat → type "Should I buy Reliance today?" → AI streams back a full analysis with verdict and sources.

---

## Phase 6
### Stock Deep Dive + Morning Briefing
**Goal:** Complete stock analysis page and on-demand morning briefing.
**Estimated Size:** Medium
**Tests:** Enter any NSE ticker, get full report. Click "Generate Briefing" and receive a complete morning report.

#### Tasks
- [ ] Stock Deep Dive (`/stock/:ticker`):
  - Ticker search bar at top — type any NSE stock name or symbol
  - **Header section:** Company name, current price, % change, volume, market cap
  - **Technical Analysis section:**
    - Mini price chart (Recharts LineChart — 1M default, tabs for 1W/1M/3M/1Y)
    - RSI gauge — visual dial showing overbought (>70) / oversold (<30) / neutral
    - MACD indicator — bullish/bearish label
    - Trend direction: Uptrend / Downtrend / Sideways
    - Support level: ₹X | Resistance level: ₹Y
    - Chart pattern detected: e.g. "Bull Flag", "Double Bottom", "Head & Shoulders"
    - Chart pattern explanation in plain language
  - **Fundamental section:**
    - P/E ratio vs sector average
    - 52-week high / low with current position
    - Promoter holding % + trend (increasing/decreasing — from SEBI data)
    - Last 4 quarters earnings (beat/miss each time)
    - Debt-to-equity ratio
    - Revenue and profit trend (mini bar chart)
  - **News section:**
    - Last 10 news articles about this stock
    - Each article: headline + source + time + POSITIVE/NEGATIVE/NEUTRAL tag
    - Color coded badge on each article
  - **Social Sentiment section:**
    - Reddit: Mention count + net sentiment bar + top comment excerpt
    - Twitter/X: Top 3 analyst tweets about this stock
    - YouTube: Top 2 recent video titles mentioning this stock
    - Google Trends: Search interest graph (7-day sparkline)
  - **Institutional Activity section:**
    - FII net activity in this stock's sector (last 5 days)
    - Options Put/Call ratio — what smart money is betting
    - Promoter recent bulk deals (from SEBI)
  - **Signal Stack section:**
    - 5 signal rows: Technical | Fundamental | News | Social | Institutional
    - Each row: signal name + BULLISH/BEARISH/NEUTRAL badge
    - Overall score: X/5 signals agree
  - **AI Verdict section (most prominent):**
    - Large VERDICT badge: STRONG BUY / BUY / HOLD / AVOID
    - Confidence % as large number
    - Conviction message if 90%+: "Write this down."
    - Risk-Reward: "Potential gain: 12% | Potential loss: 5% | Ratio: 2.4x"
    - "Why It Could Fail" collapsible section
    - Full AI reasoning (3–5 bullet points)
    - Sources list (numbered, all clickable)
  - **Save Prediction button:** Saves to `predictions` table for accuracy tracking
- [ ] Morning Briefing (`/briefing`):
  - Hero header: "Morning Briefing" + date + time generated
  - **Generate Briefing button** (manual trigger — user clicks when they want it)
  - Shows loading state while generating (takes 15–30 seconds, animated)
  - **Briefing sections (AI generated):**
    1. Global Overnight Summary — US markets close prices, what happened
    2. SGX Nifty Signal — pre-market India direction
    3. Overnight News That Matters — 3 most impactful overnight stories
    4. Today's Market Mood — Bullish/Bearish/Neutral + reason
    5. Today's FII/DII Expectation
    6. Top 10 Stocks to Watch Today — each with 2-line reason + conviction %
    7. Sector Focus of the Day — which sector looks strongest
    8. Today's Risk Factors — what could go wrong today
    9. Key Levels to Watch — Nifty support/resistance today
  - Save briefing to DB → accessible from `/history`
  - Past briefings listed at bottom of page (date + market mood badge)
- [ ] Chart Image Upload (bonus feature in this phase):
  - Upload chart screenshot button on Stock Deep Dive page
  - Image sent to Gemini Vision
  - Gemini visually analyzes the chart image and returns pattern description
  - Displayed below the data-driven analysis

**Completion Check:** Enter "TCS" in stock search → full report loads with real data in all sections → AI verdict shows at bottom. Click "Generate Briefing" → 15–30 seconds → complete morning report appears.

---

## Phase 7
### Watchlist, Accuracy Tracker, Push Notifications
**Goal:** User can track stocks, review prediction history, and receive browser alerts.
**Estimated Size:** Small-Medium
**Tests:** Add a stock to watchlist → it appears with live data. A past prediction shows in accuracy log.

#### Tasks
- [ ] Watchlist (`/watchlist`):
  - Search and add any NSE stock
  - Each watchlist item shows:
    - Company name + ticker
    - Current price + % change
    - Sentiment Pulse: 🟢 Positive / 🟡 Neutral / 🔴 Negative (from news + social)
    - "Deep Dive" button → navigates to `/stock/:ticker`
  - Remove stock from watchlist
  - Watchlist persisted in `watchlist` table in Neon DB
  - Data refreshes every 5 minutes automatically
- [ ] Accuracy Tracker (`/accuracy`):
  - Shows every saved prediction from `predictions` table
  - Each row: ticker + verdict + confidence % + predicted price + date
  - After market close, system fetches actual close price and marks Hit ✅ or Miss ❌
  - **Statistics section at top:**
    - Overall accuracy % (all time)
    - Accuracy last 7 days
    - Accuracy last 30 days
    - Best performing signal types
    - Sectors with highest accuracy
  - Charts: accuracy trend over time (Recharts LineChart)
  - Filter by: All / Hits / Misses / Date range / Ticker
- [ ] Post-market checker (automated):
  - Node.js cron job runs at 4:30 PM IST on market days
  - Fetches all predictions from that day with no accuracy result
  - Gets actual closing prices via yfinance
  - Determines if prediction was correct (if BUY and price closed higher → correct)
  - Updates `accuracy_log` table
- [ ] Browser Push Notifications:
  - On first visit after login: prompt user to enable notifications
  - Store push subscription in `push_subscriptions` table
  - Triggers for sending notifications:
    - Breaking news detected for a watchlist stock
    - Nifty 50 drops/rises more than 1% in a session
    - A High Conviction call (90%+) is generated
    - FII activity is unusually large (>₹5000 Cr in a single direction)
  - Notification includes: title + body + click-to-open link

**Completion Check:** Add HDFC Bank to watchlist → see live price and sentiment. View accuracy log and see past predictions with hit/miss status.

---

## Phase 8
### Advanced Features — Macro Pulse, Sector Radar, Event Calendar
**Goal:** Complete remaining screens and advanced analytical features.
**Estimated Size:** Medium
**Tests:** Macro Pulse shows real commodity prices. Event Calendar shows upcoming RBI date.

#### Tasks
- [ ] Macro Pulse (`/macro`):
  - **Live Macro Data panel:**
    - USD/INR current rate + 7-day chart
    - Crude Oil (Brent) price in USD + 7-day chart
    - Gold price in USD/INR + 7-day chart
    - US 10-year Treasury yield
    - VIX India (fear index)
  - **AI Impact Analysis (auto-generated):**
    - "USD/INR at ₹84.2 — IT companies (TCS, Infosys, Wipro) benefit as they earn in USD. Import-dependent sectors (Oil marketing companies) face margin pressure."
    - "Crude at $87/barrel — ONGC, Oil India may benefit. HPCL, BPCL under pressure. Aviation stocks (IndiGo, Air India) face higher fuel costs."
    - Updates whenever user opens the page
  - **Rupee Impact Analyzer:**
    - Enter any % change in USD/INR → AI calculates which sectors and stocks benefit or suffer
  - **Global Market Status:**
    - US Markets: Dow Jones, S&P 500, Nasdaq (last close + % change)
    - Asian Markets: Nikkei, Hang Seng, Shanghai
    - SGX Nifty: pre-market Indian direction
- [ ] Sector Radar (`/sectors`):
  - **Sector Heat Map:**
    - Visual grid of all NSE sectors
    - Color intensity shows sector performance today (deep green = strong, deep red = weak)
    - Click any sector → shows top 5 stocks in that sector
  - **FII Sector Flow:**
    - Which sectors are getting FII inflows today
    - Which sectors are seeing outflows
    - Bar chart visualization
  - **Sector Rotation Signal:**
    - AI detects if money is rotating between sectors
    - Example: "Capital is rotating from IT → Banking. Banking sector stocks may see momentum in the next 2–5 days."
  - **Top Stocks per Sector:**
    - Each sector card shows top 3 stocks by performance today
- [ ] Event Calendar (`/calendar`):
  - Calendar view with upcoming market-moving events
  - **Event types:**
    - RBI MPC meeting dates (scraped from RBI website)
    - US Federal Reserve meeting dates
    - Quarterly earnings dates for Nifty 50 stocks (next 30 days)
    - NSE/BSE market holidays
    - Union Budget date
  - Click any event → AI generates pre-event analysis
  - Example: "RBI MPC meeting in 3 days. Current repo rate: 6.5%. Market expectation: No change. If surprise cut → Banking + Real Estate stocks may rally sharply."
- [ ] Research Log / History (`/history`):
  - All past AI chat sessions listed by date
  - All past morning briefings
  - All past stock deep dive analyses (if saved)
  - Full text search across all history
  - Click any item → reopens that session/report
- [ ] Settings (`/settings`):
  - **Profile section:** Change PIN
  - **AI Behavior:**
    - Default language: Hindi / English
    - Response style: Brief / Detailed
    - Minimum confidence to show (slider: 40%–90%)
  - **Trading preferences:**
    - Trading style: Intraday / Swing / Investing / All
    - Risk appetite: Conservative / Moderate / Aggressive
    - Preferred sectors (multi-select)
  - **Notifications:** Toggle on/off per notification type
  - **Dashboard:** Choose which widgets to display on Command Center
  - All settings saved to `user_preferences` table in Neon DB

**Completion Check:** Macro Pulse shows real USD/INR and crude oil prices with AI impact analysis. Sector Radar shows colored heat map. Event Calendar shows at least 3 upcoming events.

---

## Phase 9
### SaaS Preparation (Future — When Ready to Go Public)
**Goal:** Multi-user system with subscriptions. Only build when you decide to open to public.
**Estimated Size:** Large
**Tests:** Two separate user accounts can log in with different data.

#### Tasks
- [ ] Replace PIN auth with proper email + password auth (or Google OAuth)
- [ ] Multi-user data isolation (all DB queries scoped to userId)
- [ ] Subscription tier system:
  - **Free tier:** 5 AI analyses per day, no alerts, basic watchlist (5 stocks)
  - **Pro tier:** Unlimited analyses, push alerts, unlimited watchlist, morning briefing
  - **Elite tier:** Everything + priority AI, historical pattern matching, advanced analytics
- [ ] Payment integration (Razorpay for India)
- [ ] Usage tracking and rate limiting per tier
- [ ] Admin dashboard to view users, usage, and revenue
- [ ] Onboarding flow for new users
- [ ] Terms of service, disclaimer, privacy policy pages
- [ ] Mobile app (React Native / Expo) — separate project

---

## Confidence System

| Signal Stack Score | Confidence % | AI Message | UI Color |
|-------------------|-------------|-----------|----------|
| 5/5 signals agree | 90–100% | "Write this down. High conviction call." | Bright Green |
| 4/5 signals agree | 75–89% | "Strong Buy — multiple signals agree." | Green |
| 3/5 signals agree | 60–74% | "Likely positive — proceed with caution." | Amber |
| 2/5 signals agree | 40–59% | "Speculative — small position only." | Orange |
| 0–1/5 signals agree | Below 40% | "Avoid — signals are mixed or weak." | Red |

---

## Signal Stack Logic

The Signal Stack evaluates 5 completely independent signals. A STRONG BUY requires most signals to independently agree.

### Signal 1: Technical Signal
- **Source:** Alpha Vantage RSI, MACD + yfinance price history
- **BULLISH if:** RSI 40–65 (not overbought), MACD positive crossover, price above 20-day EMA
- **BEARISH if:** RSI >75 (overbought) or <30 (extreme fear), MACD negative, price below EMA
- **NEUTRAL otherwise**

### Signal 2: Fundamental Signal
- **Source:** yfinance + Screener.in
- **BULLISH if:** P/E below sector average AND promoter holding increasing AND last 2 quarters earnings beat
- **BEARISH if:** P/E significantly above sector average OR promoter selling large stake
- **NEUTRAL otherwise**

### Signal 3: News Sentiment Signal
- **Source:** NewsAPI + RSS feeds + Google News (last 24 hours)
- **BULLISH if:** 70%+ of news articles tagged POSITIVE by Gemini
- **BEARISH if:** 70%+ of news articles tagged NEGATIVE
- **NEUTRAL otherwise**

### Signal 4: Social Sentiment Signal
- **Source:** Reddit + Twitter/X + Google Trends
- **BULLISH if:** Reddit net positive mentions >60% AND Google Trends rising
- **BEARISH if:** Reddit net negative >60% OR sudden negative spike on Twitter/X
- **NEUTRAL otherwise**

### Signal 5: Institutional Signal
- **Source:** NSE FII/DII data + SEBI bulk deals
- **BULLISH if:** FII are net buyers in this sector for last 3 days OR recent promoter buying
- **BEARISH if:** FII net sellers for 3+ consecutive days OR large promoter sell-off
- **NEUTRAL otherwise**

---

## Screen Map

| Screen | Route | Primary Data Source | API Endpoints Used |
|--------|-------|--------------------|--------------------|
| Command Center | `/` | All | `/market/indices`, `/nse/fii-dii`, `/news/india-market`, `/nse/top-movers` |
| AI Chat | `/chat` | Gemini + All | `POST /api/chat` |
| Stock Deep Dive | `/stock/:ticker` | All | `POST /api/analyze`, `/market/quote`, `/market/fundamentals`, `/technical/*`, `/news/search`, `/sentiment/*`, `/nse/options` |
| Morning Briefing | `/briefing` | Gemini + All | `POST /api/briefing` |
| Watchlist | `/watchlist` | yfinance + News | `/market/quote`, `/news/search` |
| Sector Radar | `/sectors` | NSE + AI | `/nse/sectors`, `POST /api/sector-analysis` |
| Macro Pulse | `/macro` | Investing.com + AI | `/macro/commodities`, `/macro/forex`, `/macro/sgx-nifty`, `POST /api/macro-analysis` |
| Accuracy Tracker | `/accuracy` | Neon DB | `GET /api/predictions`, `GET /api/accuracy-stats` |
| Event Calendar | `/calendar` | RBI/NSE scraper + AI | `GET /api/events`, `POST /api/event-analysis` |
| Research Log | `/history` | Neon DB | `GET /api/chat-history`, `GET /api/briefings` |
| Settings | `/settings` | Neon DB | `GET/PUT /api/preferences` |
| Login | `/login` | Neon DB | `POST /api/auth/verify-pin` |

---

## API Keys Required (All Free)

| Key | Where to Get | Cost |
|-----|-------------|------|
| `GEMINI_API_KEY` | aistudio.google.com → Create API Key | ₹0 |
| `NEON_DATABASE_URL` | neon.tech → New Project → Connection String | ₹0 |
| `NEWS_API_KEY` | newsapi.org → Register → Free key | ₹0 |
| `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` | reddit.com/prefs/apps → Create app | ₹0 |
| `ALPHA_VANTAGE_KEY` | alphavantage.co → Get free API key | ₹0 |
| `YOUTUBE_API_KEY` | console.cloud.google.com → YouTube Data API v3 | ₹0 |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | Generate locally: `npx web-push generate-vapid-keys` | ₹0 |

**Total cost to launch and run Phase 1–8: ₹0**

---

## Important Notes for Any Developer Reading This

1. **Frontend always runs on `0.0.0.0:5000`** — Replit proxies this. Never use `localhost` as the host in Vite config.
2. **Backend runs on `localhost:3001`** — internal only, never exposed directly.
3. **Python data service runs on `localhost:8000`** — internal only, called only by the Node.js backend.
4. **Frontend never calls Python service directly** — always goes through Node.js backend.
5. **Never store secrets in code** — all API keys in environment variables only.
6. **Cache aggressively** — yfinance and scraping calls should be cached 5–15 minutes to avoid rate limits.
7. **All AI responses stream** — use Server-Sent Events (SSE) or streaming fetch for chat and analysis endpoints.
8. **Accuracy logging is automatic** — cron job at 4:30 PM IST on weekdays, no user action needed.
9. **Language toggle is instant** — stored in user preferences in Neon DB, applied to all subsequent AI calls.
10. **Data disclaimer** — every analysis screen must show: "For informational purposes only. Not financial advice."

---

*This roadmap was created through a deep planning session. Every decision in this document has been discussed and confirmed. Build phase by phase, test after each phase before proceeding.*

*Last updated: Phase plan finalized, ready to build.*
