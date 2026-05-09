import httpx
import re
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime

from utils.cache import cache

router = APIRouter(prefix="/screener", tags=["screener"])

SCREENER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


# ─── Screener.in fundamentals ─────────────────────────────────────────────────

@router.get("/fundamentals")
async def screener_fundamentals(
    ticker: str = Query(..., description="NSE/BSE ticker e.g. RELIANCE or RELIANCE.NS"),
):
    base = ticker.replace(".NS", "").replace(".BO", "").replace(".BSE", "").upper()
    cache_key = f"screener:{base}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    url = f"https://www.screener.in/company/{base}/"

    try:
        async with httpx.AsyncClient(
            timeout=25,
            follow_redirects=True,
            headers=SCREENER_HEADERS,
        ) as client:
            resp = await client.get(url)

        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail=f"Company '{base}' not found on Screener.in")
        if resp.status_code != 200:
            raise HTTPException(
                status_code=503,
                detail=f"Screener.in returned HTTP {resp.status_code} for {base}"
            )

        soup = BeautifulSoup(resp.text, "html.parser")
        data: dict = {
            "ticker": base,
            "source": "Screener.in",
            "url": url,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
        }

        # ── Company name ──
        name_el = soup.find("h1")
        if name_el:
            data["company_name"] = _clean(name_el.get_text())

        # ── About / description ──
        about_el = soup.find("div", class_="company-profile")
        if not about_el:
            about_el = soup.find("div", class_="about")
        if about_el:
            p = about_el.find("p")
            if p:
                data["about"] = _clean(p.get_text())[:600]

        # ── Key ratios (top-ratios section) ──
        # Screener.in uses: <ul id="top-ratios"><li>
        #   <span class="name">Market Cap</span>
        #   <span class="nowrap value">₹<span class="number">8,66,315</span></span>
        ratios_section = soup.find("ul", {"id": "top-ratios"})
        if ratios_section:
            ratios = {}
            for li in ratios_section.find_all("li"):
                name_span  = li.find("span", class_="name")
                num_span   = li.find("span", class_="number")
                if name_span and num_span:
                    key = _clean(name_span.get_text())
                    # Collect all number spans (e.g. High / Low has two)
                    nums = [_clean(s.get_text()) for s in li.find_all("span", class_="number")]
                    val  = " / ".join(nums) if len(nums) > 1 else nums[0]
                    ratios[key] = val
            data["key_ratios"] = ratios

        # ── Quarterly results table ──
        quarterly = []
        tables = soup.find_all("table", class_="data-table")
        for table in tables:
            caption = table.find("caption")
            if caption and "quarterly" in caption.get_text().lower():
                headers = [_clean(th.get_text()) for th in table.find_all("th")]
                for row in table.find_all("tr")[1:9]:  # Last 8 quarters
                    cols = [_clean(td.get_text()) for td in row.find_all("td")]
                    if cols and len(cols) == len(headers):
                        quarterly.append(dict(zip(headers, cols)))
                break
        if quarterly:
            data["quarterly_results"] = quarterly

        # ── Peer comparison ──
        peers = []
        for table in tables:
            caption = table.find("caption")
            if caption and "peer" in caption.get_text().lower():
                h = [_clean(th.get_text()) for th in table.find_all("th")]
                for row in table.find_all("tr")[1:8]:
                    cols = [_clean(td.get_text()) for td in row.find_all("td")]
                    if cols and len(cols) >= 2:
                        entry: dict = {}
                        for i, col in enumerate(cols):
                            if i < len(h):
                                entry[h[i]] = col
                        peers.append(entry)
                break
        if peers:
            data["peers"] = peers

        # ── Shareholding pattern ──
        shareholding = {}
        for table in tables:
            caption = table.find("caption")
            if caption and "shareholding" in caption.get_text().lower():
                rows = table.find_all("tr")
                for row in rows:
                    cols = row.find_all("td")
                    if len(cols) >= 2:
                        label = _clean(cols[0].get_text())
                        value = _clean(cols[-1].get_text())
                        if label:
                            shareholding[label] = value
                break
        if shareholding:
            data["shareholding"] = shareholding

        cache.set(cache_key, data, ttl_seconds=21600)  # 6-hour cache
        return data

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Screener.in scrape failed for {base}: {exc}")
