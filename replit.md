# Billionaire AI

> "Research like a hedge fund. Trade like a billionaire."

A personal AI-powered trading assistant for Indian markets (NSE/BSE). Performs deep multi-source research, analyzes market data, and delivers probability-based stock predictions with full reasoning and verified sources.

## Architecture

Three services run concurrently:

| Service | Port | Tech | Purpose |
|---------|------|------|---------|
| Frontend | 5000 | React + Vite + TypeScript + Tailwind | UI — Command Center, Chat, Deep Dive |
| Backend API | 3001 | Node.js + Express + Drizzle ORM | API layer, AI routing, DB access |
| Data Service | 8000 | Python + FastAPI | Market data, news, sentiment scraping |

The frontend proxies all `/api/*` requests to the backend (port 3001), which in turn proxies data requests to the Python service (port 8000).

## AI Models (via NVIDIA API)

- **openai/gpt-oss-120b** — Primary brain: deep analysis, Signal Stack, Morning Briefing
- **google/gemma-4-31b-it** — Fast fallback: news sentiment tagging, quick chat
- **google/paligemma** — Chart image analysis (multimodal)

## Required Secrets

Set these in Replit Secrets (Tools → Secrets):

| Secret | Purpose |
|--------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `NVIDIA_API_KEY` | NVIDIA NIM API (covers all 3 models) |
| `NEWS_API_KEY` | NewsAPI.org |
| `ALPHA_VANTAGE_KEY` | Technical indicators |
| `YOUTUBE_API_KEY` | YouTube Data API v3 |
| `REDDIT_CLIENT_ID` | Reddit PRAW |
| `REDDIT_CLIENT_SECRET` | Reddit PRAW |
| `VAPID_PUBLIC_KEY` | Web push notifications |
| `VAPID_PRIVATE_KEY` | Web push notifications |
| `SESSION_SECRET` | Express session signing |

## Development Plan

Full roadmap is in `plan.md`. 9 phases total:
- **Phase 1** — Project Setup & Foundation (complete)
- **Phase 2** — Data Engine (Market Data)
- **Phase 3** — News & Sentiment Engine
- **Phase 4** — AI Brain Integration
- **Phase 5** — Core UI (Command Center + Chat)
- **Phase 6** — Stock Deep Dive + Morning Briefing
- **Phase 7** — Watchlist, Accuracy Tracker, Alerts
- **Phase 8** — Advanced Features
- **Phase 9** — SaaS Preparation

## User Preferences

- Language: English / Hindi (Hinglish) toggle
- AI persona: Professional analyst, not an assistant — blunt, data-backed, no hype
- Personal use in Phases 1–3, public SaaS from Phase 7+
- All API costs: ₹0 (free tier only)
