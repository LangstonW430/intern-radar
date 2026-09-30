import json
from pathlib import Path

import httpx

from intern_radar_ml.jd import ashby, greenhouse, lever
from intern_radar_ml.jd.base import HttpFetcher, RateLimiter
from intern_radar_ml.jd.fetch import fetch_one

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def make_http(handler) -> HttpFetcher:
    return HttpFetcher(
        transport=httpx.MockTransport(handler), rate_limiter=RateLimiter(0)
    )


def test_greenhouse_direct():
    def handler(request: httpx.Request) -> httpx.Response:
        assert (
            request.url.path == "/v1/boards/aquaticcapitalmanagement/jobs/8489186002"
        )
        return httpx.Response(200, text=fixture("greenhouse_job.json"))

    result = greenhouse.fetch(
        {
            "url": "https://job-boards.greenhouse.io/aquaticcapitalmanagement/jobs/8489186002",
            "atsType": "greenhouse",
            "atsRef": {"account": "aquaticcapitalmanagement", "jobId": "8489186002"},
        },
        make_http(handler),
    )
    assert result.status == "fetched"
    assert result.source == "greenhouse"
    assert "<" not in result.text  # cleaned, never HTML
    assert len(result.text) > 500


def test_greenhouse_embedded_resolves_board_token_from_page():
    page_html = """<html><body>
      <div id="grnhse_app"></div>
      <script src="https://boards.greenhouse.io/embed/job_board/js?for=stripetoken"></script>
    </body></html>"""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "stripe.com":
            return httpx.Response(200, text=page_html)
        assert request.url.path == "/v1/boards/stripetoken/jobs/7874965"
        return httpx.Response(200, text=fixture("greenhouse_job.json"))

    result = greenhouse.fetch(
        {
            "url": "https://stripe.com/jobs/search?gh_jid=7874965",
            "atsType": "greenhouse_embedded",
            "atsRef": {"jobId": "7874965"},
        },
        make_http(handler),
    )
    assert result.status == "fetched"


def test_greenhouse_short_link_follows_redirect():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "grnh.se":
            return httpx.Response(
                302,
                headers={
                    "Location": "https://job-boards.greenhouse.io/scm/jobs/123"
                },
            )
        if request.url.host == "job-boards.greenhouse.io":
            return httpx.Response(200, text="<html>board page</html>")
        assert request.url.path == "/v1/boards/scm/jobs/123"
        return httpx.Response(200, text=fixture("greenhouse_job.json"))

    result = greenhouse.fetch(
        {"url": "https://grnh.se/abc", "atsType": "greenhouse_embedded", "atsRef": {}},
        make_http(handler),
    )
    assert result.status == "fetched"


def test_lever():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == (
            "/v0/postings/palantir/d5486403-c050-4920-b2e0-91b69b61ebb2"
        )
        return httpx.Response(200, text=fixture("lever_posting.json"))

    result = lever.fetch(
        {
            "url": "https://jobs.lever.co/palantir/d5486403-c050-4920-b2e0-91b69b61ebb2/apply",
            "atsType": "lever",
            "atsRef": {
                "account": "palantir",
                "jobId": "d5486403-c050-4920-b2e0-91b69b61ebb2",
            },
        },
        make_http(handler),
    )
    assert result.status == "fetched"
    assert "<" not in result.text
    assert len(result.text) > 500


def test_ashby_uses_one_board_call_per_org():
    ashby.clear_cache()
    board = json.loads(fixture("ashby_board.json"))
    job_ids = [j["id"] for j in board["jobs"]]
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(200, text=fixture("ashby_board.json"))

    http = make_http(handler)
    for job_id in job_ids:
        result = ashby.fetch(
            {
                "url": f"https://jobs.ashbyhq.com/mercor/{job_id}",
                "atsType": "ashby",
                "atsRef": {"account": "mercor", "jobId": job_id},
            },
            http,
        )
        assert result.status == "fetched"
    assert len(calls) == 1  # board response cached across jobs
    ashby.clear_cache()


def test_ashby_closed_job_fails_soft():
    ashby.clear_cache()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=fixture("ashby_board.json"))

    result = ashby.fetch(
        {
            "url": "https://jobs.ashbyhq.com/mercor/00000000-0000-0000-0000-000000000000",
            "atsType": "ashby",
            "atsRef": {
                "account": "mercor",
                "jobId": "00000000-0000-0000-0000-000000000000",
            },
        },
        make_http(handler),
    )
    assert result.status == "failed"
    ashby.clear_cache()


def test_fetch_one_fails_soft_on_exceptions():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    result = fetch_one(
        {
            "url": "https://jobs.lever.co/x/y",
            "atsType": "lever",
            "atsRef": {"account": "x", "jobId": "y"},
        },
        make_http(handler),
    )
    assert result.status == "failed"
    assert "404" in result.error


def test_fetch_one_skips_unbuilt_sources():
    assert fetch_one({"atsType": "icims", "url": "x"}, make_http(lambda r: None)) is None
    assert fetch_one({"atsType": "other", "url": "x"}, make_http(lambda r: None)) is None
