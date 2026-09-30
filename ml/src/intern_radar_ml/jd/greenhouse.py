"""Greenhouse JD fetching: direct boards, embedded ?gh_jid= pages, grnh.se links."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlsplit

from .base import MIN_JD_CHARS, FetchResult, HttpFetcher, html_to_text

_BOARD_HOSTS = {"job-boards.greenhouse.io", "boards.greenhouse.io"}
_TOKEN_PATTERNS = [
    # embed script / iframe: ...greenhouse.io/embed/job_board?for={token}...
    re.compile(r"greenhouse\.io/embed/job_board(?:/js)?\?[^\"']*for=([A-Za-z0-9_-]+)"),
    # direct board links in the page
    re.compile(r"(?:job-)?boards\.greenhouse\.io/([A-Za-z0-9_-]+)/jobs/\d+"),
    re.compile(r"boards-api\.greenhouse\.io/v1/boards/([A-Za-z0-9_-]+)/"),
]


def _fetch_from_api(http: HttpFetcher, board: str, job_id: str) -> FetchResult:
    url = f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{job_id}"
    res = http.get(url, accept="application/json")
    body: dict[str, Any] = res.json()
    content = body.get("content")
    if not content:
        return FetchResult.failed("greenhouse: no content field")
    text = html_to_text(str(content))
    if len(text) < MIN_JD_CHARS:
        return FetchResult.failed(f"greenhouse: JD too short ({len(text)} chars)")
    return FetchResult.fetched("greenhouse", text)


def _direct_ids(url: str) -> tuple[str, str] | None:
    parts = urlsplit(url)
    if parts.hostname not in _BOARD_HOSTS:
        return None
    m = re.match(r"^/([^/]+)/jobs/(\d+)", parts.path)
    return (m.group(1), m.group(2)) if m else None


def fetch(item: dict[str, Any], http: HttpFetcher) -> FetchResult:
    """item: {url, atsType, atsRef: {account?, jobId?}}."""
    ref = item.get("atsRef") or {}
    if ref.get("account") and ref.get("jobId"):
        return _fetch_from_api(http, ref["account"], ref["jobId"])

    url = item["url"]
    # grnh.se short links redirect straight to a board URL.
    if urlsplit(url).hostname == "grnh.se":
        res = http.get(url)
        ids = _direct_ids(str(res.url))
        if ids:
            return _fetch_from_api(http, *ids)
        return FetchResult.failed(
            f"greenhouse: short link resolved to non-board url {str(res.url)[:120]}"
        )

    # Embedded board: fetch the page once, extract the board token.
    job_id = ref.get("jobId")
    if not job_id:
        return FetchResult.failed("greenhouse: embedded page without gh_jid")
    page = http.get(url).text
    for pattern in _TOKEN_PATTERNS:
        m = pattern.search(page)
        if m:
            return _fetch_from_api(http, m.group(1), job_id)
    return FetchResult.failed("greenhouse: board token not found in page")
