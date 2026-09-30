from pathlib import Path

import httpx

from intern_radar_ml.jd import icims
from intern_radar_ml.jd.base import HttpFetcher, RateLimiter

FIXTURE = (Path(__file__).parent / "fixtures" / "icims_job.html").read_text(
    encoding="utf-8"
)


def make_http(handler) -> HttpFetcher:
    return HttpFetcher(
        transport=httpx.MockTransport(handler), rate_limiter=RateLimiter(0)
    )


def test_job_page_url():
    assert icims.job_page_url(
        "https://careers-gtsx.icims.com/jobs/1588/job?mobile=true&needsRedirect=false"
    ) == "https://careers-gtsx.icims.com/jobs/1588/job?mobile=true&needsRedirect=false"
    assert icims.job_page_url(
        "https://careers-americas.icims.com/jobs/26266/software-engineer-intern/job"
    ) == "https://careers-americas.icims.com/jobs/26266/job?mobile=true&needsRedirect=false"
    assert icims.job_page_url("https://example.com/jobs/1/job") is None


def test_fetch_extracts_json_ld_description():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=FIXTURE)

    result = icims.fetch(
        {
            "url": "https://careers-westernsouthern.icims.com/jobs/25207/job",
            "atsType": "icims",
            "atsRef": {"jobId": "25207"},
        },
        make_http(handler),
    )
    assert result.status == "fetched"
    assert result.source == "icims"
    assert "<" not in result.text
    assert len(result.text) > 2000


def test_fetch_falls_back_to_sections_without_json_ld():
    page = """<html><body>
      <h2 class="iCIMS_InfoMsg iCIMS_InfoField_Job">Overview</h2>
      <div class="iCIMS_Expandable_Text">%s</div>
    </body></html>""" % ("A real description sentence. " * 20)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=page)

    result = icims.fetch(
        {"url": "https://x.icims.com/jobs/1/job", "atsType": "icims", "atsRef": {}},
        make_http(handler),
    )
    assert result.status == "fetched"
    assert result.text.startswith("Overview")


def test_fetch_detects_dead_job_page():
    page = "<html><body><h2>Error: The requested job could not be found.</h2>" + (
        "Other search results filler text. " * 100
    ) + "</body></html>"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=page)

    result = icims.fetch(
        {"url": "https://x.icims.com/jobs/1/job", "atsType": "icims", "atsRef": {}},
        make_http(handler),
    )
    assert result.status == "failed"
    assert "no longer exists" in result.error
