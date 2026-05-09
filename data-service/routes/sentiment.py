"""
Sentiment Engine — Phase 3

Endpoints:
  GET /sentiment/reddit?ticker=HDFCBANK
  GET /sentiment/twitter?query=HDFCBANK
  GET /sentiment/youtube?ticker=HDFC+Bank
  GET /sentiment/trends?ticker=HDFCBANK
  POST /sentiment/ai-tag  { text, context }
"""

import os
import re
import asyncio
import httpx
from fastapi import APIRouter, Query, HTTPException, Body
from datetime import datetime, timezone, timedelta
from typing import Optional

from utils.cache import cache
from utils.nvidia_client import tag_sentiment, tag_articles_batch

router = APIRouter(prefix="/sentiment", tags=["sentiment"])

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


# ─── GET /sentiment/reddit ────────────────────────────────────────────────────

@router.get("/reddit")
async def reddit_sentiment(
    ticker: str = Query(..., description="NSE ticker without .NS, e.g. HDFCBANK"),
):
    """
    Search r/IndiaInvestments and r/IndianStreetBets for ticker mentions.
    Requires REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET env vars.
    Returns graceful empty if credentials are missing.
    """
    cache_key = f"sentiment:reddit:{ticker.upper()}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    client_id     = os.environ.get("REDDIT_CLIENT_ID", "")
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        result = {
            "ticker":        ticker.upper(),
            "status":        "unavailable",
            "reason":        "Reddit API credentials not configured.",
            "mention_count": 0,
            "positive":      0,
            "negative":      0,
            "neutral":       0,
            "net_sentiment": "NEUTRAL",
            "top_posts":     [],
            "timestamp":     datetime.now(timezone.utc).isoformat(),
        }
        cache.set(cache_key, result, ttl_seconds=300)
        return result

    subreddits = ["IndiaInvestments", "IndianStreetBets", "stocks"]
    all_posts  = []

    try:
        import praw
        reddit = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent="BillionaireAI:v1.0 (personal trading assistant)",
        )

        company_map = {
            "HDFCBANK": "HDFC Bank",
            "RELIANCE": "Reliance",
            "TCS":      "TCS",
            "INFY":     "Infosys",
            "ICICIBANK":"ICICI Bank",
            "SBIN":     "SBI",
            "WIPRO":    "Wipro",
            "BAJFINANCE":"Bajaj Finance",
            "AXISBANK": "Axis Bank",
        }
        company = company_map.get(ticker.upper(), ticker.upper())
        search_q = f"{ticker} OR {company}"

        for sub in subreddits:
            try:
                subreddit = reddit.subreddit(sub)
                for post in subreddit.search(search_q, sort="new", time_filter="week", limit=20):
                    all_posts.append({
                        "title":  post.title,
                        "text":   (post.selftext or "")[:200],
                        "score":  post.score,
                        "url":    f"https://reddit.com{post.permalink}",
                        "sub":    sub,
                        "created": datetime.fromtimestamp(
                            post.created_utc, tz=timezone.utc
                        ).isoformat(),
                    })
            except Exception as e:
                print(f"[Sentiment] Reddit sub {sub} error: {e}")

        # Tag sentiment on post titles
        positive = negative = neutral = 0
        tagged_posts = []

        if all_posts:
            texts = [p["title"] + " " + p["text"] for p in all_posts]
            for i, post in enumerate(all_posts[:15]):
                sent = await tag_sentiment(texts[i][:300], context=ticker)
                post["sentiment"] = sent
                if sent == "POSITIVE":
                    positive += 1
                elif sent == "NEGATIVE":
                    negative += 1
                else:
                    neutral += 1
                tagged_posts.append(post)

        total = positive + negative + neutral
        if total == 0:
            net_sentiment = "NEUTRAL"
        elif positive / total >= 0.6:
            net_sentiment = "POSITIVE"
        elif negative / total >= 0.6:
            net_sentiment = "NEGATIVE"
        else:
            net_sentiment = "NEUTRAL"

        result = {
            "ticker":        ticker.upper(),
            "status":        "ok",
            "mention_count": len(all_posts),
            "positive":      positive,
            "negative":      negative,
            "neutral":       neutral,
            "net_sentiment": net_sentiment,
            "top_posts":     sorted(tagged_posts, key=lambda x: x["score"], reverse=True)[:5],
            "timestamp":     datetime.now(timezone.utc).isoformat(),
        }
        cache.set(cache_key, result, ttl_seconds=1800)
        return result

    except Exception as e:
        print(f"[Sentiment] Reddit error: {e}")
        result = {
            "ticker":        ticker.upper(),
            "status":        "error",
            "reason":        str(e),
            "mention_count": 0,
            "positive":      0,
            "negative":      0,
            "neutral":       0,
            "net_sentiment": "NEUTRAL",
            "top_posts":     [],
            "timestamp":     datetime.now(timezone.utc).isoformat(),
        }
        cache.set(cache_key, result, ttl_seconds=300)
        return result


