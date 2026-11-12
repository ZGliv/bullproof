import { describe, expect, it, vi } from "vitest";
import { filingIndexUrl, findReleases, getPacket, packetRelease, type Filing } from "./sec";

// Real rows from SEC submissions JSON: [accession, form, items, filingDate, reportDate, acceptanceDateTime].
type Row = [string, string, string, string, string, string];

function filings(rows: Row[]): Filing[] {
  return rows.map(([accession, form, items, filingDate, reportDate, acceptedAt]) => ({
    accession,
    form,
    items: items.split(","),
    filingDate,
    reportDate,
    acceptedAt: new Date(acceptedAt).toISOString(),
    primaryDocument: "",
  }));
}

const LSTR: Row[] = [
  ["0001193125-25-168028", "10-Q", "", "2025-07-29", "2025-06-28", "2025-07-29T20:26:54.000Z"],
  ["0001193125-25-168015", "8-K", "2.02,7.01,9.01", "2025-07-29", "2025-07-29", "2025-07-29T20:19:58.000Z"],
  ["0001193125-25-118922", "10-Q", "", "2025-05-13", "2025-03-29", "2025-05-13T21:04:38.000Z"],
  ["0001193125-25-118369", "8-K", "2.02,7.01,9.01", "2025-05-13", "2025-05-13", "2025-05-13T12:42:21.000Z"],
  ["0001193125-25-095315", "8-K", "2.02,7.01,9.01", "2025-04-25", "2025-04-25", "2025-04-25T13:42:48.000Z"],
  ["0001193125-25-071384", "8-K", "2.02", "2025-04-02", "2025-04-02", "2025-04-02T20:30:18.000Z"],
  ["0001193125-25-033543", "10-K", "", "2025-02-24", "2024-12-28", "2025-02-24T22:25:09.000Z"],
  ["0001193125-25-015775", "8-K", "2.02,7.01,9.01", "2025-01-29", "2025-01-29", "2025-01-29T21:38:46.000Z"],
];

const HELE: Row[] = [
  ["0000916789-23-000045", "10-Q", "", "2023-10-04", "2023-08-31", "2023-10-04T10:55:37.000Z"],
  ["0000916789-23-000044", "8-K", "2.02,5.02,9.01", "2023-10-04", "2023-10-04", "2023-10-04T10:49:58.000Z"],
  ["0000916789-23-000035", "8-K", "2.02,9.01", "2023-07-12", "2023-07-10", "2023-07-12T20:40:14.000Z"],
  ["0000916789-23-000033", "10-Q", "", "2023-07-10", "2023-05-31", "2023-07-10T11:00:31.000Z"],
  ["0000916789-23-000019", "8-K", "2.02,9.01", "2023-05-01", "2023-04-26", "2023-05-01T20:10:40.000Z"],
  ["0000916789-23-000017", "10-K", "", "2023-04-27", "2023-02-28", "2023-04-27T12:01:14.000Z"],
  ["0000916789-23-000012", "8-K", "2.02,7.01,9.01", "2023-04-19", "2023-04-19", "2023-04-19T20:05:53.000Z"],
];

const PENG: Row[] = [
  ["0001616533-26-000050", "10-K", "", "2026-10-20", "2026-08-28", "2026-10-20T20:38:41.000Z"],
  ["0001193125-26-415645", "8-K", "2.02,5.02,7.01,9.01", "2026-10-06", "2026-10-06", "2026-10-06T20:34:08.000Z"],
  ["0001616533-26-000046", "8-K", "2.02,9.01", "2026-10-06", "2026-10-06", "2026-10-06T20:27:15.000Z"],
  ["0001616533-26-000043", "10-Q", "", "2026-07-07", "2026-05-29", "2026-07-07T20:35:46.000Z"],
  ["0001616533-26-000041", "8-K", "2.02,9.01", "2026-07-07", "2026-07-07", "2026-07-07T20:09:58.000Z"],
  ["0001193125-26-292527", "8-K/A", "5.02", "2026-07-01", "2026-05-26", "2026-07-01T20:05:08.000Z"],
];

