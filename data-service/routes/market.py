"""
market.py — Indian market data endpoints.

Data strategy:
  • Indices  → NSE India /api/allIndices (live, no rate limit, sub-second)
              + Yahoo Finance v8 for Sensex (BSE — not on NSE India)
  • Quotes   → NSE India /api/quote-equity?symbol=TICKER (needs session)
              + Yahoo Finance v8 as fallback
  • History  → Yahoo Finance v8 chart API (direct httpx — bypasses sandbox block)
  • Fundamentals → Yahoo Finance v8 chart meta + NSE India + Screener.in HTML scrape
  • Intraday → Yahoo Finance v8 chart API with minute intervals
"""

import httpx
import asyncio
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime

from utils.cache import cache
from utils.nse_session import nse_session
from utils.yf_direct import fetch_chart, extract_quote, extract_ohlcv, get_quote, get_history

router = APIRouter(prefix="/market", tags=["market"])

# ─── NSE allIndices API ────────────────────────────────────────────────────────

_NSE_ALL_INDICES_PATH = "/api/allIndices"

_INDEX_KEY_MAP = {
    "NIFTY 50":   "nifty50",
    "NIFTY BANK": "banknifty",
}

_SENSEX_TICKER = "^BSESN"


async def _fetch_nse_all_indices() -> dict | None:
    raw = await nse_session.get(_NSE_ALL_INDICES_PATH)
    if raw and "data" in raw:
        return raw
    return None


# ─── Indices ──────────────────────────────────────────────────────────────────

@router.get("/indices")
async def market_indices():
    cache_key = "indices"
    cached = cache.get(cache_key)
    if cached:
        return cached

    result = {
        "nifty50":   {"name": "Nifty 50",   "ticker": "^NSEI",    "price": 0, "change": 0, "change_pct": 0, "day_high": 0, "day_low": 0, "prev_close": 0},
        "sensex":    {"name": "Sensex",      "ticker": "^BSESN",   "price": 0, "change": 0, "change_pct": 0, "day_high": 0, "day_low": 0, "prev_close": 0},
        "banknifty": {"name": "Bank Nifty",  "ticker": "^NSEBANK", "price": 0, "change": 0, "change_pct": 0, "day_high": 0, "day_low": 0, "prev_close": 0},
    }

    async def _from_nse():
        raw = await _fetch_nse_all_indices()
        if not raw:
            return
        for item in raw.get("data", []):
            key = _INDEX_KEY_MAP.get(item.get("index", ""))
            if key:
                result[key].update({
                    "price":      float(item.get("last", 0) or 0),
                    "change":     round(float(item.get("variation", 0) or 0), 2),
                    "change_pct": round(float(item.get("percentChange", 0) or 0), 2),
                    "day_high":   float(item.get("high", 0) or 0),
                    "day_low":    float(item.get("low", 0) or 0),
                    "prev_close": float(item.get("previousClose", 0) or 0),
                    "source":     "NSE India",
                })

    async def _sensex_from_yf():
        q = await get_quote(_SENSEX_TICKER)
        if q and q["price"] > 0:
            result["sensex"].update({
                "price":      q["price"],
                "change":     q["change"],
                "change_pct": q["change_pct"],
                "day_high":   q["day_high"],
                "day_low":    q["day_low"],
                "prev_close": q["prev_close"],
                "source":     "Yahoo Finance",
            })

    await asyncio.gather(_from_nse(), _sensex_from_yf())

    for key, ticker in [("nifty50", "^NSEI"), ("banknifty", "^NSEBANK")]:
        if result[key]["price"] == 0:
            q = await get_quote(ticker)
            if q and q["price"] > 0:
                result[key].update({
                    "price":      q["price"],
                    "change":     q["change"],
                    "change_pct": q["change_pct"],
                    "day_high":   q["day_high"],
                    "day_low":    q["day_low"],
                    "prev_close": q["prev_close"],
                    "source":     "Yahoo Finance (fallback)",
                })

    result["timestamp"] = datetime.utcnow().isoformat() + "Z"
    cache.set(cache_key, result, ttl_seconds=300)
    return result


