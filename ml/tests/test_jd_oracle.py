from pathlib import Path

import httpx

from intern_radar_ml.jd import oracle
from intern_radar_ml.jd.base import HttpFetcher, RateLimiter

FIXTURE = (Path(__file__).parent / "fixtures" / "oracle_requisition.json").read_text(
    encoding="utf-8"
)


def make_http(handler) -> HttpFetcher:
    return HttpFetcher(
        transport=httpx.MockTransport(handler), rate_limiter=RateLimiter(0)
    )


def test_parse_url_variants():
    assert oracle.parse_url(
        "https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26013191"
    ) == ("egug.fa.us2.oraclecloud.com", "CX_1", "26013191")
    assert oracle.parse_url(
        "https://x.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2002/requisitions/preview/123"
    ) == ("x.fa.ocs.oraclecloud.com", "CX_2002", "123")
    assert oracle.parse_url("https://example.com/sites/CX_1/job/1") is None


def test_fetch_joins_description_sections():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "recruitingCEJobRequisitionDetails" in request.url.path
        assert 'Id=%2226013191%22' in str(request.url) or 'Id="26013191"' in str(
            request.url
        )
        return httpx.Response(200, text=FIXTURE)

    result = oracle.fetch(
        {
            "url": "https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26013191",
            "atsType": "oracle",
            "atsRef": {"jobId": "26013191"},
        },
        make_http(handler),
    )
    assert result.status == "fetched"
    assert result.source == "oracle"
    assert "<" not in result.text
    assert len(result.text) > 2000


def test_fetch_missing_requisition_fails_soft():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"items": []})

    result = oracle.fetch(
        {
            "url": "https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/999",
            "atsType": "oracle",
            "atsRef": {},
        },
        make_http(handler),
    )
    assert result.status == "failed"
