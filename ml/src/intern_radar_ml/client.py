"""HTTP client for the Convex export/import endpoints (shared-secret auth).

All write-backs go in batches of at most IMPORT_BATCH_MAX records per call,
and exports are paginated — mirroring the Convex side (PLAN.md D8).
"""

from __future__ import annotations

import os
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

import httpx

IMPORT_BATCH_MAX = 100
_RETRIES = 3
_TIMEOUT = httpx.Timeout(30.0, connect=10.0)


class ConvexError(RuntimeError):
    pass


@dataclass
class ConvexClient:
    base_url: str
    secret: str
    transport: httpx.BaseTransport | None = None
    _client: httpx.Client = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._client = httpx.Client(
            base_url=self.base_url.rstrip("/"),
            headers={
                "Authorization": f"Bearer {self.secret}",
                "User-Agent": "intern-radar-ml (personal project)",
            },
            timeout=_TIMEOUT,
            transport=self.transport,
        )

    @classmethod
    def from_env(cls) -> "ConvexClient":
        base_url = os.environ.get("CONVEX_SITE_URL")
        secret = os.environ.get("ML_SHARED_SECRET")
        if not base_url or not secret:
            raise ConvexError("CONVEX_SITE_URL and ML_SHARED_SECRET must be set")
        return cls(base_url=base_url, secret=secret)

    def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        last: Exception | None = None
        for attempt in range(_RETRIES):
            try:
                res = self._client.request(method, path, **kwargs)
                if res.status_code >= 500:
                    raise ConvexError(f"{method} {path} -> {res.status_code}")
                if res.status_code >= 400:
                    raise ConvexError(
                        f"{method} {path} -> {res.status_code}: {res.text[:500]}"
                    )
                return res
            except (httpx.TransportError, ConvexError) as err:
                # 4xx is our bug, not transient — don't retry it.
                if isinstance(err, ConvexError) and "-> 4" in str(err):
                    raise
                last = err
                if attempt < _RETRIES - 1:
                    time.sleep(2**attempt)
        raise ConvexError(f"{method} {path} failed after {_RETRIES} tries: {last}")

    def export_pages(self, kind: str) -> Iterator[list[dict[str, Any]]]:
        """Yields pages of export items until the cursor is exhausted."""
        cursor: str | None = None
        while True:
            params = {"kind": kind}
            if cursor:
                params["cursor"] = cursor
            body = self._request("GET", "/ml/export", params=params).json()
            page = body.get("page", [])
            if page:
                yield page
            if body.get("isDone", True):
                return
            cursor = body.get("continueCursor")
            if not cursor:
                return

    def import_jd(self, items: list[dict[str, Any]]) -> int:
        applied = 0
        for start in range(0, len(items), IMPORT_BATCH_MAX):
            batch = items[start : start + IMPORT_BATCH_MAX]
            res = self._request("POST", "/ml/import/jd", json={"items": batch})
            applied += res.json().get("applied", 0)
        return applied

    def export_training(self) -> dict[str, Any]:
        return self._request("GET", "/ml/export", params={"kind": "training"}).json()

    def import_model(
        self,
        feature_names: list[str],
        global_weights: list[float],
        user_weights: list[dict[str, Any]],
        metrics: dict[str, Any],
    ) -> dict[str, Any]:
        res = self._request(
            "POST",
            "/ml/import/model",
            json={
                "featureNames": feature_names,
                "globalWeights": global_weights,
                "userWeights": user_weights,
                "metrics": metrics,
            },
        )
        return res.json()

    def import_embeddings(
        self,
        items: list[dict[str, Any]],
        resumes: list[dict[str, Any]] | None = None,
    ) -> int:
        resumes = resumes or []
        applied = 0
        for start in range(0, max(len(items), 1), IMPORT_BATCH_MAX):
            batch = items[start : start + IMPORT_BATCH_MAX]
            batch_resumes = resumes if start == 0 else []
            if not batch and not batch_resumes:
                continue
            res = self._request(
                "POST",
                "/ml/import/embeddings",
                json={"items": batch, "resumes": batch_resumes},
            )
            applied += res.json().get("applied", 0)
        return applied
