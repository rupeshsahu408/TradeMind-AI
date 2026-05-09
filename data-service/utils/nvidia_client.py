"""
NVIDIA NIM API client — OpenAI-compatible format.

Models used:
  - google/gemma-4-31b-it  → fast sentiment tagging, quick classifications
  - openai/gpt-oss-120b    → deep analysis (Phase 4)
  - google/paligemma       → chart image analysis (Phase 6)

All three share the same NVIDIA_API_KEY and base URL.
"""

import os
import httpx
from typing import Optional

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

FAST_MODEL    = "google/gemma-4-31b-it"
PRIMARY_MODEL = "openai/gpt-oss-120b"
VISION_MODEL  = "google/paligemma"


def _get_key() -> str:
    key = os.environ.get("NVIDIA_API_KEY", "")
    if not key:
        raise RuntimeError("NVIDIA_API_KEY is not configured.")
    return key


async def chat_complete(
    messages: list[dict],
    model: str = FAST_MODEL,
    temperature: float = 0.2,
    max_tokens: int = 256,
    timeout: int = 30,
) -> Optional[str]:
    """
    Send a chat completion request to NVIDIA NIM.
    Returns the assistant message content string, or None on failure.
    """
    try:
        headers = {
            "Authorization": f"Bearer {_get_key()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{NVIDIA_BASE_URL}/chat/completions",
                headers=headers,
                json=payload,
            )
            if resp.status_code != 200:
                print(f"[NVIDIA] Error {resp.status_code}: {resp.text[:200]}")
                return None
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"[NVIDIA] chat_complete failed: {e}")
        return None


async def tag_sentiment(text: str, context: str = "") -> str:
    """
    Classify a news headline/summary as POSITIVE, NEGATIVE, or NEUTRAL
    for the Indian stock market context using gemma (fast model).

    Returns: "POSITIVE" | "NEGATIVE" | "NEUTRAL"
    """
    system_prompt = (
        "You are a financial news sentiment classifier for Indian stock markets. "
        "Classify the given text as POSITIVE, NEGATIVE, or NEUTRAL from a stock market perspective. "
        "Reply with exactly one word: POSITIVE, NEGATIVE, or NEUTRAL. Nothing else."
    )
    user_content = f"Text: {text}"
    if context:
        user_content = f"Stock/Topic: {context}\nText: {text}"

    result = await chat_complete(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_content},
        ],
        model=FAST_MODEL,
        temperature=0.1,
        max_tokens=5,
    )
    if result and result.upper() in ("POSITIVE", "NEGATIVE", "NEUTRAL"):
        return result.upper()
    return "NEUTRAL"


async def tag_articles_batch(articles: list[dict], context: str = "") -> list[dict]:
    """
    Tag a list of articles with sentiment. Runs up to 5 in parallel to avoid
    overwhelming the API. Each article dict must have a 'title' key.
    Returns the same list with 'sentiment' key filled in.
    """
    import asyncio

    if not articles:
        return articles

    key_available = bool(os.environ.get("NVIDIA_API_KEY"))
    if not key_available:
        for a in articles:
            a["sentiment"] = "NEUTRAL"
        return articles

    async def _tag_one(article: dict) -> dict:
        text = article.get("title", "") + " " + article.get("summary", "")
        article["sentiment"] = await tag_sentiment(text[:400], context)
        return article

    BATCH = 5
    tagged = []
    for i in range(0, len(articles), BATCH):
        batch = articles[i : i + BATCH]
        results = await asyncio.gather(*[_tag_one(a) for a in batch], return_exceptions=True)
        for r in results:
            if isinstance(r, Exception):
                tagged.append({**batch[0], "sentiment": "NEUTRAL"})
            else:
                tagged.append(r)
    return tagged