const AAPL: Row[] = [
  ["0000320193-26-000026", "10-K", "", "2026-11-03", "2026-09-26", "2026-11-03T13:05:15.000Z"],
  ["0000320193-26-000024", "8-K", "2.02,9.01", "2026-11-02", "2026-11-02", "2026-11-02T21:30:23.000Z"],
  ["0000320193-26-000020", "10-Q", "", "2026-07-31", "2026-06-27", "2026-07-31T10:01:02.000Z"],
  ["0000320193-26-000018", "8-K", "2.02,9.01", "2026-07-30", "2026-07-30", "2026-07-30T20:30:28.000Z"],
];

const summary = (rows: Row[], cik: string) =>
  findReleases(filings(rows), cik).map((r) => [r.accession, r.periodEnd]);

describe("findReleases", () => {
  it("picks the 2.02 8-K filed closest to the periodic report, dropping mid-quarter updates", () => {
    expect(summary(LSTR, "853816")).toEqual([
      ["0001193125-25-168015", "2025-06-28"],
      ["0001193125-25-118369", "2025-03-29"],
      ["0001193125-25-015775", "2024-12-28"],
    ]);
  });

  it("matches late filers whose 8-K comes days after the periodic report", () => {
    expect(summary(HELE, "916789")).toEqual([
      ["0000916789-23-000044", "2023-08-31"],
      ["0000916789-23-000035", "2023-05-31"],
      ["0000916789-23-000019", "2023-02-28"],
    ]);
    const late = findReleases(filings(HELE), "916789")[2];
    expect(late.reportDate).toBe("2023-04-26");
    expect(late.acceptedAt).toBe("2023-05-01T20:10:40.000Z");
  });

  it("takes the earliest of two same-day 2.02 8-Ks and ignores 8-K/A", () => {
    expect(summary(PENG, "1616533")).toEqual([
      ["0001616533-26-000046", "2026-08-28"],
      ["0001616533-26-000041", "2026-05-29"],
    ]);
  });

  it("counts a 2.02 8-K with no periodic report yet as this quarter's release", () => {
    const beforeTenK = AAPL.slice(1);
    expect(summary(beforeTenK, "320193")).toEqual([
      ["0000320193-26-000024", null],
      ["0000320193-26-000018", "2026-06-27"],
    ]);
    expect(summary(AAPL, "320193")[0]).toEqual(["0000320193-26-000024", "2026-09-26"]);
  });

  it("takes the earliest of two same-day 2.02 8-Ks when no periodic report has matched them yet", () => {
    expect(summary(PENG.slice(1), "1616533")[0]).toEqual(["0001616533-26-000046", null]);
  });

  it("links each release to its filing index and returns true UTC acceptance times", () => {
    const [newest] = findReleases(filings(AAPL), "0000320193");
    expect(newest.url).toBe(
      "https://www.sec.gov/Archives/edgar/data/320193/000032019326000024/0000320193-26-000024-index.htm",
    );
    expect(newest.acceptedAt).toBe("2026-11-02T21:30:23.000Z");
    expect(filingIndexUrl("0000320193", "0000320193-26-000024")).toBe(newest.url);
  });

  it("returns nothing for issuers without 2.02 8-Ks", () => {
    expect(findReleases(filings(AAPL.filter((row) => row[1] !== "8-K")), "320193")).toEqual([]);
  });
});

