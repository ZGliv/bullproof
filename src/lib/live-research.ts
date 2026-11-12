import {researchDay} from "./discovery-signals";
import {extractFundamentals,deriveValuation,type MarketObservation} from './company-fundamentals';
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type {
  CompanyResearchLive,
  DiscoveryResponse,
  FactSource,
  FinancialQuarter,
  ListedCompany,
  ResearchSignal,
  SearchResponse,
} from "./live-research-types";

const DAY = 86_400_000;
const TTL = 15 * 60_000;
const USER_AGENT =
  process.env.SEC_USER_AGENT ||
  "Bullproof financial research https://bullproof.vercel.app";
export class ResearchError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.status = status;
  }
}
type Cached<T> = {
  value: T;
  fetchedAt: string;
  stale: boolean;
  warnings: string[];
};
const cache = new Map<
  string,
  { value: unknown; fetchedAt: string; time: number }
>();
const pending = new Map<string, Promise<Cached<unknown>>>();
/** In-process gate: no more than three SEC request starts / second. Shared fleet coordination is not provided. */
let gate: Promise<void> = Promise.resolve();
let lastRequest = 0;
/** Gated SEC GET with the app's User-Agent and timeout. Callers read the body and handle non-OK statuses. */
export async function secResponse(url: string, accept = "application/json"): Promise<Response> {
  const turn = gate.then(async () => {
    const wait = Math.max(0, 350 - (Date.now() - lastRequest));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequest = Date.now();
  });
  gate = turn.catch(() => {});
  await turn;
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
}
async function secJson<T>(url: string): Promise<T> {
  try {
    const response = await secResponse(url);
    if (!response.ok)
      throw new ResearchError(
        `SEC returned HTTP ${response.status}. Try again later.`,
      );
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ResearchError) throw error;
    throw new ResearchError(
      "SEC could not be reached or returned an invalid response. Try again later.",
    );
  }
}
export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  ttl = TTL,
): Promise<Cached<T>> {
  const existing = cache.get(key);
  if (existing && Date.now() - existing.time < ttl)
    return {
      value: existing.value as T,
      fetchedAt: existing.fetchedAt,
      stale: false,
      warnings: [],
    };
  const underway = pending.get(key);
  if (underway) return underway as Promise<Cached<T>>;
  const work = (async (): Promise<Cached<T>> => {
    try {
      const value = await load();
      const fetchedAt = new Date().toISOString();
      cache.set(key, { value, fetchedAt, time: Date.now() });
      while (cache.size > 100) cache.delete(cache.keys().next().value!);
      return { value, fetchedAt, stale: false, warnings: [] };
    } catch (error) {
      if (existing && Date.now() - existing.time < DAY)
        return {
          value: existing.value as T,
          fetchedAt: existing.fetchedAt,
          stale: true,
          warnings: [
            "SEC refresh failed. Showing the last successful cached response; check its retrieval time.",
          ],
        };
      throw error;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, work);
  return work;
}

export async function universe(): Promise<Cached<ListedCompany[]>> {
  return cached(
    "universe",
    async () => {
      const data = await secJson<{ fields: string[]; data: unknown[][] }>(
        "https://www.sec.gov/files/company_tickers_exchange.json",
      );
      if (!Array.isArray(data.data) || !Array.isArray(data.fields))
        throw new ResearchError("SEC ticker directory format changed.");
      const col = (key: string) => data.fields.indexOf(key);
      const result = data.data.flatMap((row) => {
        const cik = String(row[col("cik")]);
        const ticker = row[col("ticker")];
        const name = row[col("name")];
        const exchange = row[col("exchange")];
        if (
          !/^\d{1,10}$/.test(cik) ||
          typeof ticker !== "string" ||
          typeof name !== "string" ||
          typeof exchange !== "string" ||
          !exchange
        )
          return [];
        return [{ cik: cik.padStart(10, "0"), ticker, name, exchange }];
      });
      if (!result.length)
        throw new ResearchError("SEC ticker directory was empty.");
      return result;
    },
    6 * 60 * 60_000,
  );
}
/** Conservative discovery representative; this is not a complete security master. */
function commonListings(listings: ListedCompany[]): ListedCompany[] {
  const sameIssuer = listings.filter(item => item.cik === listings[0]?.cik);
  const explicitPreferred = (ticker: string) => /-P[A-Z]+$/.test(ticker);
  const siblingDerivative = (ticker: string) => sameIssuer.some(base =>
    base.ticker !== ticker &&
    ["W", "WS", "WT", "U", "R", "-W", "-WS", "-WT", "-U", "-R"].some(suffix => ticker === base.ticker + suffix),
  );
  return sameIssuer.filter(item => !explicitPreferred(item.ticker) && !siblingDerivative(item.ticker));
}
export function chooseDiscoveryListing(listings: ListedCompany[]): ListedCompany | null {
  return commonListings(listings)[0] ?? null;
}

/** Do not present an obsolete taxonomy's last observation as current company research. */
export function assertCurrentCoverage(periodEnd: string, asOf = new Date()): void {
  const cutoff = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 18, 1));
  const monthDays = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(asOf.getUTCDate(), monthDays));
  if (periodEnd < cutoff.toISOString().slice(0, 10)) {
    throw new ResearchError(
      `The latest supported SEC quarter ended ${periodEnd}, more than 18 months ago. Current financial research is unavailable with the supported US-GAAP USD tags. Price charts remain available.`,
      422,
    );
  }
}

