"""
News Engine — Phase 3

Endpoints:
  GET /news/search?q=HDFC+Bank&hours=24        NewsAPI + AI sentiment tags
  GET /news/feed?source=et|mc|mint|bs           Single RSS feed
  GET /news/india-market                        All 4 RSS feeds combined
  GET /news/google?q=Reliance+Industries&hours=2  Google News RSS
"""

import os
import re
import asyncio
import httpx
import feedparser
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timezone, timedelta
from typing import Optional

from utils.cache import cache
from utils.nvidia_client import tag_articles_batch

router = APIRouter(prefix="/news", tags=["news"])

# ─── Browser headers for RSS scraping ─────────────────────────────────────────
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-US,en;q=0.9",
}

# ─── RSS Feed Registry ────────────────────────────────────────────────────────
RSS_FEEDS = {
    "et": {
        "name": "Economic Times",
        "url": "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    },
    "mc": {
        "name": "Moneycontrol",
        "url": "https://www.moneycontrol.com/rss/latestnews.xml",
    },
    "mint": {
        "name": "LiveMint",
        "url": "https://www.livemint.com/rss/markets",
    },
    "bs": {
        "name": "Business Standard",
        "url": "https://www.business-standard.com/rss/markets-106.rss",
    },
}


def _strip_html(text: str) -> str:
    """Remove HTML tags and extra whitespace from a string."""
    text = re.sub(r"<[^>]+>", "", text or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _parse_entry(entry, source_name: str) -> dict:
    """Convert a feedparser entry into our standard article dict."""
    published = None
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        try:
            published = datetime(*entry.published_parsed[:6],
                                  tzinfo=timezone.utc).isoformat()
        except Exception:
            pass
    published = published or datetime.now(timezone.utc).isoformat()

    raw_summary = ""
    if hasattr(entry, "summary") and entry.summary:
        raw_summary = _strip_html(entry.summary)[:300]
    elif hasattr(entry, "description") and entry.description:
        raw_summary = _strip_html(entry.description)[:300]

    return {
        "title":        _strip_html(getattr(entry, "title", "No title")),
        "url":          getattr(entry, "link", ""),
        "source":       source_name,
        "published_at": published,
        "summary":      raw_summary,
        "sentiment":    None,
    }


async def _fetch_rss_articles(source_key: str, limit: int = 15) -> list[dict]:
    """Fetch and parse a single RSS feed. Returns list of article dicts."""
    feed_info = RSS_FEEDS.get(source_key)
    if not feed_info:
        return []

    cache_key = f"rss:{source_key}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=15, headers=_HEADERS, follow_redirects=True) as client:
            resp = await client.get(feed_info["url"])
            if resp.status_code != 200:
                print(f"[News] RSS {source_key} returned HTTP {resp.status_code}")
                return []
            feed = feedparser.parse(resp.text)

        articles = [_parse_entry(e, feed_info["name"]) for e in feed.entries[:limit]]
        cache.set(cache_key, articles, ttl_seconds=900)   # 15 min
        return articles

    except Exception as e:
        print(f"[News] RSS fetch failed ({source_key}): {e}")
        return []


# ─── GET /news/search ─────────────────────────────────────────────────────────

@router.get("/search")
async def news_search(
    q:      str = Query(..., description="Search query, e.g. 'HDFC Bank'"),
    hours:  int = Query(24, ge=1, le=168, description="Look-back window in hours"),
    limit:  int = Query(10, ge=1, le=30),
    tag:    bool = Query(True, description="Run AI sentiment tagging"),
):
    """
    Search recent news via NewsAPI.org.
    Returns articles with AI POSITIVE/NEGATIVE/NEUTRAL sentiment tags.
    """
    api_key = os.environ.get("NEWS_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="NEWS_API_KEY not configured.")

    cache_key = f"news:search:{q.lower().strip()}:{hours}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    from_dt = (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")

    params = {
        "q":           q,
        "from":        from_dt,
        "language":    "en",
        "sortBy":      "publishedAt",
        "pageSize":    min(limit, 30),
        "apiKey":      api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get("https://newsapi.org/v2/everything", params=params)
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"NewsAPI error: {resp.text[:200]}")
            data = resp.json()

        if data.get("status") != "ok":
            raise HTTPException(status_code=502, detail=data.get("message", "NewsAPI error"))

        articles = []
        for item in data.get("articles", []):
            articles.append({
                "title":        item.get("title", ""),
                "url":          item.get("url", ""),
                "source":       item.get("source", {}).get("name", "Unknown"),
                "published_at": item.get("publishedAt", ""),
                "summary":      (item.get("description") or "")[:300],
                "sentiment":    None,
            })

        if tag and articles:
            articles = await tag_articles_batch(articles, context=q)

        result = {
            "query":      q,
            "hours":      hours,
            "total":      len(articles),
            "articles":   articles,
            "timestamp":  datetime.now(timezone.utc).isoformat(),
        }
        cache.set(cache_key, result, ttl_seconds=900)
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"News search failed: {e}")


# ─── GET /news/feed ───────────────────────────────────────────────────────────

@router.get("/feed")
async def news_feed(
    source: str = Query(..., description="One of: et, mc, mint, bs"),
    tag:    bool = Query(False, description="Run AI sentiment tagging"),
):
    """
    Fetch latest articles from a single Indian financial RSS feed.
    source: et=Economic Times, mc=Moneycontrol, mint=LiveMint, bs=Business Standard
    """
    if source not in RSS_FEEDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown source '{source}'. Valid: {list(RSS_FEEDS.keys())}"
        )

    articles = await _fetch_rss_articles(source)
    if tag and articles:
        articles = await tag_articles_batch(articles)

    return {
        "source":    RSS_FEEDS[source]["name"],
        "total":     len(articles),
        "articles":  articles,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ─── GET /news/india-market ───────────────────────────────────────────────────

@router.get("/india-market")
async def india_market_news(
    tag:   bool = Query(False, description="Run AI sentiment tagging on all articles"),
    limit: int  = Query(30, ge=5, le=80),
):
    """
    Combined feed from all 4 Indian financial news sources.
    Deduplicates by title, sorts by published_at descending.
    """
    cache_key = "news:india_market"
    cached = cache.get(cache_key)
    if cached and not tag:
        return cached

    all_feeds = await asyncio.gather(
        _fetch_rss_articles("et"),
        _fetch_rss_articles("mc"),
        _fetch_rss_articles("mint"),
        _fetch_rss_articles("bs"),
        return_exceptions=True,
    )

    combined: list[dict] = []
    seen_titles: set[str] = set()

    for feed_result in all_feeds:
        if isinstance(feed_result, list):
            for article in feed_result:
                title_key = article["title"].lower().strip()[:80]
                if title_key not in seen_titles and title_key:
                    seen_titles.add(title_key)
                    combined.append(article)

    combined.sort(key=lambda x: x.get("published_at", ""), reverse=True)
    combined = combined[:limit]

    if tag and combined:
        combined = await tag_articles_batch(combined, context="Indian stock market")

    result = {
        "sources":   list(RSS_FEEDS.keys()),
        "total":     len(combined),
        "articles":  combined,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if not tag:
        cache.set(cache_key, result, ttl_seconds=900)
    return result


# ─── GET /news/google ─────────────────────────────────────────────────────────

@router.get("/google")
async def google_news(
    q:     str = Query(..., description="Search query, e.g. 'Reliance Industries'"),
    hours: int = Query(6, ge=1, le=48, description="Look-back window in hours"),
    tag:   bool = Query(True, description="Run AI sentiment tagging"),
):
    """
    Fetch breaking news from Google News RSS for any stock or topic.
    Returns results from the last N hours.
    """
    cache_key = f"news:google:{q.lower().strip()}:{hours}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    google_url = "https://news.google.com/rss/search"
    params = {
        "q":    f"{q} stock India",
        "hl":   "en-IN",
        "gl":   "IN",
        "ceid": "IN:en",
    }

    try:
        async with httpx.AsyncClient(timeout=20, headers=_HEADERS, follow_redirects=True) as client:
            resp = await client.get(google_url, params=params)
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Google News RSS unavailable.")
            feed = feedparser.parse(resp.text)

        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        articles = []

        for entry in feed.entries[:25]:
            article = _parse_entry(entry, "Google News")
            # Try to filter by date — but include article if date can't be parsed
            # (Google News dates are sometimes in non-standard formats)
            try:
                pub_str = article["published_at"].replace("Z", "+00:00")
                pub_dt  = datetime.fromisoformat(pub_str)
                if pub_dt.tzinfo is None:
                    pub_dt = pub_dt.replace(tzinfo=timezone.utc)
                if pub_dt < cutoff:
                    continue
            except Exception:
                pass  # include article if date can't be determined
            articles.append(article)

        # If date filtering removed everything, return latest articles anyway
        if not articles and feed.entries:
            articles = [_parse_entry(e, "Google News") for e in feed.entries[:10]]

        if tag and articles:
            articles = await tag_articles_batch(articles, context=q)

        result = {
            "query":     q,
            "hours":     hours,
            "total":     len(articles),
            "articles":  articles,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        cache.set(cache_key, result, ttl_seconds=600)
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Google News fetch failed: {e}")