// URBN files its results 8-Ks under Items 8.01/9.01 since 2017; its last Item 2.02 8-K is from 2016.
const URBN: Row[] = [
  ["0001193125-26-386468", "10-Q", "", "2026-09-09", "2026-07-31", "2026-09-09T20:17:16.000Z"],
  ["0001193125-26-369924", "8-K", "8.01,9.01", "2026-08-27", "2026-08-26", "2026-08-27T14:38:50.000Z"],
  ["0001193125-26-263929", "10-Q", "", "2026-06-09", "2026-04-30", "2026-06-09T20:50:20.000Z"],
  ["0001193125-16-790744", "10-Q", "", "2016-12-12", "2016-10-31", "2016-12-12T21:14:59.000Z"],
  ["0001193125-16-776037", "8-K", "2.02,9.01", "2016-11-23", "2016-11-22", "2016-11-23T16:09:02.000Z"],
  ["0001193125-16-704216", "10-Q", "", "2016-09-08", "2016-07-31", "2016-09-08T12:18:52.000Z"],
];

// ISRG pre-announced Q4 2025 on 2026-01-14 (Item 2.02) and released full results on 2026-01-22.
const ISRG: Row[] = [
  ["0001035267-26-000003", "8-K", "2.02,9.01", "2026-01-14", "2026-01-14", "2026-01-14T13:58:49.000Z"],
  ["0001035267-25-000211", "8-K", "5.02", "2025-12-18", "2025-12-16", "2025-12-18T22:02:23.000Z"],
  ["0001035267-25-000209", "10-Q", "", "2025-10-22", "2025-09-30", "2025-10-22T21:18:20.000Z"],
  ["0001035267-25-000206", "8-K", "2.02,9.01", "2025-10-21", "2025-10-21", "2025-10-21T20:03:44.000Z"],
  ["0001035267-25-000192", "10-Q", "", "2025-07-23", "2025-06-30", "2025-07-23T20:53:33.000Z"],
  ["0001035267-25-000183", "8-K", "2.02,9.01", "2025-07-22", "2025-07-22", "2025-07-22T20:03:52.000Z"],
];

describe("packetRelease", () => {
  const periodic = (rows: Row[]) => filings(rows).find((f) => f.form !== "8-K") ?? null;
  const verdict = (rows: Row[], cik: string, asOf: string, skip = 0) => {
    const result = packetRelease("T", findReleases(filings(rows), cik).slice(skip), periodic(rows), asOf);
    return "ok" in result ? result.reason : result.accession;
  };

  it("serves the release that covers the newest periodic report", () => {
    expect(verdict(LSTR, "853816", "2025-09-20T01:30:00.000Z")).toBe("0001193125-25-168015");
  });

  it("refuses when the company reported within the last 45 days", () => {
    expect(verdict(LSTR, "853816", "2025-08-20T01:30:00.000Z")).toBe("already-reported");
    expect(verdict(AAPL.slice(1), "320193", "2026-11-12T01:30:00.000Z")).toBe("already-reported");
  });

  it("refuses a years-old release from an issuer that moved results off Item 2.02", () => {
    expect(verdict(URBN, "912615", "2026-11-12T01:30:00.000Z")).toBe("stale-release");
  });

  it("refuses a matching release once it is older than a quarter allows", () => {
    expect(verdict(LSTR, "853816", "2025-12-20T01:30:00.000Z")).toBe("stale-release");
  });

  it("serves the previous quarter once a preliminary pre-announcement is set aside", () => {
    const asOf = "2026-01-22T01:30:00.000Z";
    expect(verdict(ISRG, "1035267", asOf)).toBe("already-reported");
    expect(verdict(ISRG, "1035267", asOf, 1)).toBe("0001035267-25-000206");
  });

  it("refuses issuers without 2.02 8-Ks", () => {
    expect(verdict(AAPL.filter((row) => row[1] !== "8-K"), "320193", "2026-12-20T01:30:00.000Z")).toBe("not-8k-filer");
  });
});

describe("getPacket", () => {
  it("throws on an SEC throttle instead of returning a refusal the worker would record as a skip", async () => {
    const fetch = vi.fn(async () => new Response("Request Rate Threshold Exceeded", { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(getPacket("CSCO", new Date().toISOString())).rejects.toThrow(/HTTP 403/);
      // Cooling down: the next packet fails without another request to SEC.
      await expect(getPacket("INTU", new Date().toISOString())).rejects.toThrow(/rate limiting/);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
