"""
macro.py — Global macro data.

Data strategy:
  • Forex (USD/INR etc.) → Alpha Vantage CURRENCY_EXCHANGE_RATE (most accurate)
                         + Yahoo Finance v8 as fallback
  • Commodities (Crude, Gold) → Yahoo Finance v8 chart API (direct httpx)
  • Global indices (S&P, Nasdaq) → Yahoo Finance v8 chart API
  • GIFT Nifty → NSE India (Nifty 50 futures) + approximation
"""

import os
import asyncio
import httpx
from fastapi import APIRouter, HTTPException
from datetime import datetime

from utils.cache import cache
from utils.yf_direct import get_quote

router = APIRouter(prefix="/macro", tags=["macro"])

AV_BASE = "https://www.alphavantage.co/query"


def _av_key() -> str:
    return os.environ.get("ALPHA_VANTAGE_KEY", "")


# ─── Alpha Vantage forex helper ───────────────────────────────────────────────

async def _av_fx_rate(from_cur: str, to_cur: str) -> dict | None:
    """Fetch a real-time FX rate from Alpha Vantage."""
    key = _av_key()
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            resp = await c.get(AV_BASE, params={
                "function":      "CURRENCY_EXCHANGE_RATE",
                "from_currency": from_cur,
                "to_currency":   to_cur,
                "apikey":        key,
            })
            d = resp.json()
        rate_data = d.get("Realtime Currency Exchange Rate", {})
        if not rate_data:
            return None
        rate    = float(rate_data.get("5. Exchange Rate", 0) or 0)
        bid     = float(rate_data.get("8. Bid Price", rate) or rate)
        ask     = float(rate_data.get("9. Ask Price", rate) or rate)
        return {
            "rate":   round(rate, 6),
            "bid":    round(bid, 6),
            "ask":    round(ask, 6),
            "label":  f"{from_cur}/{to_cur}",
            "source": "Alpha Vantage",
        }
    except Exception:
        return None


# ─── Forex ────────────────────────────────────────────────────────────────────

@router.get("/forex")
async def macro_forex():
    cache_key = "macro:forex"
    cached = cache.get(cache_key)
    if cached:
        return cached

    # Fetch major INR pairs in parallel from Alpha Vantage
    pairs = [
        ("USD", "INR", "usd_inr"),
        ("EUR", "INR", "eur_inr"),
        ("GBP", "INR", "gbp_inr"),
        ("JPY", "INR", "jpy_inr"),
    ]
    # Also fetch DXY from Yahoo Finance
    av_tasks = [_av_fx_rate(f, t) for f, t, _ in pairs]
    dxy_task = get_quote("DX-Y.NYB")

    av_results = await asyncio.gather(*av_tasks, return_exceptions=True)
    dxy_result = await dxy_task

    result = {}
    for i, (from_c, to_c, key) in enumerate(pairs):
        av_data = av_results[i]
        if isinstance(av_data, dict) and av_data.get("rate", 0) > 0:
            result[key] = {
                "rate":       av_data["rate"],
                "change":     0,
                "change_pct": 0,
                "label":      f"{from_c}/{to_c}",
                "ticker":     f"{from_c}{to_c}=X",
                "source":     "Alpha Vantage",
            }
        else:
            # Fallback: Yahoo Finance v8
            yf_key = f"{from_c}{to_c}=X"
            q = await get_quote(yf_key)
            if q and q["rate"] if "rate" in q else (q and q.get("price", 0) > 0):
                p = q.get("price", q.get("rate", 0))
                result[key] = {
                    "rate":       round(p, 6),
                    "change":     round(q.get("change", 0), 6),
                    "change_pct": round(q.get("change_pct", 0), 4),
                    "label":      f"{from_c}/{to_c}",
                    "ticker":     yf_key,
                    "source":     "Yahoo Finance",
                }
            else:
                result[key] = {"rate": 0, "change": 0, "change_pct": 0, "label": f"{from_c}/{to_c}", "ticker": yf_key}

    # DXY
    if dxy_result and dxy_result.get("price", 0) > 0:
        result["dxy"] = {
            "rate":       dxy_result["price"],
            "change":     dxy_result["change"],
            "change_pct": dxy_result["change_pct"],
            "label":      "Dollar Index (DXY)",
            "ticker":     "DX-Y.NYB",
            "source":     "Yahoo Finance",
        }

    result["timestamp"] = datetime.utcnow().isoformat() + "Z"
    cache.set(cache_key, result, ttl_seconds=300)
    return result


# ─── Commodities ──────────────────────────────────────────────────────────────

