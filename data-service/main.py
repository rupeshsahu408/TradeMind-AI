import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../.env'))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from datetime import datetime

app = FastAPI(
    title="Billionaire AI — Data Service",
    description="Python microservice for market data, news, and sentiment fetching",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Health Check ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "Billionaire AI Data Service",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "python_env": "ready",
        "libraries": {
            "yfinance": "loaded",
            "requests": "loaded",
            "beautifulsoup4": "loaded",
            "feedparser": "loaded",
            "pytrends": "loaded",
        }
    }

# ─── Root ─────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "message": "Billionaire AI Data Service is running.",
        "docs": "/docs",
        "health": "/health",
    }

# ─── Placeholder route stubs (Phase 2 will implement these) ──────────────────

@app.get("/market/quote")
async def market_quote(ticker: str):
    return {"message": f"Phase 2: will return live quote for {ticker}"}

@app.get("/market/indices")
async def market_indices():
    return {"message": "Phase 2: will return Nifty 50, Sensex, Bank Nifty"}

@app.get("/market/history")
async def market_history(ticker: str, period: str = "1mo", interval: str = "1d"):
    return {"message": f"Phase 2: will return OHLCV history for {ticker}"}

@app.get("/market/fundamentals")
async def market_fundamentals(ticker: str):
    return {"message": f"Phase 2: will return fundamentals for {ticker}"}

@app.get("/nse/fii-dii")
async def nse_fii_dii():
    return {"message": "Phase 2: will return FII/DII data from NSE"}

@app.get("/news/search")
async def news_search(q: str):
    return {"message": f"Phase 3: will return news articles for: {q}"}

@app.get("/sentiment/reddit")
async def sentiment_reddit(ticker: str):
    return {"message": f"Phase 3: will return Reddit sentiment for {ticker}"}

@app.get("/sentiment/trends")
async def sentiment_trends(ticker: str):
    return {"message": f"Phase 3: will return Google Trends data for {ticker}"}

# ─── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PYTHON_SERVICE_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