# ─── Single Quote ─────────────────────────────────────────────────────────────

@router.get("/quote")
async def market_quote(ticker: str = Query(..., description="NSE ticker e.g. RELIANCE.NS or RELIANCE")):
    cache_key = f"quote:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    base_symbol = ticker.replace(".NS", "").replace(".BO", "").replace(".BSE", "").upper()

    nse_data = await nse_session.get(f"/api/quote-equity?symbol={base_symbol}")
    if nse_data:
        pi   = nse_data.get("priceInfo", {})
        info = nse_data.get("info", {})
        price    = float(pi.get("lastPrice", 0) or 0)
        prev     = float(pi.get("previousClose", 0) or 0)
        change   = round(price - prev, 2)
        chg_pct  = round((change / prev * 100) if prev else 0, 2)
        week52   = pi.get("weekHighLow", {})

        result = {
            "ticker":       ticker,
            "company":      info.get("companyName", base_symbol),
            "symbol":       base_symbol,
            "price":        price,
            "change":       change,
            "change_pct":   chg_pct,
            "volume":       int(pi.get("quantityTraded", 0) or 0),
            "market_cap":   0,
            "day_high":     float(pi.get("intraDayHighLow", {}).get("max", 0) or 0),
            "day_low":      float(pi.get("intraDayHighLow", {}).get("min", 0) or 0),
            "week_52_high": float(week52.get("max", 0) or 0),
            "week_52_low":  float(week52.get("min", 0) or 0),
            "open":         float(pi.get("open", 0) or 0),
            "prev_close":   prev,
            "currency":     "INR",
            "exchange":     "NSE",
            "source":       "NSE India",
            "timestamp":    datetime.utcnow().isoformat() + "Z",
        }
        cache.set(cache_key, result, ttl_seconds=300)
        return result

    yf_ticker = ticker if "." in ticker else f"{ticker}.NS"
    chart = await fetch_chart(yf_ticker, interval="1d", range_="2d")
    if chart:
        q    = extract_quote(chart)
        meta = chart.get("meta", {})
        result = {
            "ticker":       ticker,
            "company":      meta.get("longName") or base_symbol,
            "symbol":       base_symbol,
            "price":        q["price"],
            "change":       q["change"],
            "change_pct":   q["change_pct"],
            "volume":       q["volume"],
            "market_cap":   0,
            "day_high":     q["day_high"],
            "day_low":      q["day_low"],
            "week_52_high": float(meta.get("fiftyTwoWeekHigh", 0) or 0),
            "week_52_low":  float(meta.get("fiftyTwoWeekLow", 0) or 0),
            "open":         0,
            "prev_close":   q["prev_close"],
            "currency":     q["currency"],
            "exchange":     q["exchange"],
            "source":       "Yahoo Finance",
            "timestamp":    datetime.utcnow().isoformat() + "Z",
        }
        cache.set(cache_key, result, ttl_seconds=300)
        return result

    raise HTTPException(status_code=503, detail=f"Quote unavailable for {ticker}.")


# ─── OHLCV History ────────────────────────────────────────────────────────────

@router.get("/history")
async def market_history(
    ticker: str   = Query(...),
    period: str   = Query("1mo", description="1d 5d 1mo 3mo 6mo 1y 2y 5y"),
    interval: str = Query("1d",  description="1m 5m 15m 30m 1h 1d 1wk 1mo"),
):
    cache_key = f"history:{ticker}:{period}:{interval}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    yf_ticker = ticker if "." in ticker else f"{ticker}.NS"
    candles = await get_history(yf_ticker, period=period, interval=interval)

    if not candles:
        raise HTTPException(status_code=503, detail=f"Historical data unavailable for {ticker}.")

    if interval in ("1d", "1wk", "1mo"):
        for c in candles:
            c.pop("time", None)
    else:
        for c in candles:
            c.pop("date", None)

    result = {
        "ticker":   ticker,
        "period":   period,
        "interval": interval,
        "count":    len(candles),
        "data":     candles,
        "source":   "Yahoo Finance",
    }

    ttl = 1800 if interval in ("1d", "1wk", "1mo") else 300
    cache.set(cache_key, result, ttl_seconds=ttl)
    return result


