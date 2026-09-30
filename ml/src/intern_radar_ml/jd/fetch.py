"""JD fetch orchestrator: pulls pending listings, dispatches per ATS,
pushes results back in batches. One bad listing or host never breaks the run.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx

from ..client import ConvexClient
from . import ashby, greenhouse, icims, lever, oracle, workday
from .base import FetchResult, HttpFetcher

Fetcher = Callable[[dict[str, Any], HttpFetcher], FetchResult]

FETCHERS: dict[str, Fetcher] = {
    "greenhouse": greenhouse.fetch,
    "greenhouse_embedded": greenhouse.fetch,
    "lever": lever.fetch,
    "ashby": ashby.fetch,
    "workday": workday.fetch,
    "oracle": oracle.fetch,
    "icims": icims.fetch,
}


def fetch_one(item: dict[str, Any], http: HttpFetcher) -> FetchResult | None:
    """Returns None for ATS types whose fetcher isn't built yet (stay pending)."""
    fetcher = FETCHERS.get(item.get("atsType", ""))
    if fetcher is None:
        return None
    try:
        return fetcher(item, http)
    except httpx.HTTPStatusError as err:
        return FetchResult.failed(f"http {err.response.status_code}")
    except Exception as err:  # fail soft, always
        return FetchResult.failed(str(err))


def run_jd_fetch(client: ConvexClient, http: HttpFetcher | None = None) -> dict[str, int]:
    http = http or HttpFetcher()
    ashby.clear_cache()
    counts = {"fetched": 0, "failed": 0, "unsupported": 0, "skipped": 0}

    for page in client.export_pages("jd_pending"):
        results: list[dict[str, Any]] = []
        for item in page:
            result = fetch_one(item, http)
            if result is None:
                counts["skipped"] += 1
                continue
            counts[result.status] += 1
            payload: dict[str, Any] = {
                "listingId": item["listingId"],
                "jdStatus": result.status,
            }
            if result.source:
                payload["jdSource"] = result.source
            if result.text:
                payload["jdText"] = result.text
            if result.error:
                payload["jdError"] = result.error
            results.append(payload)
        if results:
            client.import_jd(results)
        print(f"jd: {counts}")
    return counts