# ─── GET /sentiment/twitter ───────────────────────────────────────────────────

@router.get("/twitter")
async def twitter_sentiment(
    query: str = Query(..., description="Ticker or search term, e.g. HDFCBANK"),
):
    """
    Fetch recent tweets about a stock from public Nitter instances.
    Falls back gracefully if Twitter/Nitter is unavailable.
    """
    cache_key = f"sentiment:twitter:{query.lower()}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    nitter_instances = [
        "https://nitter.privacydev.net",
        "https://nitter.poast.org",
        "https://nitter.1d4.us",
    ]

    tweets = []

    for base in nitter_instances:
        try:
            search_url = f"{base}/search"
            params = {"f": "tweets", "q": f"#{query} OR ${query} lang:en", "since": "1d"}
            async with httpx.AsyncClient(timeout=10, headers=_HEADERS, follow_redirects=True) as client:
                resp = await client.get(search_url, params=params)
                if resp.status_code != 200:
                    continue
                html = resp.text

            tweet_blocks = re.findall(r'class="tweet-content[^"]*"[^>]*>(.*?)</div>', html, re.DOTALL)
            times = re.findall(r'title="([^"]+)"[^>]*class="tweet-date"', html)

            for i, block in enumerate(tweet_blocks[:10]):
                text = re.sub(r"<[^>]+>", "", block).strip()
                if len(text) < 10:
                    continue
                tweets.append({
                    "text":      text[:280],
                    "timestamp": times[i] if i < len(times) else "",
                    "source":    "Twitter/X",
                })

            if tweets:
                break

        except Exception as e:
            print(f"[Sentiment] Nitter {base} failed: {e}")
            continue

    # Tag sentiment on fetched tweets
    positive = negative = neutral = 0
    for tweet in tweets:
        sent = await tag_sentiment(tweet["text"], context=query)
        tweet["sentiment"] = sent
        if sent == "POSITIVE":
            positive += 1
        elif sent == "NEGATIVE":
            negative += 1
        else:
            neutral += 1

    total = positive + negative + neutral
    if total == 0:
        net_sentiment = "NEUTRAL"
        status = "unavailable" if not tweets else "ok"
    elif positive / total >= 0.6:
        net_sentiment = "POSITIVE"
        status = "ok"
    elif negative / total >= 0.6:
        net_sentiment = "NEGATIVE"
        status = "ok"
    else:
        net_sentiment = "NEUTRAL"
        status = "ok"

    result = {
        "query":         query,
        "status":        status if tweets else "unavailable",
        "reason":        None if tweets else "Twitter/X public access restricted. Nitter instances unreachable.",
        "tweet_count":   len(tweets),
        "positive":      positive,
        "negative":      negative,
        "neutral":       neutral,
        "net_sentiment": net_sentiment,
        "tweets":        tweets[:10],
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    }
    cache.set(cache_key, result, ttl_seconds=1800)
    return result


# ─── GET /sentiment/youtube ───────────────────────────────────────────────────

