import time
import httpx
from typing import Optional

NSE_BASE = "https://www.nseindia.com"

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

NSE_API_HEADERS = {
    "User-Agent": _BROWSER_UA,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
    "X-Requested-With": "XMLHttpRequest",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "Connection": "keep-alive",
}

NSE_HOME_HEADERS = {
    "User-Agent": _BROWSER_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


class NSESession:
    """Manages NSE India cookie session for authenticated API calls."""

    def __init__(self):
        self._cookies: dict = {}
        self._last_refresh: float = 0
        self._refresh_interval: int = 600  # re-fetch cookies every 10 minutes

    async def _refresh_cookies(self) -> None:
        try:
            async with httpx.AsyncClient(
                timeout=20,
                follow_redirects=True,
                headers=NSE_HOME_HEADERS,
            ) as client:
                resp = await client.get(NSE_BASE)
                self._cookies = dict(resp.cookies)
                self._last_refresh = time.time()
                print(f"[NSE] Session cookies refreshed. Got {len(self._cookies)} cookies.")
        except Exception as exc:
            print(f"[NSE] Cookie refresh failed: {exc}")

    async def get(self, path: str) -> Optional[dict]:
        """Make an authenticated GET request to the NSE India API."""
        if time.time() - self._last_refresh > self._refresh_interval or not self._cookies:
            await self._refresh_cookies()

        url = f"{NSE_BASE}{path}"
        try:
            async with httpx.AsyncClient(
                timeout=15,
                cookies=self._cookies,
                headers=NSE_API_HEADERS,
                follow_redirects=True,
            ) as client:
                resp = await client.get(url)

                if resp.status_code == 200:
                    return resp.json()

                if resp.status_code in (401, 403):
                    # Session expired — refresh and retry once
                    await self._refresh_cookies()
                    async with httpx.AsyncClient(
                        timeout=15,
                        cookies=self._cookies,
                        headers=NSE_API_HEADERS,
                        follow_redirects=True,
                    ) as client2:
                        resp2 = await client2.get(url)
                        if resp2.status_code == 200:
                            return resp2.json()

                print(f"[NSE] API returned {resp.status_code} for {path}")
                return None

        except Exception as exc:
            print(f"[NSE] Request failed for {path}: {exc}")
            return None


# Singleton instance
nse_session = NSESession()
