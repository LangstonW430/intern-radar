"""iCIMS JD fetching via the plain mobile job page (probed on real listings;
no Playwright needed so far — revisit only if hosted portals stop serving
static HTML).

Extraction, in order:
1. the JSON-LD JobPosting block most portals embed (description field)
2. fallback: the iCIMS_Expandable_Text content sections
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlsplit

from .base import MIN_JD_CHARS, FetchResult, HttpFetcher, html_to_text

_JSON_LD = re.compile(
    r"<script[^>]*type=[\"']application/ld\+json[\"'][^>]*>([\s\S]*?)</script>",
    re.IGNORECASE,
)
_SECTION_HEADER = re.compile(
    r"<h2[^>]*class=\"iCIMS_InfoMsg[^\"]*\"[^>]*>([\s\S]*?)</h2>", re.IGNORECASE
)
_EXPANDABLE = re.compile(
    r"<div[^>]*class=\"iCIMS_Expandable_Text\"[^>]*>([\s\S]*?)</div>", re.IGNORECASE
)
_NOT_FOUND = re.compile(r"requested job could not be found", re.IGNORECASE)


def job_page_url(listing_url: str) -> str | None:
    parts = urlsplit(listing_url)
    host = parts.hostname or ""
    if not host.endswith(".icims.com"):
        return None
    m = re.search(r"/jobs/(\d+)/", parts.path)
    if not m:
        return None
    return f"https://{host}/jobs/{m.group(1)}/job?mobile=true&needsRedirect=false"


def _from_json_ld(page: str) -> str | None:
    for m in _JSON_LD.finditer(page):
        try:
            data: Any = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        candidates = data if isinstance(data, list) else [data]
        for entry in candidates:
            if (
                isinstance(entry, dict)
                and entry.get("@type") == "JobPosting"
                and entry.get("description")
            ):
                return html_to_text(str(entry["description"]))
    return None


def _from_sections(page: str) -> str | None:
    headers = [html_to_text(m.group(1)) for m in _SECTION_HEADER.finditer(page)]
    bodies = [html_to_text(m.group(1)) for m in _EXPANDABLE.finditer(page)]
    parts = [p for pair in zip(headers, bodies) for p in pair if p]
    # More bodies than headers (or vice versa) still yields usable text.
    leftovers = bodies[len(headers) :]
    text = "\n".join(parts + leftovers).strip()
    return text or None


def fetch(item: dict[str, Any], http: HttpFetcher) -> FetchResult:
    url = job_page_url(item["url"])
    if url is None:
        return FetchResult.failed("icims: could not parse job id from url")
    page = http.get(url).text
    if _NOT_FOUND.search(page):
        return FetchResult.failed("icims: job no longer exists on the portal")
    text = _from_json_ld(page) or _from_sections(page)
    if not text or len(text) < MIN_JD_CHARS:
        return FetchResult.failed(
            f"icims: no extractable JD ({len(text or '')} chars)"
        )
    return FetchResult.fetched("icims", text)
