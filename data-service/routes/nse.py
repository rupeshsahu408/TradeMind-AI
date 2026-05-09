import yfinance as yf
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime

from utils.cache import cache
from utils.nse_session import nse_session

router = APIRouter(prefix="/nse", tags=["nse"])

# Sector index display names — maps NSE allIndices name to UI label
_SECTOR_MAP = {
    "NIFTY BANK":             "Banking",
    "NIFTY IT":               "IT",
    "NIFTY PHARMA":           "Pharma",
    "NIFTY AUTO":             "Auto",
    "NIFTY FMCG":             "FMCG",
    "NIFTY METAL":            "Metal",
    "NIFTY REALTY":           "Realty",
    "NIFTY ENERGY":           "Energy",
    "NIFTY HEALTHCARE INDEX": "Healthcare",
    "NIFTY MEDIA":            "Media",
    "NIFTY PSU BANK":         "PSU Bank",
    "NIFTY INFRA":            "Infra",
}

# Top 20 Nifty 50 constituents — used as fallback for top-movers
NIFTY50_SAMPLE = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "HINDUNILVR.NS", "ITC.NS", "SBIN.NS", "BHARTIARTL.NS", "KOTAKBANK.NS",
    "BAJFINANCE.NS", "LT.NS", "WIPRO.NS", "HCLTECH.NS", "ASIANPAINT.NS",
    "AXISBANK.NS", "MARUTI.NS", "SUNPHARMA.NS", "TITAN.NS", "ULTRACEMCO.NS",
    "NTPC.NS", "POWERGRID.NS", "ADANIPORTS.NS", "BAJAJFINSV.NS", "JSWSTEEL.NS",
]


def _safe_float(val, default=0):
    try:
        if val is None:
            return default
        f = float(val)
        return default if pd.isna(f) else round(f, 2)
    except Exception:
        return default


# ─── FII / DII ────────────────────────────────────────────────────────────────

