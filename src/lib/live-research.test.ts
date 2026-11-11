import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertCurrentCoverage,
  chooseDiscoveryListing,
  decodeCursor,
  encodeCursor,
  deriveSignals,
  extractQuarters,
  previousYearQuarter,
  quarterlyFacts,
  type SecCompanyFacts,
  type SecFact,
} from "./live-research";
import type { FinancialQuarter } from "./live-research-types";

const packCursor = (value: unknown) =>
  "d1." +
  deflateRawSync(Buffer.from(JSON.stringify(value))).toString("base64url");
const fact = (overrides: Partial<SecFact> = {}): SecFact => ({
  start: "2026-07-01",
  end: "2026-09-30",
  val: 120,
  filed: "2026-10-25",
  accn: "0000000001-26-000001",
  form: "10-Q",
  ...overrides,
});
const dataset = (
  revenue: SecFact[],
  operating: SecFact[] = [],
): SecCompanyFacts => ({
  cik: 1,
  entityName: "Fixture",
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: { USD: revenue },
      },
      OperatingIncomeLoss: { units: { USD: operating } },
    },
  },
});
const quarter = (
  year: number,
  revenue = 100,
  income = 10,
): FinancialQuarter => ({
  start: `${year}-07-01`,
  end: `${year}-09-30`,
  revenue,
  operatingIncome: income,
  netIncome: null,
  operatingMargin: (income / revenue) * 100,
  filed: `${year}-10-25`,
  accession: "0000000001-26-000001",
  sourceUrl: "https://www.sec.gov/",
  sources: {},
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

describe("SEC reporting-period safeguards", () => {
  it("rejects cumulative, annual, instant, future and non-financial-report observations", () => {
    const observations = [
      fact(),
      fact({ start: "2026-01-01" }),
      fact({ start: "2025-10-01" }),
      fact({ start: undefined }),
      fact({ filed: "2026-11-01" }),
      fact({ form: "8-K" }),
      fact({ start: "bad" }),
      fact({ val: NaN }),
    ];
    expect(quarterlyFacts(observations, "2026-10-27")).toEqual([fact()]);
  });
  it("keeps revised values with the later filing source, without using future revisions", () => {
    const original = fact({ val: 100, filed: "2026-10-20" }),
      revision = fact({
        val: 90,
        filed: "2026-10-26",
        accn: "0000000001-26-000002",
      });
    expect(quarterlyFacts([revision, original], "2026-10-27")).toEqual([
      revision,
    ]);
    expect(quarterlyFacts([revision, original], "2026-10-25")).toEqual([
      original,
    ]);
  });
  it("requires exact profit/revenue intervals and USD; does not synthesize missing profit", () => {
    const input = dataset([fact()], [fact({ start: "2026-01-01", val: 20 })]);
    input.facts["us-gaap"].NetIncomeLoss = {
      units: { EUR: [fact({ val: 10 })] },
    };
    const [q] = extractQuarters(input, "2026-10-27");
    expect(q.revenue).toBe(120);
    expect(q.operatingIncome).toBeNull();
    expect(q.operatingMargin).toBeNull();
    expect(q.netIncome).toBeNull();
    expect(q.sources.revenue?.sourceUrl).toContain("000000000126000001");
  });
  it("chooses a current revenue taxonomy over a discontinued tag and keeps provenance", () => {
    const input = dataset([
      fact({ start: "2024-07-01", end: "2024-09-30", filed: "2024-10-25" }),
    ]);
    input.facts["us-gaap"].Revenues = { units: { USD: [fact({ val: 450 })] } };
    const [q] = extractQuarters(input, "2026-10-27");
    expect(q.revenue).toBe(450);
    expect(q.sources.revenue?.tag).toBe("Revenues");
  });
  it("matches prior-year reporting dates, not the previous item or misleading fiscal-year label", () => {
    const now = quarter(2026),
      prior = quarter(2025),
      unrelated = { ...quarter(2025), start: "2025-01-01", end: "2025-03-31" };
    expect(previousYearQuarter([unrelated, prior, now], now)).toBe(prior);
    expect(previousYearQuarter([unrelated, now], now)).toBeUndefined();
  });
  it("supports 52/53 week calendars but rejects mismatched period lengths", () => {
    const now = { ...quarter(2026), start: "2026-06-28", end: "2026-09-26" },
      prior = { ...quarter(2025), start: "2025-06-29", end: "2025-09-27" };
    expect(previousYearQuarter([prior], now)).toBe(prior);
    expect(
      previousYearQuarter([{ ...prior, start: "2025-06-01" }], now),
    ).toBeUndefined();
  });
  it("reports margin differences in percentage points and suppresses loss-base percentage growth", () => {
    const signal = deriveSignals([
      quarter(2025, 100, -20),
      quarter(2026, 120, -12),
    ])[0];
    expect(signal.revenueGrowth).toBeCloseTo(20);
    expect(signal.operatingIncomeGrowth).toBeNull();
    expect(signal.marginChangePp).toBe(10);
    expect(signal.title).toContain("loss");
  });
  it("distinguishes growth with margin pressure and crossing from losses to profit", () => {
    expect(
      deriveSignals([quarter(2025, 100, 20), quarter(2026, 120, 12)])[0].id,
    ).toBe("growth-pressure");
    expect(
      deriveSignals([quarter(2025, 100, -5), quarter(2026, 120, 12)])[0].id,
    ).toBe("profit-turn");
  });
  it("does not invent growth without a year-ago quarter", () => {
    expect(deriveSignals([quarter(2026)])[0]).toMatchObject({
      id: "new-report",
      revenueGrowth: null,
      operatingIncomeGrowth: null,
      marginChangePp: null,
    });
  });
});

describe("request and cache honesty", () => {
  it("coalesces directory requests, ranks exact matches, retains timestamps on stale failure and expires stale data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fields: ["cik", "name", "ticker", "exchange"],
        data: [
          [1, "Apple Fixture", "AAPL", "Nasdaq"],
          [2, "Other Apple", "AAP", "NYSE"],
        ],
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    const { searchCompanies } = await import("./live-research");
    const [first, second] = await Promise.all([
      searchCompanies("AAPL"),
      searchCompanies("apple"),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.results[0].ticker).toBe("AAPL");
    expect(second.results).toHaveLength(2);
    expect(fetcher.mock.calls[0][1].headers["User-Agent"]).toContain(
      "Bullproof",
    );
    vi.setSystemTime(new Date("2026-10-27T19:00:00Z"));
    fetcher.mockRejectedValue(new Error("offline"));
    const stale = await searchCompanies("AAPL");
    expect(stale.stale).toBe(true);
    expect(stale.fetchedAt).toBe(first.fetchedAt);
    expect(stale.warnings.length).toBeGreaterThan(0);
    vi.setSystemTime(new Date("2026-10-28T13:00:00Z"));
    await expect(searchCompanies("AAPL")).rejects.toThrow("SEC");
  });
  it("fails explicitly with no cached data instead of returning fictional companies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );
    const { searchCompanies } = await import("./live-research");
    await expect(searchCompanies("AAPL")).rejects.toMatchObject({
      status: 503,
    });
  });
  it("rejects malformed or expired pagination, allowing only bounded SEC company IDs", () => {
    expect(() => decodeCursor("not-json")).toThrow("invalid");
    const state = {
      v: 1,
      remaining: [
        {
          cik: "../../secret",
          date: "2026-10-27",
          period: "2026-09-30",
          form: "10-Q",
        },
      ],
      asOf: new Date().toISOString(),
      start: "2026-10-13",
      end: "2026-10-27",
      candidateCount: 1,
      total: 1,
    };
    expect(() => decodeCursor(packCursor(state))).toThrow("invalid");
    state.remaining[0].cik = "0000000001";
    expect(decodeCursor(packCursor(state)).remaining).toHaveLength(1);
    state.asOf = "2020-01-01";
    expect(() => decodeCursor(packCursor(state))).toThrow("expired");
    expect(() => decodeCursor("d1." + "a".repeat(6000))).toThrow("invalid");
    expect(() => decodeCursor(packCursor("a".repeat(50_001)))).toThrow(
      "invalid",
    );
    expect(() => decodeCursor("d1.invalid_deflate")).toThrow("invalid");
  });
});

describe("live discovery refresh and pagination", () => {
  it("compresses a full 200-company cursor below the URL budget and round-trips it", () => {
    const state = {
      v: 1 as const,
      remaining: Array.from({ length: 200 }, (_, i) => ({
        cik: String(100000 + i * 797).padStart(10, "0"),
        date: "2026-10-27",
        period: "2026-09-30",
        form: "10-Q",
      })),
      asOf: new Date().toISOString(),
      start: "2026-10-13",
      end: "2026-10-27",
      candidateCount: 200,
      total: 315,
    };
    const encoded = encodeCursor(state);
    expect(encoded.length).toBeLessThan(6000);
    expect(decodeCursor(encoded)).toEqual(state);
  });
  it("keeps a page cursor stable, and fetches a new filing snapshot after the cache interval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    let generation = 0;
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("company_tickers_exchange"))
        return {
          ok: true,
          json: async () => ({
            fields: ["cik", "name", "ticker", "exchange"],
            data: Array.from({ length: 15 }, (_, i) => [
              i + 1,
              `Company ${i + 1}`,
              `T${i + 1}`,
              "NYSE",
            ]),
          }),
        };
      if (url.includes("search-index"))
        return {
          ok: true,
          json: async () => ({
            hits: {
              total: { value: url.includes("10-K") ? 0 : 14 },
              hits: url.includes("10-K")
                ? []
                : Array.from({ length: 14 }, (_, i) => ({
                    _source: {
                      ciks: [String(i + 1 + generation).padStart(10, "0")],
                      file_date: "2026-10-25",
                      period_ending: "2026-09-30",
                      form: "10-Q",
                    },
                  })),
            },
          }),
        };
      const cik = Number(url.match(/CIK(\d+)/)?.[1]);
      return {
        ok: true,
        json: async () => ({
          ...dataset([fact({ val: 100 + cik })], [fact({ val: 10 })]),
          cik,
        }),
      };
    });
    vi.stubGlobal("fetch", fetcher);
    const { discoverCompanies } = await import("./live-research");
    const firstPending = discoverCompanies();
    await vi.runAllTimersAsync();
    const first = await firstPending;
    expect(first.companies).toHaveLength(12);
    const firstTickers=first.companies.map(c=>c.ticker);
    expect(first.nextCursor).not.toBeNull();
    generation = 1;
    const nextPending = discoverCompanies(first.nextCursor);
    await vi.runAllTimersAsync();
    const next = await nextPending;
    expect(next.companies).toHaveLength(2);
    expect(new Set([...firstTickers,...next.companies.map(c=>c.ticker)]).size).toBe(14);
    expect(next.coverage.asOf).toBe(first.coverage.asOf);
    const cachedPending = discoverCompanies();
    await vi.runAllTimersAsync();
    const beforeExpiry = await cachedPending;
    expect(beforeExpiry.companies.map(c=>c.ticker)).toEqual(firstTickers);
    vi.setSystemTime(new Date("2026-10-27T12:16:00Z"));
    const freshPending = discoverCompanies();
    await vi.runAllTimersAsync();
    const fresh = await freshPending;
    expect(fresh.companies.map(c=>c.ticker)).not.toContain("T1");
    expect(fresh.coverage.asOf).not.toBe(first.coverage.asOf);
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).includes("forms=10-Q")),
    ).toHaveLength(2);
  });
});


