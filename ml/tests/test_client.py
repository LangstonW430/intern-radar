import json

import httpx
import pytest

from intern_radar_ml.client import ConvexClient, ConvexError


def make_client(handler) -> ConvexClient:
    return ConvexClient(
        base_url="https://example.convex.site",
        secret="test-secret",
        transport=httpx.MockTransport(handler),
    )


def test_auth_header_and_pagination():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.headers["Authorization"] == "Bearer test-secret"
        cursor = request.url.params.get("cursor")
        if cursor is None:
            return httpx.Response(
                200,
                json={"page": [{"id": 1}], "isDone": False, "continueCursor": "c1"},
            )
        assert cursor == "c1"
        return httpx.Response(
            200, json={"page": [{"id": 2}], "isDone": True, "continueCursor": None}
        )

    client = make_client(handler)
    pages = list(client.export_pages("embed_pending"))
    assert pages == [[{"id": 1}], [{"id": 2}]]
    assert len(calls) == 2


def test_import_batching_caps_at_100():
    bodies = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        return httpx.Response(200, json={"applied": len(body["items"])})

    client = make_client(handler)
    items = [{"listingId": str(i)} for i in range(250)]
    applied = client.import_jd(items)
    assert applied == 250
    assert [len(b["items"]) for b in bodies] == [100, 100, 50]


def test_retries_5xx_then_succeeds():
    attempts = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        if len(attempts) < 3:
            return httpx.Response(500)
        return httpx.Response(200, json={"page": [], "isDone": True})

    client = make_client(handler)
    assert list(client.export_pages("jd_pending")) == []
    assert len(attempts) == 3


def test_no_retry_on_4xx():
    attempts = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        return httpx.Response(400, text="bad request")

    client = make_client(handler)
    with pytest.raises(ConvexError):
        list(client.export_pages("nope"))
    assert len(attempts) == 1