# ─── Intraday ─────────────────────────────────────────────────────────────────

@router.get("/intraday")
async def market_intraday(
    ticker: str   = Query(...),
    interval: str = Query("15m", description="1m 5m 15m 30m 60m"),
):
    cache_key = f"intraday:{ticker}:{interval}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    period_map = {"1m": "1d", "5m": "1d", "15m": "1d", "30m": "5d", "60m": "5d", "1h": "5d"}
    period = period_map.get(interval, "1d")

    yf_ticker = ticker if "." in ticker else f"{ticker}.NS"
    candles = await get_history(yf_ticker, period=period, interval=interval)

    if not candles:
        raise HTTPException(status_code=503, detail=f"Intraday data unavailable for {ticker}.")

    for c in candles:
        c.pop("date", None)

    result = {
        "ticker":   ticker,
        "interval": interval,
        "count":    len(candles),
        "data":     candles,
        "source":   "Yahoo Finance",
    }
    cache.set(cache_key, result, ttl_seconds=300)
    return result


# ─── Fundamentals ─────────────────────────────────────────────────────────────
# Yahoo Finance v10/v7 require auth. We compose from:
#   1. Yahoo Finance v8 chart meta (52-wk range, avg prices, volume)
#   2. NSE India quote-equity (price, industry, company info)
#   3. Screener.in HTML scrape (PE, PB, market cap, dividends)

async def _screener_fundamentals(symbol: str) -> dict:
    """Scrape key ratios from Screener.in."""
    from bs4 import BeautifulSoup
    import re

    url = f"https://www.screener.in/company/{symbol.upper()}/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Connection": "keep-alive",
    }
    try:
        async with httpx.AsyncClient(timeout=20, headers=headers, follow_redirects=True) as c:
            resp = await c.get(url)
        if resp.status_code != 200:
            return {}
        soup = BeautifulSoup(resp.text, "html.parser")
        ratios: dict = {}

        # Screener.in: <ul id="top-ratios"> > <li>
        #   <span class="name">...</span>
        #   <span class="nowrap value">...<span class="number">...</span></span>
        ratio_section = soup.find("ul", {"id": "top-ratios"})
        if ratio_section:
            for li in ratio_section.find_all("li"):
                name_tag = li.find("span", class_="name")
                nums = [
                    re.sub(r"[,\s]+", "", s.get_text(strip=True))
                    for s in li.find_all("span", class_="number")
                ]
                if name_tag and nums:
                    name = re.sub(r"\s+", " ", name_tag.get_text(strip=True))
                    ratios[name] = " / ".join(nums) if len(nums) > 1 else nums[0]

        return ratios
    except Exception:
        return {}


