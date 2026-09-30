import time

import httpx
import pytest

from intern_radar_ml.jd.base import HttpFetcher, RateLimiter, html_to_text


def test_html_to_text_strips_tags_and_scripts():
    html = "<div><script>var x=1;</script><p>Hello <b>world</b></p><style>p{}</style></div>"
    assert html_to_text(html) == "Hello world"


def test_html_to_text_handles_greenhouse_double_escaping():
    escaped = "&lt;p&gt;Build &amp;amp; ship software&lt;/p&gt;"
    assert html_to_text(escaped) == "Build & ship software"


def test_html_to_text_preserves_line_structure():
    html = "<ul><li>One</li><li>Two</li></ul>"
    assert html_to_text(html) == "One\nTwo"


def test_rate_limiter_spaces_same_host_only():
    limiter = RateLimiter(interval=0.2)
    start = time.monotonic()
    limiter.wait("a.com")
    limiter.wait("b.com")
    assert time.monotonic() - start < 0.15  # different hosts: no wait
    limiter.wait("a.com")
    assert time.monotonic() - start >= 0.2  # same host: spaced


def test_fetcher_retries_5xx_and_gives_up():
    attempts = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        return httpx.Response(500)

    fetcher = HttpFetcher(
        transport=httpx.MockTransport(handler), rate_limiter=RateLimiter(0)
    )
    with pytest.raises(RuntimeError, match="failed after"):
        fetcher.get("https://example.com/x")
    assert len(attempts) == 3


def test_fetcher_does_not_retry_404():
    attempts = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        return httpx.Response(404)

    fetcher = HttpFetcher(
        transport=httpx.MockTransport(handler), rate_limiter=RateLimiter(0)
    )
    with pytest.raises(httpx.HTTPStatusError):
        fetcher.get("https://example.com/x")
    assert len(attempts) == 1


def test_fetcher_sends_honest_user_agent():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["ua"] = request.headers["User-Agent"]
        return httpx.Response(200, text="ok")

    fetcher = HttpFetcher(
        transport=httpx.MockTransport(handler), rate_limiter=RateLimiter(0)
    )
    fetcher.get("https://example.com/x")
    assert "intern-radar" in seen["ua"]
