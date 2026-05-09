import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../backend/.env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from datetime import datetime

from routes.market    import router as market_router
from routes.nse       import router as nse_router
from routes.technical import router as technical_router
from routes.screener  import router as screener_router
from routes.macro     import router as macro_router
from routes.news      import router as news_router
from routes.sentiment import router as sentiment_router

app = FastAPI(
    title="Billionaire AI — Data Service",
    description="Python microservice for NSE/BSE market data, technical indicators, news, and sentiment.",
    version="3.0.0",
)

ALLOWED_ORIGINS = [
    "http://localhost:3001",
    "http://localhost:5000",
    "http://localhost:5173",
]

# Allow any onrender.com subdomain (backend calling data service on Render)
BACKEND_URL = os.environ.get("BACKEND_URL", "")
if BACKEND_URL:
    ALLOWED_ORIGINS.append(BACKEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Register routers ─────────────────────────────────────────────────────────
app.include_router(market_router)
app.include_router(nse_router)
app.include_router(technical_router)
app.include_router(screener_router)
app.include_router(macro_router)
app.include_router(news_router)
app.include_router(sentiment_router)


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    def _ver(mod_name: str) -> str:
        try:
            import importlib
            m = importlib.import_module(mod_name)
            return getattr(m, "__version__", "loaded")
        except Exception:
            return "unavailable"

    return {
        "status":      "ok",
        "service":     "Billionaire AI Data Service",
        "version":     "2.0.0",
        "timestamp":   datetime.utcnow().isoformat() + "Z",
        "python_env":  "ready",
        "phase":       "3 — News & Sentiment Engine",
        "libraries": {
            "yfinance":      _ver("yfinance"),
            "httpx":         _ver("httpx"),
            "beautifulsoup4": _ver("bs4"),
            "feedparser":    _ver("feedparser"),
            "pytrends":      _ver("pytrends"),
            "pandas":        _ver("pandas"),
            "praw":          _ver("praw"),
        },
        "endpoints": {
            "market":    ["/market/quote", "/market/indices", "/market/history",
                          "/market/fundamentals", "/market/earnings", "/market/intraday"],
            "nse":       ["/nse/fii-dii", "/nse/options", "/nse/top-movers", "/nse/circuit-stocks"],
            "technical": ["/technical/rsi", "/technical/macd", "/technical/bollinger",
                          "/technical/ema", "/technical/summary"],
            "screener":  ["/screener/fundamentals"],
            "macro":     ["/macro/commodities", "/macro/forex", "/macro/sgx-nifty",
                          "/macro/global-indices", "/macro/snapshot"],
            "news":      ["/news/search", "/news/feed", "/news/india-market", "/news/google"],
            "sentiment": ["/sentiment/reddit", "/sentiment/twitter", "/sentiment/youtube",
                          "/sentiment/trends", "/sentiment/ai-tag"],
        },
    }


# ─── Root ─────────────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "message": "Billionaire AI Data Service — Phase 3",
        "docs":    "/docs",
        "health":  "/health",
    }


# ─── Cache status ─────────────────────────────────────────────────────────────
@app.get("/cache/status")
async def cache_status():
    from utils.cache import cache
    return {
        "cached_entries": cache.size(),
        "timestamp":      datetime.utcnow().isoformat() + "Z",
    }


@app.delete("/cache/clear")
async def cache_clear():
    from utils.cache import cache
    cache.clear()
    return {"cleared": True, "timestamp": datetime.utcnow().isoformat() + "Z"}


# ─── Run ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Render injects PORT automatically. Fall back to PYTHON_SERVICE_PORT for local dev.
    port = int(os.environ.get("PORT", os.environ.get("PYTHON_SERVICE_PORT", 8000)))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
