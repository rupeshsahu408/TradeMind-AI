"""
NVIDIA NIM API client — OpenAI-compatible format.

Models used:
  - meta/llama-3.2-3b-instruct       → fast sentiment tagging, quick classifications
  - meta/llama-3.3-70b-instruct      → deep analysis, AI chat (Phase 4)
  - meta/llama-3.2-11b-vision-instruct → chart image analysis (Phase 6)

All three share the same NVIDIA_API_KEY and base URL.
"""

import os
import httpx
from typing import Optional

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

FAST_MODEL    = "meta/llama-3.2-3b-instruct"      # fast, reliable sentiment tagging
PRIMARY_MODEL = "meta/llama-3.3-70b-instruct"     # deep analysis (Phase 4)
VISION_MODEL  = "meta/llama-3.2-11b-vision-instruct"  # chart image analysis (Phase 6)


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
    timeout: int = 60,
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
    for the Indian stock market context using llama-3.2-3b (fast model).

    Returns: "POSITIVE" | "NEGATIVE" | "NEUTRAL"
    """
    system_prompt = (
        "You are a financial news sentiment classifier for Indian stock markets. "
        "Your job: classify news as POSITIVE, NEGATIVE, or NEUTRAL for the given stock or topic.\n\n"
        "Rules:\n"
        "- POSITIVE: profit beats, record earnings, strong results, upgrades, FII buying, rate cuts, acquisitions at premium, dividend increases, new orders, market share gains\n"
        "- NEGATIVE: profit miss, losses, downgrades, FII selling, crashes, fraud, regulatory action, CEO resignation, debt concerns, margin pressure, selloff\n"
        "- NEUTRAL: board meetings scheduled, no change in ratings, general market commentary, routine filings, analyst watching\n\n"
        "Reply with exactly ONE word only: POSITIVE, NEGATIVE, or NEUTRAL. No explanation."
    )
    user_content = f"Text: {text}"
    if context:
        user_content = f"Stock/Topic: {context}\nClassify this news: {text}"

    result = await chat_complete(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_content},
        ],
        model=FAST_MODEL,
        temperature=0.0,
        max_tokens=8,
    )
    if result:
        # Extract first word in case model adds punctuation or extra text
        first_word = result.strip().split()[0].upper().rstrip(".,!?:")
        if first_word in ("POSITIVE", "NEGATIVE", "NEUTRAL"):
            return first_word
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
