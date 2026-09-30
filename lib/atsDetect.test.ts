import { describe, expect, it } from "vitest";
import { detectAts } from "./atsDetect";

describe("detectAts", () => {
  it("direct greenhouse board", () => {
    expect(
      detectAts("https://job-boards.greenhouse.io/boxinc/jobs/7550753"),
    ).toEqual({
      atsType: "greenhouse",
      atsRef: { account: "boxinc", jobId: "7550753" },
    });
  });

  it("embedded greenhouse via gh_jid", () => {
    expect(detectAts("https://stripe.com/jobs/search?gh_jid=7874965")).toEqual({
      atsType: "greenhouse_embedded",
      atsRef: { jobId: "7874965" },
    });
  });

  it("greenhouse short link", () => {
    expect(detectAts("https://grnh.se/abfli75k1us")).toEqual({
      atsType: "greenhouse_embedded",
      atsRef: {},
    });
  });

  it("lever", () => {
    expect(
      detectAts(
        "https://jobs.lever.co/palantir/d5486403-c050-4920-b2e0-91b69b61ebb2/apply",
      ),
    ).toEqual({
      atsType: "lever",
      atsRef: {
        account: "palantir",
        jobId: "d5486403-c050-4920-b2e0-91b69b61ebb2",
      },
    });
  });

  it("ashby", () => {
    expect(
      detectAts(
        "https://jobs.ashbyhq.com/confluent/95338ba6-bdcd-4a0e-86e8-e30cf6308c31/application",
      ),
    ).toEqual({
      atsType: "ashby",
      atsRef: {
        account: "confluent",
        jobId: "95338ba6-bdcd-4a0e-86e8-e30cf6308c31",
      },
    });
  });

  it("workday", () => {
    expect(
      detectAts(
        "https://bloomenergy.wd1.myworkdayjobs.com/bloomenergycareers/job/San-Jose-California/Data-Analyst-Intern_JR-21562",
      ),
    ).toEqual({ atsType: "workday", atsRef: { account: "bloomenergy" } });
  });

  it("icims", () => {
    expect(
      detectAts(
        "https://careers-gtsx.icims.com/jobs/1588/job?mobile=true&needsRedirect=false",
      ),
    ).toEqual({ atsType: "icims", atsRef: { jobId: "1588" } });
  });

  it("oracle", () => {
    expect(
      detectAts(
        "https://ekcf.fa.us6.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/6812",
      ),
    ).toEqual({ atsType: "oracle", atsRef: { jobId: "6812" } });
  });

  it("everything else, including invalid urls", () => {
    expect(
      detectAts("https://lifeattiktok.com/search/7629250876813642037").atsType,
    ).toBe("other");
    expect(detectAts("not a url").atsType).toBe("other");
  });
});