describe("current research coverage and security identity", () => {
  const listings = (...tickers: string[]) => tickers.map(ticker => ({ticker, cik: "0000000001", name: "Issuer", exchange: "Nasdaq"}));
  it("selects an existing base sibling instead of obvious warrants, units and rights", () => {
    for (const [derivative, common] of [["BEATW", "BEAT"], ["SWAGW", "SWAG"], ["FSHPU", "FSHP"], ["TEST-WS", "TEST"], ["TESTR", "TEST"]]) {
      expect(chooseDiscoveryListing(listings(derivative, common))?.ticker).toBe(common);
    }
  });
  it("does not infer a warrant from a final W alone or rewrite ordinary share classes", () => {
    expect(chooseDiscoveryListing(listings("W"))?.ticker).toBe("W");
    expect(chooseDiscoveryListing(listings("ARW"))?.ticker).toBe("ARW");
    expect(chooseDiscoveryListing(listings("BRK-B", "BRK-A"))?.ticker).toBe("BRK-B");
    expect(chooseDiscoveryListing(listings("ACLEW", "ADIS"))?.ticker).toBe("ACLEW");
  });
  it("excludes explicit preferred-only groups and uses listed common siblings", () => {
    expect(chooseDiscoveryListing(listings("OAK-PA", "OAK-PB"))).toBeNull();
    expect(chooseDiscoveryListing(listings("JPM-PC", "JPM"))?.ticker).toBe("JPM");
    expect(chooseDiscoveryListing([])).toBeNull();
  });
  it("rejects obsolete quarters at an exact calendar-month boundary", () => {
    const today = new Date("2026-10-28T12:00:00Z");
    expect(() => assertCurrentCoverage("2014-09-30", today)).toThrow("18 months");
    expect(() => assertCurrentCoverage("2025-04-27", today)).toThrow();
    expect(() => assertCurrentCoverage("2025-04-28", today)).not.toThrow();
    expect(() => assertCurrentCoverage("2025-02-28", new Date("2026-08-31T12:00:00Z"))).not.toThrow();
  });
  it("returns explicit 422 for a company whose current taxonomy is unsupported", async () => {
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => ({ok: true, json: async () => url.includes("company_tickers_exchange")
      ? {fields: ["cik", "name", "ticker", "exchange"], data: [[1, "Old taxonomy fixture", "OLD", "NYSE"]]}
      : dataset([fact({start: "2014-07-01", end: "2014-09-30", filed: "2015-11-02"})])
    })));
    const {getCompanyResearch} = await import("./live-research");
    const result = getCompanyResearch("OLD").catch(error => error);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({status: 422, message: expect.stringContaining("Price charts remain available")});
  });
});

it('prefers reported total revenue over a narrower same-period contract revenue tag',()=>{
 const d=dataset([fact({val:10})],[fact({val:15})]);d.facts['us-gaap'].Revenues={units:{USD:[fact({val:100})]}};
 const q=extractQuarters(d,'2026-10-29').at(-1)!;expect(q.revenue).toBe(100);expect(q.operatingMargin).toBe(15);expect(q.sources.revenue?.tag).toBe('Revenues');
});
