"""Ashby JD fetching via the posting API (one call per org, cached per run)."""

from __future__ import annotations

from typing import Any

from .base import MIN_JD_CHARS, FetchResult, HttpFetcher, html_to_text

_board_cache: dict[str, dict[str, Any]] = {}


def _board(http: HttpFetcher, org: str) -> dict[str, Any]:
    if org not in _board_cache:
        url = f"https://api.ashbyhq.com/posting-api/job-board/{org}"
        _board_cache[org] = http.get(url, accept="application/json").json()
    return _board_cache[org]


def clear_cache() -> None:
    _board_cache.clear()


def fetch(item: dict[str, Any], http: HttpFetcher) -> FetchResult:
    ref = item.get("atsRef") or {}
    org, job_id = ref.get("account"), ref.get("jobId")
    if not org or not job_id:
        return FetchResult.failed("ashby: missing org/jobId in url")

    jobs = _board(http, org).get("jobs") or []
    job = next((j for j in jobs if j.get("id") == job_id), None)
    if job is None:
        return FetchResult.failed("ashby: job not on the org's board (closed?)")

    text = job.get("descriptionPlain") or html_to_text(
        str(job.get("descriptionHtml") or "")
    )
    text = str(text).strip()
    if len(text) < MIN_JD_CHARS:
        return FetchResult.failed(f"ashby: JD too short ({len(text)} chars)")
    return FetchResult.fetched("ashby", text)
