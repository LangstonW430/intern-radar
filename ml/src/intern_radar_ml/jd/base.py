"""Shared rules for all JD fetching (owner Change 1):

- per-host rate limiting (~1 request / 2 s per host)
- honest User-Agent
- exponential backoff on 429/5xx/transport errors; no retry on 4xx
- cleaned text only — raw HTML never leaves this module
- fail soft: any exception becomes a FetchResult, never a crash
"""

from __future__ import annotations

import html as html_module
import re
import time
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx

USER_AGENT = "intern-radar (personal project; contact via github.com/LangstonW430/intern-radar)"
HOST_INTERVAL_SECONDS = 2.0
_RETRIES = 3
_TIMEOUT = httpx.Timeout(20.0, connect=10.0)

# A JD shorter than this is a fetch that "worked" but got a stub page.
MIN_JD_CHARS = 200


@dataclass
class FetchResult:
    status: str  # fetched | failed | unsupported
    source: str | None = None
    text: str | None = None
    error: str | None = None

    @classmethod
    def fetched(cls, source: str, text: str) -> "FetchResult":
        return cls(status="fetched", source=source, text=text)

    @classmethod
    def failed(cls, error: str) -> "FetchResult":
        return cls(status="failed", error=error[:500])

    @classmethod
    def unsupported(cls, error: str) -> "FetchResult":
        return cls(status="unsupported", error=error[:500])


class RateLimiter:
    def __init__(self, interval: float = HOST_INTERVAL_SECONDS) -> None:
        self._interval = interval
        self._last: dict[str, float] = {}

    def wait(self, host: str) -> None:
        now = time.monotonic()
        ready_at = self._last.get(host, 0.0) + self._interval
        if now < ready_at:
            time.sleep(ready_at - now)
        self._last[host] = time.monotonic()


class HttpFetcher:
    """The one HTTP door for all JD fetching."""

    def __init__(
        self,
        transport: httpx.BaseTransport | None = None,
        rate_limiter: RateLimiter | None = None,
    ) -> None:
        self._client = httpx.Client(
            headers={"User-Agent": USER_AGENT},
            timeout=_TIMEOUT,
            follow_redirects=True,
            transport=transport,
        )
        self._limiter = rate_limiter or RateLimiter()

    def get(self, url: str, accept: str | None = None) -> httpx.Response:
        """GET with per-host rate limiting and backoff. Raises on final failure."""
        host = urlsplit(url).hostname or "unknown"
        headers = {"Accept": accept} if accept else {}
        last: Exception | None = None
        for attempt in range(_RETRIES):
            self._limiter.wait(host)
            try:
                res = self._client.get(url, headers=headers)
                if res.status_code == 429 or res.status_code >= 500:
                    retry_after = res.headers.get("Retry-After")
                    delay = float(retry_after) if retry_after else 2.0**attempt
                    last = RuntimeError(f"status {res.status_code}")
                    if attempt < _RETRIES - 1:
                        time.sleep(min(delay, 30.0))
                    continue
                res.raise_for_status()
                return res
            except httpx.HTTPStatusError:
                raise  # 4xx — our problem or gone; never retried
            except httpx.TransportError as err:
                last = err
                if attempt < _RETRIES - 1:
                    time.sleep(2.0**attempt)
        raise RuntimeError(f"GET {url} failed after {_RETRIES} tries: {last}")


_BLOCK_TAGS = re.compile(
    r"<(script|style|noscript)[^>]*>[\s\S]*?</\1>", re.IGNORECASE
)
_BREAKS = re.compile(r"</(p|div|li|ul|ol|h[1-6]|tr|br)>|<br\s*/?>", re.IGNORECASE)
_TAGS = re.compile(r"<[^>]+>")


def html_to_text(raw: str) -> str:
    """Entity-decode + strip tags + normalize whitespace. Never returns HTML."""
    text = raw
    # Greenhouse double-escapes: content arrives as &lt;p&gt;…
    for _ in range(2):
        if "<" not in text and "&lt;" in text:
            text = html_module.unescape(text)
    text = _BLOCK_TAGS.sub(" ", text)
    text = _BREAKS.sub("\n", text)
    text = _TAGS.sub(" ", text)
    text = html_module.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*\n\s*", "\n", text)
    return text.strip()