@router.get("/youtube")
async def youtube_sentiment(
    ticker: str = Query(..., description="Stock name or ticker, e.g. 'HDFC Bank' or 'HDFCBANK'"),
    limit:  int = Query(5, ge=1, le=10),
):
    """
    Search YouTube for recent Indian stock market videos mentioning the ticker.
    Uses YouTube Data API v3 (free key required).
    """
    api_key = os.environ.get("YOUTUBE_API_KEY", "")
    if not api_key:
        return {
            "ticker":  ticker,
            "status":  "unavailable",
            "reason":  "YOUTUBE_API_KEY not configured.",
            "videos":  [],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    cache_key = f"sentiment:youtube:{ticker.lower()}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        published_after = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")

        params = {
            "part":           "snippet",
            "q":              f"{ticker} stock India NSE",
            "type":           "video",
            "order":          "date",
            "publishedAfter": published_after,
            "relevanceLanguage": "en",
            "regionCode":     "IN",
            "maxResults":     limit,
            "key":            api_key,
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get("https://www.googleapis.com/youtube/v3/search", params=params)
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"YouTube API error: {resp.text[:200]}")
            data = resp.json()

        videos = []
        for item in data.get("items", []):
            snippet = item.get("snippet", {})
            video_id = item.get("id", {}).get("videoId", "")
            videos.append({
                "title":       snippet.get("title", ""),
                "channel":     snippet.get("channelTitle", ""),
                "published_at": snippet.get("publishedAt", ""),
                "description": snippet.get("description", "")[:200],
                "url":         f"https://www.youtube.com/watch?v={video_id}" if video_id else "",
                "thumbnail":   snippet.get("thumbnails", {}).get("default", {}).get("url", ""),
                "sentiment":   None,
            })

        # Tag sentiment on video titles
        if videos:
            videos = await tag_articles_batch(videos, context=ticker)

        result = {
            "ticker":    ticker,
            "status":    "ok",
            "total":     len(videos),
            "videos":    videos,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        cache.set(cache_key, result, ttl_seconds=3600)
        return result

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Sentiment] YouTube error: {e}")
        return {
            "ticker":  ticker,
            "status":  "error",
            "reason":  str(e),
            "videos":  [],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


# ─── GET /sentiment/trends ────────────────────────────────────────────────────

@router.get("/trends")
async def google_trends(
    ticker: str = Query(..., description="Search term, e.g. HDFCBANK or HDFC Bank"),
    days:   int = Query(7, ge=1, le=30, description="Number of days to look back"),
):
    """
    Fetch Google Trends interest data for a stock/term over the past N days.
    Uses pytrends (no API key required).
    Returns: trend direction (rising/falling/stable) + peak interest score.
    """
    cache_key = f"sentiment:trends:{ticker.lower()}:{days}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        from pytrends.request import TrendReq

        timeframe = f"today {days}-d" if days <= 7 else f"today {days}-d"

        def _fetch() -> dict:
            pytrends = TrendReq(hl="en-IN", tz=330, timeout=(10, 25))
            pytrends.build_payload([ticker], cat=0, timeframe=timeframe, geo="IN")
            df = pytrends.interest_over_time()

            if df is None or df.empty or ticker not in df.columns:
                return {"available": False}

            series = df[ticker].dropna()
            if len(series) == 0:
                return {"available": False}

            values     = series.tolist()
            peak       = int(max(values))
            current    = int(values[-1])
            avg        = sum(values) / len(values)
            first_half = values[: len(values) // 2]
            second_half= values[len(values) // 2 :]
            avg_first  = sum(first_half) / max(len(first_half), 1)
            avg_second = sum(second_half) / max(len(second_half), 1)

            if avg_second > avg_first * 1.15:
                direction = "rising"
            elif avg_second < avg_first * 0.85:
                direction = "falling"
            else:
                direction = "stable"

            dates = [str(d.date()) for d in series.index.tolist()]

            return {
                "available":   True,
                "direction":   direction,
                "peak_score":  peak,
                "current":     current,
                "average":     round(avg, 1),
                "history":     [{"date": d, "value": int(v)} for d, v in zip(dates, values)],
            }

        loop   = asyncio.get_event_loop()
        data   = await loop.run_in_executor(None, _fetch)

        result = {
            "ticker":    ticker,
            "days":      days,
            "status":    "ok" if data.get("available") else "no_data",
            **{k: v for k, v in data.items() if k != "available"},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        cache.set(cache_key, result, ttl_seconds=3600)
        return result

    except Exception as e:
        err_str = str(e).lower()
        # Google blocks pytrends in many cloud IP ranges — treat as unavailable, not error
        if "400" in err_str or "response" in err_str or "request failed" in err_str:
            status = "unavailable"
            reason = "Google Trends is unavailable from this server's IP range (cloud restriction)."
        else:
            status = "error"
            reason = str(e)
        print(f"[Sentiment] Google Trends: {reason}")
        return {
            "ticker":    ticker,
            "days":      days,
            "status":    status,
            "reason":    reason,
            "direction": "stable",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


# ─── POST /sentiment/ai-tag ───────────────────────────────────────────────────

@router.post("/ai-tag")
async def ai_tag(
    text:    str = Body(..., embed=True, description="Text to classify"),
    context: str = Body("", embed=True, description="Stock or topic context"),
):
    """
    Directly classify a single piece of text using llama-3.2-3b-instruct.
    Returns POSITIVE, NEGATIVE, or NEUTRAL.
    """
    if not text or len(text.strip()) < 3:
        raise HTTPException(status_code=400, detail="Text too short to classify.")

    sentiment = await tag_sentiment(text[:500], context=context)
    return {
        "text":      text[:100] + ("..." if len(text) > 100 else ""),
        "context":   context,
        "sentiment": sentiment,
        "model":     "meta/llama-3.2-3b-instruct",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
