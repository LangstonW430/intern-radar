from pathlib import Path

import httpx

from intern_radar_ml.jd import workday
from intern_radar_ml.jd.base import HttpFetcher, RateLimiter

FIXTURE = (Path(__file__).parent / "fixtures" / "workday_job.json").read_text(
    encoding="utf-8"
)


def make_http(handler) -> HttpFetcher:
    return HttpFetcher(
        transport=httpx.MockTransport(handler), rate_limiter=RateLimiter(0)
    )


def test_cxs_url_basic():
    assert workday.cxs_url(
        "https://xcelenergy.wd1.myworkdayjobs.com/External/job/Denver-CO-80223/Reliability-Data-Analyst-Intern--CO_JR115833"
    ) == (
        "https://xcelenergy.wd1.myworkdayjobs.com/wday/cxs/xcelenergy/External/job/Denver-CO-80223/Reliability-Data-Analyst-Intern--CO_JR115833"
    )


def test_cxs_url_strips_locale_segment():
    assert workday.cxs_url(
        "https://intel.wd1.myworkdayjobs.com/en-us/external/job/US-Arizona-Phoenix/Operations-Intern_JR0279579"
    ) == (
        "https://intel.wd1.myworkdayjobs.com/wday/cxs/intel/external/job/US-Arizona-Phoenix/Operations-Intern_JR0279579"
    )


def test_cxs_url_rejects_non_workday():
    assert workday.cxs_url("https://example.com/job/x") is None
    assert workday.cxs_url("https://a.wd1.myworkdayjobs.com/site-only") is None


def test_fetch_parses_cxs_response():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "/wday/cxs/xcelenergy/External/job/" in request.url.path
        return httpx.Response(200, text=FIXTURE)

    result = workday.fetch(
        {
            "url": "https://xcelenergy.wd1.myworkdayjobs.com/External/job/Denver-CO-80223/Reliability-Data-Analyst-Intern--CO_JR115833",
            "atsType": "workday",
            "atsRef": {"account": "xcelenergy"},
        },
        make_http(handler),
    )
    assert result.status == "fetched"
    assert result.source == "workday"
    assert "<" not in result.text
    assert len(result.text) > 1000
