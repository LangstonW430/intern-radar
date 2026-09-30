"""Oracle Recruiting Cloud JD fetching via the candidate-experience REST API
(probed 20/20 on real Summer 2027 listings).

URL shape:  https://{host}/hcmUI/CandidateExperience/{lang}/sites/{site}/job/{id}
Endpoint:   https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails
            ?expand=all&onlyData=true&finder=ById;Id="{id}",siteNumber={site}
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlsplit

from .base import MIN_JD_CHARS, FetchResult, HttpFetcher, html_to_text

_URL_PATTERNS = [
    re.compile(r"/sites/([^/]+)/job/(\d+)"),
    re.compile(r"/sites/([^/]+)/requisitions/preview/(\d+)"),
]

_DESCRIPTION_FIELDS = [
    "ExternalDescriptionStr",
    "ExternalResponsibilitiesStr",
    "ExternalQualificationsStr",
    "CorporateDescriptionStr",
]


def parse_url(listing_url: str) -> tuple[str, str, str] | None:
    """Returns (host, site, requisition id)."""
    parts = urlsplit(listing_url)
    if not (parts.hostname or "").endswith(".oraclecloud.com"):
        return None
    for pattern in _URL_PATTERNS:
        m = pattern.search(parts.path)
        if m:
            return (parts.hostname or "", m.group(1), m.group(2))
    return None


def fetch(item: dict[str, Any], http: HttpFetcher) -> FetchResult:
    parsed = parse_url(item["url"])
    if parsed is None:
        return FetchResult.failed("oracle: could not parse site/id from url")
    host, site, req_id = parsed
    url = (
        f"https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails"
        f"?expand=all&onlyData=true&finder=ById;Id=%22{req_id}%22,siteNumber={site}"
    )
    res = http.get(url, accept="application/json")
    body: dict[str, Any] = res.json()
    items = body.get("items") or []
    if not items:
        return FetchResult.failed("oracle: requisition not found")
    parts = [
        html_to_text(str(items[0][field]))
        for field in _DESCRIPTION_FIELDS
        if items[0].get(field)
    ]
    text = "\n".join(p for p in parts if p)
    if len(text) < MIN_JD_CHARS:
        return FetchResult.failed(f"oracle: JD too short ({len(text)} chars)")
    return FetchResult.fetched("oracle", text)