export async function searchCompanies(query: string): Promise<SearchResponse> {
  const q = query.trim().toUpperCase();
  if (q.length > 80)
    throw new ResearchError("Search must be 80 characters or fewer.", 400);
  if (!q)
    return {
      results: [],
      fetchedAt: new Date().toISOString(),
      stale: false,
      warnings: [],
    };
  const data = await universe();
  const score = (item: ListedCompany) =>
    item.ticker === q ? 0 : item.ticker.startsWith(q) ? 1 : 2;
  const results = data.value
    .filter(
      (item) => item.ticker.includes(q) || item.name.toUpperCase().includes(q),
    )
    .sort((a, b) => score(a) - score(b) || a.ticker.localeCompare(b.ticker))
    .slice(0, 20);
  return {
    results,
    fetchedAt: data.fetchedAt,
    stale: data.stale,
    warnings: data.warnings,
  };
}

export type SecFact = {
  start?: string;
  end: string;
  val: number;
  accn: string;
  filed: string;
  form: string;
  fy?: number;
  fp?: string;
  frame?: string;
};
export type SecCompanyFacts = {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { units: Record<string, SecFact[]> }>>;
};
const metricTags = {
  revenue: [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
  ],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
} as const;
const sourceUrl = (cik: string, accession: string) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}/${accession}-index.html`;
const days = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / DAY;
/** Only explicitly reported standalone quarters. Never reinterpret six/nine/twelve-month facts as quarters. */
export function quarterlyFacts(facts: SecFact[], asOf: string): SecFact[] {
  const byPeriod = new Map<string, SecFact>();
  for (const fact of facts) {
    const duration = fact.start ? days(fact.end, fact.start) + 1 : 0;
    if (
      !fact.start ||
      !Number.isFinite(duration) ||
      !Number.isFinite(Date.parse(fact.filed)) ||
      duration < 75 ||
      duration > 105 ||
      !Number.isFinite(fact.val) ||
      !/^10-[QK](\/A)?$/.test(fact.form) ||
      !/^\d{10}-\d{2}-\d{6}$/.test(fact.accn) ||
      fact.filed > asOf ||
      fact.end > fact.filed
    )
      continue;
    const key = `${fact.start}:${fact.end}`;
    const previous = byPeriod.get(key);
    // Later filings may revise comparative figures. Keep their accession alongside the revised value.
    if (
      !previous ||
      fact.filed > previous.filed ||
      (fact.filed === previous.filed && fact.accn > previous.accn)
    )
      byPeriod.set(key, fact);
  }
  return [...byPeriod.values()].sort((a, b) => a.end.localeCompare(b.end));
}
export function extractQuarters(
  data: SecCompanyFacts,
  asOf = new Date().toISOString().slice(0, 10),
): FinancialQuarter[] {
  const taxonomy = data.facts?.["us-gaap"] ?? {};
  const selected = Object.fromEntries(
    Object.entries(metricTags).map(([metric, tags]) => {
      const series = tags
        .map((tag) => ({
          tag,
          facts: quarterlyFacts(taxonomy[tag]?.units?.USD ?? [], asOf),
        }))
        .filter((item) => item.facts.length)
        .sort((a, b) => b.facts.at(-1)!.end.localeCompare(a.facts.at(-1)!.end));
      return [metric, series[0]];
    }),
  ) as Record<
    keyof typeof metricTags,
    { tag: string; facts: SecFact[] } | undefined
  >;
  // Revenue anchors exact reporting intervals, avoiding accidental mixes of differently scoped facts.
  return (selected.revenue?.facts ?? [])
    .slice(-12)
    .map((revenue) => {
      const sources: FinancialQuarter["sources"] = {};
      const values: Record<keyof typeof metricTags, number | null> = {
        revenue: null,
        operatingIncome: null,
        netIncome: null,
      };
      for (const metric of Object.keys(
        metricTags,
      ) as (keyof typeof metricTags)[]) {
        const series = selected[metric];
        const fact = series?.facts.find(
          (item) => item.start === revenue.start && item.end === revenue.end,
        );
        if (!fact || !series) continue;
        values[metric] = fact.val;
        sources[metric] = {
          tag: series.tag,
          accession: fact.accn,
          filed: fact.filed,
          form: fact.form,
          sourceUrl: sourceUrl(String(data.cik), fact.accn),
        };
      }
      const source = sources.revenue!;
      return {
        start: revenue.start!,
        end: revenue.end,
        ...values,
        operatingMargin:
          values.revenue !== null &&
          values.revenue > 0 &&
          values.operatingIncome !== null
            ? (values.operatingIncome / values.revenue) * 100
            : null,
        filed: source.filed,
        accession: source.accession,
        sourceUrl: source.sourceUrl,
        sources,
      };
    })
    .slice(-8);
}
export function previousYearQuarter(
  quarters: FinancialQuarter[],
  latest: FinancialQuarter,
): FinancialQuarter | undefined {
  return quarters.find((item) => {
    const endDistance = days(latest.end, item.end);
    const startDistance = days(latest.start, item.start);
    return (
      endDistance >= 350 &&
      endDistance <= 380 &&
      startDistance >= 350 &&
      startDistance <= 380 &&
      Math.abs(endDistance - startDistance) <= 7
    );
  });
}
const percentChange = (now: number | null, prior: number | null) =>
  now !== null && prior !== null && prior > 0 ? (now / prior - 1) * 100 : null;
const signed = (n: number, unit = "%") =>
  `${n >= 0 ? "+" : ""}${n.toFixed(1)}${unit}`;
export function deriveSignals(quarters: FinancialQuarter[]): ResearchSignal[] {
  const current = quarters.at(-1);
  if (!current) return [];
  const prior = previousYearQuarter(quarters, current);
  if (!prior)
    return [
      {
        id: "new-report",
        title: "A new report to inspect",
        explanation: `Quarter ended ${current.end}; a comparable prior-year standalone quarter is unavailable. No growth rate is inferred.`,
        tone: "neutral",
        revenueGrowth: null,
        operatingIncomeGrowth: null,
        marginChangePp: null,
      },
    ];
  const revenueGrowth = percentChange(current.revenue, prior.revenue);
  const operatingIncomeGrowth = percentChange(
    current.operatingIncome,
    prior.operatingIncome,
  );
  const marginChangePp =
    current.operatingMargin !== null && prior.operatingMargin !== null
      ? current.operatingMargin - prior.operatingMargin
      : null;
  const metrics = { revenueGrowth, operatingIncomeGrowth, marginChangePp };
  let id = "reported-change",
    title = "A reported financial comparison",
    tone: ResearchSignal["tone"] = "neutral";
  if (
    revenueGrowth !== null &&
    revenueGrowth > 0 &&
    marginChangePp !== null &&
    marginChangePp < -0.5
  ) {
    id = "growth-pressure";
    title = "Sales grew, but margins slipped";
    tone = "mixed";
  } else if (
    current.operatingIncome !== null &&
    prior.operatingIncome !== null &&
    current.operatingIncome > 0 &&
    prior.operatingIncome <= 0
  ) {
    id = "profit-turn";
    title = "Operating profit crossed above zero";
    tone = "positive";
  } else if (
    current.operatingIncome !== null &&
    prior.operatingIncome !== null &&
    current.operatingIncome < 0 &&
    prior.operatingIncome >= 0
  ) {
    id = "loss-turn";
    title = "Operating profit crossed below zero";
    tone = "negative";
  } else if (marginChangePp !== null && marginChangePp >= 1) {
    id = "margin-expansion";
    title =
      current.operatingIncome !== null && current.operatingIncome < 0
        ? "Operating loss narrowed relative to sales"
        : "More operating profit per sales dollar";
    tone = "positive";
  } else if (revenueGrowth !== null && revenueGrowth >= 10) {
    id = "revenue-growth";
    title = "Double-digit reported sales growth";
    tone = "positive";
  } else if (
    (revenueGrowth !== null && revenueGrowth <= -5) ||
    (marginChangePp !== null && marginChangePp <= -1)
  ) {
    id = "financial-pressure";
    title = "A weakening result worth understanding";
    tone = "negative";
  }
  const comparisons = [
    revenueGrowth !== null
      ? `revenue ${signed(revenueGrowth)}`
      : "revenue growth unavailable",
    operatingIncomeGrowth !== null
      ? `GAAP operating income ${signed(operatingIncomeGrowth)}`
      : "operating-income growth not expressed as a percentage because its prior value is nonpositive or missing",
    marginChangePp !== null
      ? `operating margin ${signed(marginChangePp, " pp")}`
      : null,
  ].filter(Boolean);
  return [
    {
      id,
      title,
      tone,
      ...metrics,
      explanation: `${current.start} to ${current.end}, compared with ${prior.start} to ${prior.end}: ${comparisons.join("; ")}. Calculated from reported USD facts; these changes do not establish their cause or the stock's value.`,
    },
  ];
}
async function companyFromListing(
  listing: ListedCompany,
): Promise<CompanyResearchLive> {
  const result = await cached(`company:${listing.cik}`, async () => {
    const data = await secJson<SecCompanyFacts>(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${listing.cik}.json`,
    );
    const quarters = extractQuarters(data);
    const latest = quarters.at(-1);
    if (!latest)
      throw new ResearchError(
        "No supported standalone USD revenue quarters are available for this company in SEC XBRL.",
        422,
      );
    assertCurrentCoverage(latest.end);
    const sources = Object.values(latest.sources) as FactSource[];
    const newest = sources.toSorted((a, b) =>
      b.filed.localeCompare(a.filed),
    )[0];
    return {
      fundamentals: extractFundamentals(data,latest.end),
      periodEnd: latest.end,
      quarters,
      signals: deriveSignals(quarters),
      sourceUrl: newest.sourceUrl,
      latestFilingDate: newest.filed,
      latestFilingForm: newest.form,
      caveats: [
        "Reported financials and indicative valuation, not a recommendation. Price and filing dates differ; inspect both.",
        "Only standard US-GAAP USD tags and explicitly reported 75–105 day quarters are included. Missing quarters are not estimated. Separate trailing totals use annual and comparable year-to-date filings when available.",
        "Later filings can revise prior periods. Each metric links to the filing used; figures may differ from the originally announced result.",
        "Reported sales changes can include acquisitions, currency effects and accounting changes. These facts do not isolate organic growth.",
        ...(days(new Date().toISOString().slice(0, 10), latest.end) > 180
          ? [
              "The latest supported quarter ended more than 180 days ago. This company is not eligible for the fresh discovery feed.",
            ]
          : []),
        ...(latest.operatingIncome !== null && latest.operatingIncome < 0
          ? [
              "The latest quarter still recorded a GAAP operating loss; an improving margin does not mean the business is profitable.",
            ]
          : []),
        ...(latest.operatingMargin !== null &&
        Math.abs(latest.operatingMargin) > 100
          ? [
              "Operating costs exceed reported revenue by a large multiple. A small revenue base can produce very large margin changes.",
            ]
          : []),
        ...(latest.operatingIncome === null
          ? [
              "GAAP operating income is not available for the latest exact reporting interval.",
            ]
          : []),
      ],
    };
  });
  assertCurrentCoverage(result.value.periodEnd);
  return {
    ...listing,
    ...result.value,
    fetchedAt: result.fetchedAt,
    stale: result.stale,
    warnings: result.warnings,
  };
}
export async function getCompanyResearch(
  ticker: string,
): Promise<CompanyResearchLive> {
  const normalized = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(normalized))
    throw new ResearchError("Enter a valid ticker.", 400);
  const directory = await universe();
  const listing = directory.value.find((item) => item.ticker === normalized);
  if (!listing)
    throw new ResearchError(
      "Ticker not found in the SEC exchange-listed directory.",
      404,
    );
  const [company] = await enrichValuations([await companyFromListing(listing)],directory.value);
  let context:CompanyResearchLive['context'];
  try {const info=await cached(`submissions:${listing.cik}`,()=>secJson<{sicDescription:string;filings:{recent:{form:string[];items:string[];filingDate:string[];accessionNumber:string[];primaryDocument:string[]}}}>(`https://data.sec.gov/submissions/CIK${listing.cik}.json`));const recent=info.value.filings.recent;const index=recent.form.findIndex((form,i)=>form==='8-K'&&recent.items[i]?.split(',').map(s=>s.trim()).includes('2.02'));context={industry:info.value.sicDescription,earningsRelease:index>=0?{date:recent.filingDate[index],url:`https://www.sec.gov/Archives/edgar/data/${Number(listing.cik)}/${recent.accessionNumber[index].replaceAll('-','')}/${recent.primaryDocument[index]}`}:null};} catch { /* Industry and earnings-event context is optional; no guessed dates. */ }
  return {
    ...company,
    context,
    stale: company.stale || directory.stale,
    warnings: [...company.warnings, ...directory.warnings],
  };
}

type Candidate = { cik: string; date: string; period: string; form: string };
type FilingSearch = {
  timed_out?: boolean;
  hits: {
    total: { value: number };
    hits: {
      _source: {
        ciks: string[];
        file_date: string;
        period_ending: string;
        form: string;
      };
    }[];
  };
};
type CandidateSet = {
  candidates: Candidate[];
  start: string;
  end: string;
  total: number;
  warnings: string[];
};
async function candidates(): Promise<Cached<CandidateSet>> {
  const end = researchDay();
  const start = new Date(Date.now() - 45 * DAY).toISOString().slice(0, 10);
  return cached(`candidates:${end}`, async () => {
    const results = await Promise.allSettled(
      ["10-Q", "10-K"].map((form) =>
        secJson<FilingSearch>(
          `https://efts.sec.gov/LATEST/search-index?dateRange=custom&startdt=${start}&enddt=${end}&forms=${form}&from=0&size=100`,
        ),
      ),
    );
    const rows: Candidate[] = [];
    let total = 0;
    const warnings: string[] = [];
    results.forEach((result, index) => {
      const form = index ? "10-K" : "10-Q";
      if (result.status === "rejected") {
        warnings.push(
          `SEC ${form} search is unavailable; coverage is incomplete.`,
        );
        return;
      }
      if (result.value.timed_out)
        warnings.push(
          `SEC ${form} search timed out partially; coverage is incomplete.`,
        );
      total += result.value.hits.total.value;
      for (const hit of result.value.hits.hits) {
        const source = hit._source;
        if (
          source.form !== form ||
          !/^\d{4}-\d{2}-\d{2}$/.test(source.period_ending)
        )
          continue;
        for (const cik of source.ciks)
          if (/^\d{1,10}$/.test(cik))
            rows.push({
              cik: cik.padStart(10, "0"),
              date: source.file_date,
              period: source.period_ending,
              form,
            });
      }
    });
    if (!rows.length)
      throw new ResearchError(
        "No recent SEC filing candidates could be loaded. Try refreshing later.",
      );
    const unique = new Map<string, Candidate>();
    rows.sort(
      (a, b) => b.date.localeCompare(a.date) || a.cik.localeCompare(b.cik),
    );
    for (const row of rows) if (!unique.has(row.cik)) unique.set(row.cik, row);
    return { candidates: [...unique.values()], start, end, total, warnings };
  });
}
type Cursor = {
  v: 1;
  remaining: Candidate[];
  asOf: string;
  start: string;
  end: string;
  candidateCount: number;
  total: number;
};
export function encodeCursor(cursor: Cursor): string {
  const encoded =
    "d1." +
    deflateRawSync(Buffer.from(JSON.stringify(cursor))).toString("base64url");
  if (encoded.length > 6_000)
    throw new ResearchError(
      "The discovery page is too large. Refresh to start a new scan.",
    );
  return encoded;
}
export function decodeCursor(value: string): Cursor {
  try {
    if (value.length > 6_000 || !/^d1\.[A-Za-z0-9_-]+$/.test(value))
      throw new Error();
    const decoded = inflateRawSync(Buffer.from(value.slice(3), "base64url"), {
      maxOutputLength: 50_000,
    });
    const cursor = JSON.parse(decoded.toString("utf8")) as Cursor;
    if (
      cursor.v !== 1 ||
      !Array.isArray(cursor.remaining) ||
      cursor.remaining.length > 200 ||
      !Number.isFinite(Date.parse(cursor.asOf)) ||
      Math.abs(Date.now() - Date.parse(cursor.asOf)) > DAY ||
      !Number.isInteger(cursor.candidateCount) ||
      cursor.candidateCount < 0 ||
      cursor.candidateCount > 200 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(cursor.start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(cursor.end) ||
      !Number.isInteger(cursor.total)
    )
      throw new Error();
    if (
      cursor.remaining.some(
        (item) =>
          !/^\d{10}$/.test(item.cik) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(item.period) ||
          !["10-Q", "10-K"].includes(item.form),
      )
    )
      throw new Error();
    cursor.remaining = [
      ...new Map(cursor.remaining.map((item) => [item.cik, item])).values(),
    ];
    return cursor;
  } catch {
    throw new ResearchError(
      "Discovery page expired or was invalid. Refresh to start again.",
      400,
    );
  }
}
export async function discoverCompanies(
  cursorValue?: string | null,
): Promise<DiscoveryResponse> {
  const deadline = Date.now() + 45_000;
  const directory = await universe();
  const byCik = new Map<string, ListedCompany>();
  const issuerListings = new Map<string, ListedCompany[]>();
  for (const listing of directory.value) {
    const siblings = issuerListings.get(listing.cik) ?? [];
    siblings.push(listing);
    issuerListings.set(listing.cik, siblings);
  }
  for (const [cik, siblings] of issuerListings) {
    const listing = chooseDiscoveryListing(siblings);
    if (listing) byCik.set(cik, listing);
  }
  let state: Cursor;
  let stale = directory.stale;
  const warnings = [...directory.warnings];
  if (cursorValue) state = decodeCursor(cursorValue);
  else {
    const seed = await candidates();
    stale ||= seed.stale;
    warnings.push(...seed.warnings, ...seed.value.warnings);
    const eligible = seed.value.candidates.filter((item) =>
      byCik.has(item.cik),
    );
    state = {
      v: 1,
      remaining: eligible.toSorted((a,b)=>discoveryOrder(a.cik,seed.value.end)-discoveryOrder(b.cik,seed.value.end)),
      asOf: seed.fetchedAt,
      start: seed.value.start,
      end: seed.value.end,
      candidateCount: eligible.length,
      total: seed.value.total,
    };
  }
  const companies: CompanyResearchLive[] = [];
  let scanned = 0,
    failed = 0,
    skipped = 0;
  // Bounded 24-company scan, rotating daily; 12 supported results per page.
  while (
    state.remaining.length &&
    companies.length < 12 &&
    scanned < 24 &&
    Date.now() + 13_500 < deadline
  ) {
    const batch = state.remaining.splice(
      0,
      Math.min(3, 24 - scanned, 12 - companies.length),
    );
    scanned += batch.length;
    const results = await Promise.allSettled(
      batch.map(async (candidate) => {
        const listing = byCik.get(candidate.cik);
        if (!listing) return null;
        const company = await companyFromListing(listing);
        const latest = company.quarters.at(-1)!;
        // A new annual filing must not make an old Q3 look like a newly reported Q4.
        if (
          latest.end !== candidate.period ||
          company.latestFilingDate < candidate.date ||
          days(state.end, latest.end) > 180 ||
          latest.operatingIncome === null
        )
          return null;
        return company;
      }),
    );
    results.forEach((result) => {
      if (result.status === "rejected") {
        failed++;
        return;
      }
      if (!result.value) {
        skipped++;
        return;
      }
      stale ||= result.value.stale;
      warnings.push(...result.value.warnings);
      companies.push(result.value);
    });
  }
  if (
    state.remaining.length &&
    companies.length < 12 &&
    Date.now() + 13_500 >= deadline
  )
    warnings.push(
      "This scan stopped at its time budget. Remaining candidates are available on the next page.",
    );
  if (failed)
    warnings.push(
      `${failed} candidate${failed === 1 ? "" : "s"} could not be loaded or had no supported USD quarters.`,
    );
  if (skipped)
    warnings.push(
      `${skipped} candidate${skipped === 1 ? "" : "s"} omitted because the new filing has no matching standalone quarter with revenue and operating income yet.`,
    );
  const enriched = await enrichValuations(companies,directory.value);
  enriched.sort((a,b)=>(a.valuation?.marketCap??Infinity)-(b.valuation?.marketCap??Infinity));
  return {
    companies: enriched,
    nextCursor: state.remaining.length ? encodeCursor(state) : null,
    fetchedAt: new Date().toISOString(),
    stale,
    warnings: [...new Set(warnings)],
    coverage: {
      universeCount: directory.value.length,
      candidateCount: state.candidateCount,
      scannedCount: scanned,
      source: "SEC EDGAR filings and Company Facts",
      asOf: state.asOf,
      description: `Daily rotating 45-day screen, smaller indicative market caps first within each page. Recent 10-Q/10-K filings dated ${state.start} through ${state.end}; up to the newest 100 filings per form (${state.total} search matches), joined to exchange-listed SEC tickers. ${scanned} candidates checked on this page. Only matching standalone USD quarters with GAAP operating income qualify. Explicit preferred-symbol groups are omitted; obvious warrant/unit/right symbols are avoided when a base sibling is listed. This is a bounded filing screen, not a complete market ranking.`,
    },
  };
}

/** Stable daily rotation avoids serving the same largest/newest names first on every visit. */
export function discoveryOrder(cik:string,day:string){let h=2166136261;for(const c of `${day}:${cik}`){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
async function enrichValuations(companies:CompanyResearchLive[],directory:ListedCompany[]):Promise<CompanyResearchLive[]> {
 if(!companies.length)return companies;
 const base=process.env.BULLPROOF_RUNNER_URL;
 let observations:Record<string,MarketObservation|null>={};
 if(base){try{const url=new URL('/market',base);if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev'))throw new Error('Invalid market host');url.searchParams.set('symbols',companies.map(c=>c.ticker).join(','));const result=await cached(`market:${url.search}`,async()=>{let r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(5000)});if(r.status===429){await new Promise(resolve=>setTimeout(resolve,1600));r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(5000)});}if(!r.ok)throw new Error('Prices unavailable');return await r.json() as {observations:Record<string,MarketObservation|null>};},5*60000);if(!result.stale)observations=result.value.observations;}catch(error){console.warn("Research price fetch failed",error instanceof Error?error.message:"unknown"); /* Financial evidence remains available. */}}
 return companies.map(c=>({...c,valuation:c.fundamentals?deriveValuation(c.fundamentals,observations[c.ticker]??null,commonListings(directory.filter(d=>d.cik===c.cik)).length>1):undefined}));
}
