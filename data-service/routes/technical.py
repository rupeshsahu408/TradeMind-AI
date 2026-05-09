import os
import httpx
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime

from utils.cache import cache

router = APIRouter(prefix="/technical", tags=["technical"])

ALPHA_BASE = "https://www.alphavantage.co/query"


def _get_av_key() -> str:
    key = os.environ.get("ALPHA_VANTAGE_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="ALPHA_VANTAGE_KEY not configured.")
    return key


def _to_av_symbol(ticker: str) -> str:
    """Convert yfinance NSE/BSE ticker to Alpha Vantage format."""
    return ticker.replace(".NS", ".BSE").replace(".BO", ".BSE")


async def _av_request(params: dict) -> dict:
    """Make a request to Alpha Vantage and return the JSON response."""
    params["apikey"] = _get_av_key()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(ALPHA_BASE, params=params)
            return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Alpha Vantage request failed: {exc}")


def _check_av_limit(data: dict, func_name: str) -> None:
    """Raise a clear error when Alpha Vantage rate-limits or returns an error."""
    if "Note" in data:
        raise HTTPException(
            status_code=429,
            detail="Alpha Vantage rate limit reached (25 calls/day on free tier). Try again tomorrow."
        )
    if "Information" in data:
        raise HTTPException(
            status_code=429,
            detail=data["Information"]
        )
    if "Error Message" in data:
        raise HTTPException(
            status_code=400,
            detail=f"Alpha Vantage error: {data['Error Message']}"
        )
    if f"Technical Analysis: {func_name}" not in data:
        raise HTTPException(
            status_code=503,
            detail=f"Unexpected Alpha Vantage response for {func_name}. Keys: {list(data.keys())}"
        )


# ─── RSI ──────────────────────────────────────────────────────────────────────

@router.get("/rsi")
async def technical_rsi(
    ticker: str = Query(..., description="NSE ticker e.g. RELIANCE.NS"),
    interval: str = Query("daily", description="daily | weekly | monthly"),
    period: int = Query(14, description="RSI period (default 14)"),
):
    cache_key = f"rsi:{ticker}:{interval}:{period}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    av_symbol = _to_av_symbol(ticker)
    data = await _av_request({
        "function": "RSI",
        "symbol": av_symbol,
        "interval": interval,
        "time_period": period,
        "series_type": "close",
    })
    _check_av_limit(data, "RSI")

    rsi_series = data["Technical Analysis: RSI"]
    latest_date = list(rsi_series.keys())[0]
    rsi_val = round(float(rsi_series[latest_date]["RSI"]), 2)

    if rsi_val > 70:
        signal = "overbought"
        interpretation = f"RSI at {rsi_val} — overbought territory. Potential pullback risk. Consider caution on fresh long entries."
    elif rsi_val < 30:
        signal = "oversold"
        interpretation = f"RSI at {rsi_val} — oversold territory. Potential reversal candidate. Look for confirmation before entry."
    else:
        signal = "neutral"
        interpretation = f"RSI at {rsi_val} — neutral zone. No extreme momentum reading in either direction."

    # Last 14 data points for mini sparkline
    history = [
        {"date": d, "rsi": round(float(v["RSI"]), 2)}
        for d, v in list(rsi_series.items())[:14]
    ]

    result = {
        "ticker": ticker,
        "av_symbol": av_symbol,
        "rsi": rsi_val,
        "signal": signal,
        "period": period,
        "interval": interval,
        "as_of": latest_date,
        "history": history,
        "interpretation": interpretation,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    cache.set(cache_key, result, ttl_seconds=3600)  # 1-hour cache: preserves free-tier calls
    return result


# ─── MACD ─────────────────────────────────────────────────────────────────────
# Calculated from price history via Yahoo Finance v8 chart API.
# Alpha Vantage MACD is a premium endpoint — we compute it with pandas EWM.

@router.get("/macd")
async def technical_macd(
    ticker: str = Query(...),
    interval: str = Query("daily"),
):
    cache_key = f"macd:{ticker}:{interval}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    from utils.yf_direct import get_history
    import pandas as pd

    # Map interval to yf_direct period/interval
    iv_map = {
        "daily":   ("6mo", "1d"),
        "weekly":  ("2y",  "1wk"),
        "monthly": ("5y",  "1mo"),
    }
    period, yf_interval = iv_map.get(interval, ("6mo", "1d"))
    yf_ticker = ticker if "." in ticker else f"{ticker}.NS"

    candles = await get_history(yf_ticker, period=period, interval=yf_interval)
    if not candles or len(candles) < 35:
        raise HTTPException(
            status_code=503,
            detail=f"Insufficient price history for MACD calculation ({ticker}). Got {len(candles) if candles else 0} bars."
        )

    closes = pd.Series([c["close"] for c in candles])
    dates  = [c.get("date", c.get("time", "")) for c in candles]

    ema12   = closes.ewm(span=12, adjust=False).mean()
    ema26   = closes.ewm(span=26, adjust=False).mean()
    macd_s  = ema12 - ema26
    signal_s = macd_s.ewm(span=9, adjust=False).mean()
    hist_s  = macd_s - signal_s

    macd_val   = round(float(macd_s.iloc[-1]), 4)
    signal_val = round(float(signal_s.iloc[-1]), 4)
    hist_val   = round(float(hist_s.iloc[-1]), 4)
    as_of      = dates[-1] if dates else ""

    trend = "bullish" if macd_val > signal_val else "bearish"
    crossover = "above" if macd_val > signal_val else "below"

    if abs(hist_val) < 0.5:
        momentum = "Histogram near zero — potential trend reversal zone."
    elif hist_val > 0:
        momentum = "Positive histogram — bullish momentum building."
    else:
        momentum = "Negative histogram — bearish momentum building."

    # Last 20 bars for sparkline
    history = [
        {"date": d, "macd": round(float(m), 4), "signal": round(float(sg), 4), "histogram": round(float(h), 4)}
        for d, m, sg, h in zip(dates[-20:], macd_s.iloc[-20:], signal_s.iloc[-20:], hist_s.iloc[-20:])
    ]

    result = {
        "ticker":         ticker,
        "macd":           macd_val,
        "signal":         signal_val,
        "histogram":      hist_val,
        "trend":          trend,
        "interval":       interval,
        "as_of":          as_of,
        "history":        history,
        "interpretation": f"MACD {crossover} signal line — {trend.capitalize()} momentum. {momentum}",
        "source":         "Calculated from Yahoo Finance price history",
        "timestamp":      datetime.utcnow().isoformat() + "Z",
    }

    cache.set(cache_key, result, ttl_seconds=3600)
    return result


# ─── Bollinger Bands ──────────────────────────────────────────────────────────

@router.get("/bollinger")
async def technical_bollinger(
    ticker: str = Query(...),
    interval: str = Query("daily"),
    period: int = Query(20),
):
    cache_key = f"bollinger:{ticker}:{interval}:{period}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    av_symbol = _to_av_symbol(ticker)
    data = await _av_request({
        "function": "BBANDS",
        "symbol": av_symbol,
        "interval": interval,
        "time_period": period,
        "series_type": "close",
        "nbdevup": 2,
        "nbdevdn": 2,
        "matype": 0,
    })
    _check_av_limit(data, "BBANDS")

    bb_series  = data["Technical Analysis: BBANDS"]
    latest_date = list(bb_series.keys())[0]
    entry = bb_series[latest_date]

    upper  = round(float(entry["Real Upper Band"]), 2)
    middle = round(float(entry["Real Middle Band"]), 2)
    lower  = round(float(entry["Real Lower Band"]), 2)
    bandwidth = round((upper - lower) / middle * 100, 2) if middle else 0

    result = {
        "ticker": ticker,
        "av_symbol": av_symbol,
        "upper_band": upper,
        "middle_band": middle,
        "lower_band": lower,
        "bandwidth_pct": bandwidth,
        "period": period,
        "interval": interval,
        "as_of": latest_date,
        "interpretation": (
            f"Bands: ₹{lower:,.2f} — ₹{middle:,.2f} — ₹{upper:,.2f} | "
            f"Bandwidth: {bandwidth}% | "
            f"{'Wide bands — high volatility.' if bandwidth > 10 else 'Narrow bands — potential breakout building.'}"
        ),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    cache.set(cache_key, result, ttl_seconds=3600)
    return result


# ─── EMA / SMA (bonus) ────────────────────────────────────────────────────────

@router.get("/ema")
async def technical_ema(
    ticker: str = Query(...),
    interval: str = Query("daily"),
    period: int = Query(20),
):
    cache_key = f"ema:{ticker}:{interval}:{period}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    av_symbol = _to_av_symbol(ticker)
    data = await _av_request({
        "function": "EMA",
        "symbol": av_symbol,
        "interval": interval,
        "time_period": period,
        "series_type": "close",
    })
    _check_av_limit(data, "EMA")

    ema_series = data["Technical Analysis: EMA"]
    latest_date = list(ema_series.keys())[0]
    ema_val = round(float(ema_series[latest_date]["EMA"]), 2)

    # Last 20 values
    history = [
        {"date": d, "ema": round(float(v["EMA"]), 2)}
        for d, v in list(ema_series.items())[:20]
    ]

    result = {
        "ticker": ticker,
        "ema": ema_val,
        "period": period,
        "interval": interval,
        "as_of": latest_date,
        "history": history,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    cache.set(cache_key, result, ttl_seconds=3600)
    return result


# ─── All indicators combined ──────────────────────────────────────────────────

@router.get("/summary")
async def technical_summary(
    ticker: str = Query(...),
    interval: str = Query("daily"),
):
    """Fetch RSI + MACD in parallel and return a combined technical summary.
    Note: Bollinger not included here to keep within free-tier daily call limits."""
    cache_key = f"tech_summary:{ticker}:{interval}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    import asyncio

    async def _safe(coro):
        try:
            return await coro
        except Exception as e:
            return {"error": str(e)}

    rsi_data, macd_data = await asyncio.gather(
        _safe(technical_rsi(ticker=ticker, interval=interval, period=14)),
        _safe(technical_macd(ticker=ticker, interval=interval)),
    )

    # Determine overall technical signal
    signals = []
    if "rsi" in rsi_data:
        rsi_val = rsi_data["rsi"]
        if rsi_val < 40:
            signals.append("bullish")
        elif rsi_val > 65:
            signals.append("bearish")
        else:
            signals.append("neutral")
    if "trend" in macd_data:
        signals.append(macd_data["trend"])

    overall = "bullish" if signals.count("bullish") > signals.count("bearish") else (
        "bearish" if signals.count("bearish") > signals.count("bullish") else "neutral"
    )

    result = {
        "ticker": ticker,
        "interval": interval,
        "overall_signal": overall,
        "rsi": rsi_data,
        "macd": macd_data,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    cache.set(cache_key, result, ttl_seconds=3600)
    return result
