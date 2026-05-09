"""
Direct Yahoo Finance v8 Chart API client.
Uses httpx with browser headers — bypasses the blocks that yfinance's session gets
in cloud/sandbox environments.
"""

import httpx
from typing import Optional

_YF_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://finance.yahoo.com/",
    "Origin": "https://finance.yahoo.com",
}

_YF_BASE = "https://query2.finance.yahoo.com"


async def fetch_chart(
    symbol: str,
    interval: str = "1d",
    range_: str = "2d",
) -> Optional[dict]:
    """
    Fetch the v8 chart data for a symbol.
    Returns the raw 'result[0]' dict or None on failure.
    """
    url = f"{_YF_BASE}/v8/finance/chart/{symbol}"
    params = {
        "interval": interval,
        "range": range_,
        "includePrePost": "false",
        "events": "div|split|earn",
    }
    try:
        async with httpx.AsyncClient(timeout=20, headers=_YF_HEADERS) as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                return None
            data = resp.json()
            results = data.get("chart", {}).get("result")
            if not results:
                return None
            return results[0]
    except Exception as exc:
        print(f"[YF Direct] {symbol} chart fetch failed: {exc}")
        return None


def extract_quote(result: dict) -> dict:
    """
    Extract a simple price/change dict from a v8 chart result.
    """
    meta = result.get("meta", {})
    price     = float(meta.get("regularMarketPrice", 0) or 0)
    prev      = float(meta.get("chartPreviousClose", 0) or meta.get("previousClose", 0) or price)
    day_high  = float(meta.get("regularMarketDayHigh", 0) or 0)
    day_low   = float(meta.get("regularMarketDayLow", 0) or 0)
    volume    = int(meta.get("regularMarketVolume", 0) or 0)
    change    = round(price - prev, 4)
    change_pct = round((change / prev * 100) if prev else 0, 4)

    return {
        "price":      round(price, 4),
        "prev_close": round(prev, 4),
        "change":     change,
        "change_pct": change_pct,
        "day_high":   round(day_high, 4),
        "day_low":    round(day_low, 4),
        "volume":     volume,
        "currency":   meta.get("currency", "USD"),
        "exchange":   meta.get("fullExchangeName", meta.get("exchangeName", "")),
        "symbol":     meta.get("symbol", ""),
    }


def extract_ohlcv(result: dict) -> list[dict]:
    """
    Extract OHLCV candles from a v8 chart result.
    Returns a list of {date/time, open, high, low, close, volume} dicts.
    """
    timestamps = result.get("timestamp", [])
    indicators = result.get("indicators", {})
    quotes_list = indicators.get("quote", [{}])
    if not quotes_list:
        return []
    q = quotes_list[0]

    opens   = q.get("open",   [])
    highs   = q.get("high",   [])
    lows    = q.get("low",    [])
    closes  = q.get("close",  [])
    volumes = q.get("volume", [])

    candles = []
    for i, ts in enumerate(timestamps):
        c = closes[i] if i < len(closes) else None
        if c is None:
            continue
        import datetime
        dt = datetime.datetime.utcfromtimestamp(ts)
        candles.append({
            "time":   dt.isoformat() + "Z",
            "date":   dt.strftime("%Y-%m-%d"),
            "open":   round(float(opens[i])   if i < len(opens)   and opens[i]   is not None else c, 2),
            "high":   round(float(highs[i])   if i < len(highs)   and highs[i]   is not None else c, 2),
            "low":    round(float(lows[i])    if i < len(lows)    and lows[i]    is not None else c, 2),
            "close":  round(float(c), 2),
            "volume": int(volumes[i]) if i < len(volumes) and volumes[i] is not None else 0,
        })
    return candles


async def get_quote(symbol: str) -> Optional[dict]:
    """Convenience: fetch chart and return extracted quote dict."""
    result = await fetch_chart(symbol, interval="1d", range_="2d")
    if result is None:
        return None
    q = extract_quote(result)
    q["ticker"] = symbol
    return q


async def get_history(
    symbol: str,
    period: str = "1mo",
    interval: str = "1d",
) -> Optional[list[dict]]:
    """
    Fetch OHLCV history via the v8 chart API.
    period: 1d 5d 1mo 3mo 6mo 1y 2y 5y 10y ytd max
    interval: 1m 2m 5m 15m 30m 60m 90m 1h 1d 5d 1wk 1mo 3mo
    """
    result = await fetch_chart(symbol, interval=interval, range_=period)
    if result is None:
        return None
    return extract_ohlcv(result)