@router.get("/commodities")
async def macro_commodities():
    cache_key = "macro:commodities"
    cached = cache.get(cache_key)
    if cached:
        return cached

    specs = {
        "crude_oil_wti":   ("CL=F",   "Crude Oil (WTI)",   "$/bbl"),
        "crude_oil_brent": ("BZ=F",   "Crude Oil (Brent)", "$/bbl"),
        "gold":            ("GC=F",   "Gold",               "$/oz"),
        "silver":          ("SI=F",   "Silver",             "$/oz"),
        "natural_gas":     ("NG=F",   "Natural Gas",        "$/MMBtu"),
        "copper":          ("HG=F",   "Copper",             "$/lb"),
    }

    quotes = await asyncio.gather(*[get_quote(ticker) for ticker, _, _ in specs.values()])

    result = {}
    for (key, (ticker, label, unit)), q in zip(specs.items(), quotes):
        if q and q.get("price", 0) > 0:
            result[key] = {
                "price":      q["price"],
                "change":     q["change"],
                "change_pct": q["change_pct"],
                "label":      label,
                "unit":       unit,
                "ticker":     ticker,
                "currency":   q.get("currency", "USD"),
                "source":     "Yahoo Finance",
            }
        else:
            result[key] = {"price": 0, "change": 0, "change_pct": 0, "label": label, "unit": unit, "ticker": ticker}

    result["timestamp"] = datetime.utcnow().isoformat() + "Z"
    cache.set(cache_key, result, ttl_seconds=300)
    return result


# ─── Global Indices ───────────────────────────────────────────────────────────

@router.get("/global-indices")
async def macro_global_indices():
    cache_key = "macro:global_indices"
    cached = cache.get(cache_key)
    if cached:
        return cached

    specs = {
        "sp500":     ("^GSPC",     "S&P 500"),
        "nasdaq":    ("^IXIC",     "Nasdaq Composite"),
        "dow":       ("^DJI",      "Dow Jones"),
        "vix":       ("^VIX",      "VIX (Fear Index)"),
        "ftse100":   ("^FTSE",     "FTSE 100"),
        "nikkei":    ("^N225",     "Nikkei 225"),
        "hang_seng": ("^HSI",      "Hang Seng"),
        "shanghai":  ("000001.SS", "Shanghai Composite"),
    }

    quotes = await asyncio.gather(*[get_quote(ticker) for ticker, _ in specs.values()])

    result = {}
    for (key, (ticker, label)), q in zip(specs.items(), quotes):
        if q and q.get("price", 0) > 0:
            result[key] = {
                "price":      q["price"],
                "change":     q["change"],
                "change_pct": q["change_pct"],
                "label":      label,
                "ticker":     ticker,
                "source":     "Yahoo Finance",
            }
        else:
            result[key] = {"price": 0, "change": 0, "change_pct": 0, "label": label, "ticker": ticker}

    result["timestamp"] = datetime.utcnow().isoformat() + "Z"
    cache.set(cache_key, result, ttl_seconds=300)
    return result


# ─── GIFT Nifty (SGX Nifty) ───────────────────────────────────────────────────

@router.get("/sgx-nifty")
async def macro_sgx_nifty():
    cache_key = "macro:sgx_nifty"
    cached = cache.get(cache_key)
    if cached:
        return cached

    # Fetch Nifty 50 spot and S&P 500 E-mini futures in parallel
    nifty_q, sp500_q = await asyncio.gather(
        get_quote("^NSEI"),
        get_quote("ES=F"),
    )

    nifty_price = nifty_q["price"] if nifty_q else 0
    sp_chg_pct  = sp500_q["change_pct"] if sp500_q else 0

    # GIFT Nifty approximation: Nifty spot adjusted by 60% of S&P 500 futures move
    # (historical correlation Nifty vs S&P overnight ≈ 0.6)
    gap_pct    = round(sp_chg_pct * 0.6, 2)
    sgx_approx = round(nifty_price * (1 + gap_pct / 100), 2) if nifty_price > 0 else 0

    result = {
        "gift_nifty_approx":       sgx_approx,
        "nifty_spot":              nifty_price,
        "gap_vs_prev_close_pct":   gap_pct,
        "sp500_futures_change_pct": sp_chg_pct,
        "direction": (
            "positive" if gap_pct > 0.1
            else "negative" if gap_pct < -0.1
            else "flat"
        ),
        "note": (
            "GIFT Nifty approximated via Nifty 50 spot + S&P 500 futures "
            "correlation (0.6x factor). Check SGX/NSE India for exact value."
        ),
        "source":    "NSE India + Yahoo Finance",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    cache.set(cache_key, result, ttl_seconds=300)
    return result


# ─── Full Macro Snapshot ──────────────────────────────────────────────────────

@router.get("/snapshot")
async def macro_snapshot():
    cache_key = "macro:snapshot"
    cached = cache.get(cache_key)
    if cached:
        return cached

    async def _safe(coro):
        try:
            return await coro
        except Exception:
            return {}

    commodities_data, forex_data, global_data, sgx_data = await asyncio.gather(
        _safe(macro_commodities()),
        _safe(macro_forex()),
        _safe(macro_global_indices()),
        _safe(macro_sgx_nifty()),
    )

    result = {
        "commodities":    commodities_data,
        "forex":          forex_data,
        "global_indices": global_data,
        "gift_nifty":     sgx_data,
        "timestamp":      datetime.utcnow().isoformat() + "Z",
    }

    cache.set(cache_key, result, ttl_seconds=300)
    return result