@router.get("/fii-dii")
async def nse_fii_dii():
    cache_key = "nse:fii_dii"
    cached = cache.get(cache_key)
    if cached:
        return cached

    raw = await nse_session.get("/api/fiidiiTradeReact")

    if raw and isinstance(raw, list):
        parsed = {"source": "NSE India", "timestamp": datetime.utcnow().isoformat() + "Z", "data": []}
        fii_net = 0.0
        dii_net = 0.0

        for item in raw:
            category = item.get("category", "").upper()
            buy_val  = _safe_float(item.get("buyValue", 0))
            sell_val = _safe_float(item.get("sellValue", 0))
            net_val  = _safe_float(item.get("netValue", buy_val - sell_val))

            parsed["data"].append({
                "date":      item.get("date", ""),
                "category":  category,
                "buy":       buy_val,
                "sell":      sell_val,
                "net":       net_val,
            })

            if "FII" in category or "FPI" in category:
                fii_net = net_val
            elif "DII" in category:
                dii_net = net_val

        parsed["fii_net"] = fii_net
        parsed["dii_net"] = dii_net
        parsed["market_mood"] = (
            "bullish" if fii_net > 0 and dii_net > 0
            else "bearish" if fii_net < 0 and dii_net < 0
            else "mixed"
        )

        cache.set(cache_key, parsed, ttl_seconds=900)
        return parsed

    # Fallback: structured placeholder (NSE API unavailable)
    fallback = {
        "source": "NSE India (unavailable — try again later)",
        "fii_net": None,
        "dii_net": None,
        "market_mood": "unknown",
        "data": [],
        "error": "NSE India API is temporarily unreachable. This often happens outside market hours.",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    cache.set(cache_key, fallback, ttl_seconds=120)
    return fallback


# ─── Options Chain ────────────────────────────────────────────────────────────

@router.get("/options")
async def nse_options(ticker: str = Query(..., description="NSE symbol without .NS e.g. RELIANCE")):
    symbol = ticker.upper().replace(".NS", "")
    cache_key = f"nse:options:{symbol}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    # Try index options first for NIFTY / BANKNIFTY
    if symbol in ("NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"):
        path = f"/api/option-chain-indices?symbol={symbol}"
    else:
        path = f"/api/option-chain-equities?symbol={symbol}"

    raw = await nse_session.get(path)

    if raw:
        records = raw.get("records", {})
        oc_data  = records.get("data", [])
        expiries = records.get("expiryDates", [])

        total_ce_oi = 0
        total_pe_oi = 0
        atm_strike  = 0
        atm_ce_oi   = 0
        atm_pe_oi   = 0

        underlying_value = records.get("underlyingValue", 0)

        # Find ATM strike
        if underlying_value and oc_data:
            strikes = [e.get("strikePrice", 0) for e in oc_data]
            if strikes:
                atm_strike = min(strikes, key=lambda s: abs(s - underlying_value))

        for entry in oc_data:
            ce = entry.get("CE", {})
            pe = entry.get("PE", {})
            ce_oi = ce.get("openInterest", 0) or 0
            pe_oi = pe.get("openInterest", 0) or 0
            total_ce_oi += ce_oi
            total_pe_oi += pe_oi
            if entry.get("strikePrice") == atm_strike:
                atm_ce_oi = ce_oi
                atm_pe_oi = pe_oi

        pcr = round(total_pe_oi / total_ce_oi, 3) if total_ce_oi > 0 else 0
        atm_pcr = round(atm_pe_oi / atm_ce_oi, 3) if atm_ce_oi > 0 else 0

        result = {
            "ticker": symbol,
            "underlying_value": underlying_value,
            "atm_strike": atm_strike,
            "put_call_ratio": pcr,
            "atm_put_call_ratio": atm_pcr,
            "total_call_oi": total_ce_oi,
            "total_put_oi": total_pe_oi,
            "sentiment": (
                "bullish" if pcr > 1.2
                else "bearish" if pcr < 0.8
                else "neutral"
            ),
            "nearest_expiry": expiries[0] if expiries else None,
            "expiry_dates": expiries[:4],
            "source": "NSE India",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
        cache.set(cache_key, result, ttl_seconds=300)
        return result

    raise HTTPException(status_code=503, detail="NSE options data temporarily unavailable.")


# ─── Top Movers ───────────────────────────────────────────────────────────────

@router.get("/top-movers")
async def nse_top_movers():
    cache_key = "nse:top_movers"
    cached = cache.get(cache_key)
    if cached:
        return cached

    # Try NSE API first
    gainers_raw = await nse_session.get("/api/live-analysis-variations?index=gainers")
    losers_raw  = await nse_session.get("/api/live-analysis-variations?index=losers")

    def _parse_nse_movers(raw) -> list:
        if not raw:
            return []
        items = raw if isinstance(raw, list) else raw.get("data", [])
        out = []
        for item in (items if isinstance(items, list) else []):
            ticker = item.get("symbol", "")
            if not ticker:
                continue
            out.append({
                "ticker": ticker,
                "company": item.get("companyName") or ticker,
                "price": _safe_float(item.get("ltP") or item.get("ltp")),
                "change_pct": _safe_float(item.get("pChange") or item.get("perChange")),
                "volume": _safe_float(item.get("trdVol") or item.get("totalTradedVolume")),
            })
        return out[:10]

    gainers = _parse_nse_movers(gainers_raw)
    losers  = _parse_nse_movers(losers_raw)

    if gainers or losers:
        result = {
            "gainers": gainers,
            "losers":  losers,
            "source":  "NSE India",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
        cache.set(cache_key, result, ttl_seconds=300)
        return result

    # Fallback: Yahoo Finance v8 chart API for Nifty 50 sample
    from utils.yf_direct import get_quote
    import asyncio as _asyncio

    quotes = await _asyncio.gather(
        *[get_quote(sym) for sym in NIFTY50_SAMPLE],
        return_exceptions=True,
    )

    changes = []
    for sym, q in zip(NIFTY50_SAMPLE, quotes):
        if isinstance(q, dict) and q and q.get("price", 0) > 0:
            changes.append({
                "ticker":     sym.replace(".NS", ""),
                "company":    sym.replace(".NS", ""),
                "price":      q["price"],
                "change_pct": round(q["change_pct"], 2),
                "volume":     q.get("volume", 0),
            })

    if not changes:
        raise HTTPException(status_code=503, detail="Top movers data unavailable from all sources.")

    changes.sort(key=lambda x: x["change_pct"], reverse=True)
    result = {
        "gainers":   changes[:5],
        "losers":    list(reversed(changes))[:5],
        "source":    "Yahoo Finance (fallback)",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    cache.set(cache_key, result, ttl_seconds=300)
    return result


# ─── Circuit Stocks ───────────────────────────────────────────────────────────

@router.get("/circuit-stocks")
async def nse_circuit_stocks():
    cache_key = "nse:circuit_stocks"
    cached = cache.get(cache_key)
    if cached:
        return cached

    upper_raw = await nse_session.get("/api/live-analysis-variations?index=uppercircuit")
    lower_raw = await nse_session.get("/api/live-analysis-variations?index=lowercircuit")

    def _parse_circuit(raw) -> list:
        if not raw:
            return []
        items = raw if isinstance(raw, list) else raw.get("data", [])
        out = []
        for item in (items if isinstance(items, list) else []):
            out.append({
                "ticker":     item.get("symbol", ""),
                "company":    item.get("companyName") or item.get("symbol", ""),
                "price":      _safe_float(item.get("ltP") or item.get("ltp")),
                "change_pct": _safe_float(item.get("pChange") or item.get("perChange")),
            })
        return out[:15]

    result = {
        "upper_circuit": _parse_circuit(upper_raw),
        "lower_circuit":  _parse_circuit(lower_raw),
        "source": "NSE India",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    cache.set(cache_key, result, ttl_seconds=300)
    return result


# ─── Sector Heat Map ──────────────────────────────────────────────────────────

@router.get("/sectors")
async def nse_sectors():
    """
    Returns NSE sector indices performance from the NSE allIndices feed.
    Sorted by change_pct descending so gainers appear first.
    """
    cache_key = "nse:sectors"
    cached = cache.get(cache_key)
    if cached:
        return cached

    raw = await nse_session.get("/api/allIndices")
    sectors = []

    if raw and "data" in raw:
        for item in raw.get("data", []):
            name = item.get("index", "")
            display = _SECTOR_MAP.get(name)
            if not display:
                continue
            price      = _safe_float(item.get("last") or item.get("previousClose", 0))
            change     = _safe_float(item.get("variation", 0))
            change_pct = _safe_float(item.get("percentChange", 0))
            sectors.append({
                "name":        display,
                "index_name":  name,
                "price":       round(price, 2),
                "change":      round(change, 2),
                "change_pct":  round(change_pct, 2),
                "day_high":    _safe_float(item.get("high", 0)),
                "day_low":     _safe_float(item.get("low", 0)),
            })

    # Sort gainers first
    sectors.sort(key=lambda x: x["change_pct"], reverse=True)

    result = {
        "sectors":   sectors,
        "count":     len(sectors),
        "source":    "NSE India",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    cache.set(cache_key, result, ttl_seconds=300)
    return result
