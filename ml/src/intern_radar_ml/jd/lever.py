"""Lever JD fetching via the public postings API."""

from __future__ import annotations

from typing import Any

from .base import MIN_JD_CHARS, FetchResult, HttpFetcher, html_to_text


def fetch(item: dict[str, Any], http: HttpFetcher) -> FetchResult:
    ref = item.get("atsRef") or {}
    account, job_id = ref.get("account"), ref.get("jobId")
    if not account or not job_id:
        return FetchResult.failed("lever: missing account/jobId in url")

    url = f"https://api.lever.co/v0/postings/{account}/{job_id}"
    res = http.get(url, accept="application/json")
    body: dict[str, Any] = res.json()

    parts: list[str] = []
    if body.get("descriptionPlain"):
        parts.append(str(body["descriptionPlain"]))
    for lst in body.get("lists") or []:
        if lst.get("text"):
            parts.append(str(lst["text"]))
        if lst.get("content"):
            parts.append(html_to_text(str(lst["content"])))
    if body.get("additionalPlain"):
        parts.append(str(body["additionalPlain"]))

    text = "\n".join(p.strip() for p in parts if p and p.strip())
    if len(text) < MIN_JD_CHARS:
        return FetchResult.failed(f"lever: JD too short ({len(text)} chars)")
    return FetchResult.fetched("lever", text)