@router.get("/fundamentals")
async def market_fundamentals(ticker: str = Query(...)):
    cache_key = f"fundamentals:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    base_symbol = ticker.replace(".NS", "").replace(".BO", "").upper()
    yf_ticker   = f"{base_symbol}.NS"

    # Fetch from all sources in parallel
    chart_task   = fetch_chart(yf_ticker, interval="1d", range_="1y")
    nse_task     = nse_session.get(f"/api/quote-equity?symbol={base_symbol}")
    screen_task  = _screener_fundamentals(base_symbol)

    chart_result, nse_data, screen_data = await asyncio.gather(
        chart_task, nse_task, screen_task,
        return_exceptions=True,
    )

    def _safe_r(x):
        return x if not isinstance(x, Exception) else None

    chart_result = _safe_r(chart_result)
    nse_data     = _safe_r(nse_data)
    screen_data  = _safe_r(screen_data) or {}

    def _sf(val, default=None):
        try:
            return float(str(val).replace(",", "").strip()) if val else default
        except Exception:
            return default

    # ── Company & sector from NSE ──
    company = base_symbol
    sector = industry = "N/A"
    if nse_data:
        info = nse_data.get("info", {})
        company  = info.get("companyName", base_symbol)
        sector   = info.get("sector", "N/A")
        industry = info.get("industry", "N/A")

    # ── Price data from chart ──
    week_52_high = week_52_low = fifty_day_avg = two_hundred_day_avg = 0.0
    if chart_result:
        meta = chart_result.get("meta", {})
        week_52_high       = float(meta.get("fiftyTwoWeekHigh",  0) or 0)
        week_52_low        = float(meta.get("fiftyTwoWeekLow",   0) or 0)
        fifty_day_avg      = float(meta.get("fiftyDayAverage",   0) or 0)
        two_hundred_day_avg = float(meta.get("twoHundredDayAverage", 0) or 0)

    # ── Financial ratios from Screener.in ──
    pe_ratio    = _sf(screen_data.get("Stock P/E") or screen_data.get("P/E"))
    pb_ratio    = _sf(screen_data.get("Price to Book value") or screen_data.get("Price to book"))
    market_cap  = _sf(screen_data.get("Market Cap") or screen_data.get("Market cap"))
    div_yield   = _sf(screen_data.get("Dividend Yield") or screen_data.get("Div yield"))
    roce        = _sf(screen_data.get("ROCE") or screen_data.get("Return on capital employed"))
    roe         = _sf(screen_data.get("ROE") or screen_data.get("Return on equity"))
    eps         = _sf(screen_data.get("EPS"))
    book_value  = _sf(screen_data.get("Book Value") or screen_data.get("Book value"))

    result = {
        "ticker":             ticker,
        "company":            company,
        "sector":             sector,
        "industry":           industry,
        "week_52_high":       week_52_high,
        "week_52_low":        week_52_low,
        "fifty_day_avg":      round(fifty_day_avg, 2),
        "two_hundred_day_avg": round(two_hundred_day_avg, 2),
        "pe_ratio":           pe_ratio,
        "price_to_book":      pb_ratio,
        "market_cap_cr":      market_cap,
        "dividend_yield":     div_yield,
        "roce":               roce,
        "roe":                roe,
        "eps":                eps,
        "book_value":         book_value,
        "screener_raw":       screen_data,
        "sources":            ["NSE India", "Yahoo Finance", "Screener.in"],
        "timestamp":          datetime.utcnow().isoformat() + "Z",
    }

    cache.set(cache_key, result, ttl_seconds=86400)
    return result


# ─── Earnings ─────────────────────────────────────────────────────────────────

@router.get("/earnings")
async def market_earnings(ticker: str = Query(...)):
    cache_key = f"earnings:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    base_symbol = ticker.replace(".NS", "").replace(".BO", "").upper()

    # Try Screener.in for Indian quarterly earnings
    from bs4 import BeautifulSoup
    url = f"https://www.screener.in/company/{base_symbol}/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    quarterly = []
    try:
        async with httpx.AsyncClient(timeout=20, headers=headers, follow_redirects=True) as c:
            resp = await c.get(url)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            # Find quarterly results table
            section = soup.find("section", {"id": "quarters"})
            if section:
                table = section.find("table")
                if table:
                    headers_row = [th.get_text(strip=True) for th in table.find_all("th")]
                    for row in table.find_all("tr")[1:4]:  # First 3 rows
                        cells = [td.get_text(strip=True) for td in row.find_all("td")]
                        if cells and len(cells) > 1:
                            metric = cells[0]
                            if "Sales" in metric or "Net Profit" in metric or "EPS" in metric:
                                quarterly.append({
                                    "metric": metric,
                                    "data": dict(zip(headers_row[1:], cells[1:])),
                                })
    except Exception:
        pass

    result = {
        "ticker":        ticker,
        "quarterly":     quarterly,
        "next_earnings": None,
        "source":        "Screener.in",
        "timestamp":     datetime.utcnow().isoformat() + "Z",
    }

    cache.set(cache_key, result, ttl_seconds=86400)
    return result
