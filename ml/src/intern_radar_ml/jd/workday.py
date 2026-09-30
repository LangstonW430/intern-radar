"""Workday JD fetching via the internal CXS JSON endpoint the career pages
use (probed 20/20 on real Summer 2027 listings). No headless browser.

URL shape:  https://{tenant}.wd{n}.myworkdayjobs.com/({locale}/)?{site}/job/({location}/)?{externalPath}
Endpoint:   https://{host}/wday/cxs/{tenant}/{site}/job/{externalPath}
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import unquote, urlsplit

from .base import MIN_JD_CHARS, FetchResult, HttpFetcher, html_to_text

_LOCALE = re.compile(r"^[a-z]{2}-[A-Za-z]{2}$", re.IGNORECASE)


def cxs_url(listing_url: str) -> str | None:
    parts = urlsplit(listing_url)
    host = parts.hostname or ""
    m = re.match(r"^([^.]+)\.wd\d+\.myworkdayjobs\.com$", host)
    if not m:
        return None
    tenant = m.group(1)
    segments = [unquote(s) for s in parts.path.split("/") if s]
    if segments and _LOCALE.match(segments[0]):
        segments = segments[1:]
    if "job" not in segments:
        return None
    job_idx = segments.index("job")
    if job_idx == 0 or job_idx == len(segments) - 1:
        return None
    site = segments[0]
    external_path = "/".join(segments[job_idx + 1 :])
    return f"https://{host}/wday/cxs/{tenant}/{site}/job/{external_path}"


def fetch(item: dict[str, Any], http: HttpFetcher) -> FetchResult:
    url = cxs_url(item["url"])
    if url is None:
        return FetchResult.failed("workday: could not derive cxs url")
    res = http.get(url, accept="application/json")
    body: dict[str, Any] = res.json()
    description = (body.get("jobPostingInfo") or {}).get("jobDescription")
    if not description:
        return FetchResult.failed("workday: no jobDescription in cxs response")
    text = html_to_text(str(description))
    if len(text) < MIN_JD_CHARS:
        return FetchResult.failed(f"workday: JD too short ({len(text)} chars)")
    return FetchResult.fetched("workday", text)
