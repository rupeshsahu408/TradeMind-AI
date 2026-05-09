# Billionaire AI

> **"Research like a hedge fund. Trade like a billionaire."**

A personal AI-powered trading assistant for the Indian stock market (NSE/BSE). Researches 15+ data sources simultaneously, evaluates a 5-signal Signal Stack, and delivers probability-based verdicts with full reasoning — like a senior proprietary trader.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | Node.js + Express + Drizzle ORM |
| Data Service | Python + FastAPI |
| Database | Neon PostgreSQL |
| AI | NVIDIA NIM API (gpt-oss-120b, gemma-4-31b-it, paligemma) |

---

## Project Structure

```
billionaire-ai/
├── frontend/          React + Vite frontend (port 5000)
├── backend/           Node.js + Express API (port 3001)
├── data-service/      Python + FastAPI data service (port 8000)
├── .env.example       Environment variables template
├── SECRETS.md         API keys reference
└── plan.md            Full development roadmap
```

---

## Setup

### 1. Clone and configure environment
```bash
cp .env.example .env
# Fill in all values in .env
```

### 2. Install dependencies
```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install

# Python data service
cd data-service && pip install -r requirements.txt
```

### 3. Run database migrations
```bash
cd backend && node db/migrate.js
```

### 4. Start all services

**Backend (Terminal 1):**
```bash
cd backend && npm run dev
```

**Data service (Terminal 2):**
```bash
cd data-service && python main.py
```

**Frontend (Terminal 3):**
```bash
cd frontend && npm run dev
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `NVIDIA_API_KEY` | NVIDIA NIM API key (build.nvidia.com) |
| `NEWS_API_KEY` | NewsAPI.org free key |
| `ALPHA_VANTAGE_KEY` | Alpha Vantage free key |
| `REDDIT_CLIENT_ID` | Reddit API (pending approval) |
| `REDDIT_CLIENT_SECRET` | Reddit API (pending approval) |
| `YOUTUBE_API_KEY` | YouTube Data API v3 |
| `VAPID_PUBLIC_KEY` | Web push VAPID key |
| `VAPID_PRIVATE_KEY` | Web push VAPID key |
| `SESSION_SECRET` | Random 32-char secret |

---

## Development Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 — Foundation | ✅ Complete | Monorepo, auth, DB, all routes stubbed |
| 2 — Data Engine | ⏳ Next | yfinance, NSE scraping, Alpha Vantage |
| 3 — News & Sentiment | ⏳ | NewsAPI, RSS, Reddit, Twitter, YouTube, Google Trends |
| 4 — AI Brain | ⏳ | NVIDIA API, Signal Stack, /api/analyze, /api/chat |
| 5 — Core UI | ⏳ | Dashboard live data, streaming chat |
| 6 — Deep Dive + Briefing | ⏳ | Stock page, morning briefing |
| 7 — Watchlist + Accuracy | ⏳ | Watchlist, accuracy tracker, push notifications |
| 8 — Advanced Features | ⏳ | Macro, sectors, calendar, history, settings |
| 9 — SaaS Prep | ⏳ | Multi-user, subscriptions, Razorpay |

---

## Health Checks

```bash
curl http://localhost:3001/api/health   # Backend
curl http://localhost:8000/health       # Python data service
```

---

## Deployment

- **Frontend** → Vercel (connect GitHub repo, set root to `frontend/`)
- **Backend** → Railway / Render (Node.js, root `backend/`, `npm run start`)
- **Data Service** → Railway / Render (Python, root `data-service/`, `python main.py`)
- **Database** → Neon.tech (already configured)

Set all environment variables in each platform's settings.

---

*For informational purposes only. Not financial advice.*
