/**
 * SEC EDGAR side of the earnings-calls product (Node only: it shares the
 * process-wide SEC gate, User-Agent and ticker directory with live-research.ts).
 */
import { cached, ResearchError, secResponse, universe } from "@/lib/live-research";
import {
  earningsReleaseScore,
  htmlToText,
  isPreliminaryRelease,
  mdnaText,
  parseFilingIndex,
  pressReleaseExhibit,
  pressReleaseText,
  wordCount,
} from "./extract";
import type {
  EarningsRelease,
  EvidenceDoc,
  IsoInstant,
  PacketResponse,
  ReleasesResponse,
  SessionDate,
} from "./types";

const DAY = 86_400_000;
const MAX_RELEASES = 14;
const HISTORY_YEARS = 3;
/** Eight past reactions make a line; one spare covers a reaction lost to a missing bar. */
const ENOUGH_RELEASES = 9;
/** JPM-sized filers fill one page per month. */
const MAX_HISTORY_PAGES = 16;
/** Releases accepted within this many days before asOf mean the company has already reported. */
const REPORTED_WINDOW_DAYS = 45;
/** Consecutive quarterly releases are ~90 days apart; an older newest release means releases went missing. */
const STALE_RELEASE_DAYS = 125;
/** Exhibits and periodic reports never change once filed. */
const DOCUMENT_TTL = DAY;
/** A quarter is at least ~89 days, so a 2.02 8-K earlier than this after the last period end is intra-quarter. */
const MIN_QUARTER_DAYS = 85;
const MIN_PRESS_RELEASE_WORDS = 100;

export interface Filing {
  accession: string;
  form: string;
  items: string[];
  filingDate: SessionDate;
  reportDate: SessionDate | null;
  acceptedAt: IsoInstant;
  primaryDocument: string;
}

interface FilingColumns {
  accessionNumber: string[];
  form: string[];
  items: string[];
  filingDate: string[];
  reportDate: string[];
  acceptanceDateTime: string[];
  primaryDocument: string[];
}

interface Submissions {
  name: string;
  filings: { recent: FilingColumns; files: { name: string; filingFrom: string; filingTo: string }[] };
}

interface CompanyFilings {
  ticker: string;
  cik: string;
  name: string;
  filings: Filing[];
  releases: EarningsRelease[];
  sharesOutstanding: number | null;
}

const RELEVANT_FORMS = new Set(["8-K", "10-Q", "10-K"]);

function toFilings(columns: FilingColumns): Filing[] {
  const filings: Filing[] = [];
  columns.form.forEach((form, i) => {
    if (!RELEVANT_FORMS.has(form)) return;
    const accepted = new Date(columns.acceptanceDateTime[i]);
    if (Number.isNaN(accepted.getTime())) return;
    filings.push({
      accession: columns.accessionNumber[i],
      form,
      items: (columns.items[i] ?? "").split(",").map((item) => item.trim()),
      filingDate: columns.filingDate[i],
      reportDate: columns.reportDate[i] || null,
      acceptedAt: accepted.toISOString(),
      primaryDocument: columns.primaryDocument[i],
    });
  });
  return filings;
}

function addDays(date: SessionDate, days: number): SessionDate {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

function daysBetween(a: SessionDate, b: SessionDate): number {
  return Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
}

function accessionPath(cik: string, accession: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}`;
}

export function filingIndexUrl(cik: string, accession: string): string {
  return `${accessionPath(cik, accession)}/${accession}-index.htm`;
}

function isEarnings8K(filing: Filing): boolean {
  return filing.form === "8-K" && filing.items.includes("2.02");
}

function closestTo(candidates: Filing[], filed: SessionDate): Filing {
  return candidates.reduce((best, c) => {
    const d = daysBetween(c.filingDate, filed);
    const bestD = daysBetween(best.filingDate, filed);
    return d < bestD || (d === bestD && c.acceptedAt < best.acceptedAt) ? c : best;
  });
}

/**
 * Locates one earnings release per periodic report: among Item 2.02 8-Ks filed after the period
 * end and no later than 10 days after the report (or dated within that window), the one filed
 * closest to the report. A newer 2.02 8-K with no report yet is this quarter's release.
 */
export function findReleases(filings: Filing[], cik: string): EarningsRelease[] {
  const eightKs = filings.filter(isEarnings8K);
  const periodics = filings
    .filter((f) => (f.form === "10-Q" || f.form === "10-K") && f.reportDate)
    .sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt));
  const matched = new Map<string, { filing: Filing; periodEnd: SessionDate }>();
  for (const report of periodics) {
    const periodEnd = report.reportDate as SessionDate;
    const latest = addDays(report.filingDate, 10);
    const candidates = eightKs.filter(
      (k) =>
        !matched.has(k.accession) &&
        ((k.filingDate > periodEnd && k.filingDate <= latest) ||
          (k.reportDate !== null && k.reportDate > periodEnd && k.reportDate <= report.filingDate)),
    );
    if (!candidates.length) continue;
    const pick = closestTo(candidates, report.filingDate);
    matched.set(pick.accession, { filing: pick, periodEnd });
  }

  const releases = [...matched.values()].map(({ filing, periodEnd }) => toRelease(filing, periodEnd, cik));
  const newest = periodics.at(-1);
  if (newest?.reportDate) {
    const earliest = addDays(newest.reportDate, MIN_QUARTER_DAYS);
    const pending = eightKs
      .filter((k) => !matched.has(k.accession) && k.filingDate > newest.filingDate && k.filingDate >= earliest)
      // The newest filing day, and on that day the first 8-K: a second same-day 2.02 8-K is a follow-up.
      .sort((a, b) => b.filingDate.localeCompare(a.filingDate) || a.acceptedAt.localeCompare(b.acceptedAt));
    if (pending.length) releases.push(toRelease(pending[0], null, cik));
  }
  return releases.sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt)).slice(0, MAX_RELEASES);
}

function toRelease(filing: Filing, periodEnd: SessionDate | null, cik: string): EarningsRelease {
  return {
    accession: filing.accession,
    acceptedAt: filing.acceptedAt,
    reportDate: filing.reportDate,
    periodEnd,
    url: filingIndexUrl(cik, filing.accession),
  };
}

async function secJsonOrNull<T>(url: string): Promise<T | null> {
  const response = await secResponse(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new ResearchError(`SEC returned HTTP ${response.status}.`);
  return (await response.json()) as T;
}

async function secJsonRequired<T>(url: string): Promise<T> {
  const value = await secJsonOrNull<T>(url);
  if (value === null) throw new ResearchError(`SEC has no document at ${url}.`);
  return value;
}

async function secText(url: string): Promise<string> {
  const response = await secResponse(url, "text/html");
  if (!response.ok) throw new ResearchError(`SEC returned HTTP ${response.status} for ${url}.`);
  return response.text();
}

/**
 * Heavy filers' `recent` block can cover only a year; older filings live in `filings.files`
 * pages. Page back (newest first, at most 3 years) only until there are enough releases for a line.
 */
async function allFilings(submissions: Submissions, cik: string, now: number): Promise<Filing[]> {
  let filings = toFilings(submissions.filings.recent);
  const cutoff = new Date(now - HISTORY_YEARS * 365 * DAY).toISOString().slice(0, 10);
  const pages = [...submissions.filings.files]
    .filter((page) => page.filingTo >= cutoff)
    .sort((a, b) => b.filingTo.localeCompare(a.filingTo))
    .slice(0, MAX_HISTORY_PAGES);
  for (const page of pages) {
    if (findReleases(filings, cik).length >= ENOUGH_RELEASES) break;
    const columns = await secJsonRequired<FilingColumns>(`https://data.sec.gov/submissions/${page.name}`);
    const merged = [...filings, ...toFilings(columns)];
    filings = [...new Map(merged.map((f) => [f.accession, f])).values()];
  }
  return filings;
}

interface ConceptUnits {
  units?: Record<string, { end: string; val: number; filed: string }[]>;
}

async function sharesOutstanding(cik: string): Promise<number | null> {
  const concept = await secJsonOrNull<ConceptUnits>(
    `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/dei/EntityCommonStockSharesOutstanding.json`,
  );
  const facts = concept?.units?.shares ?? [];
  const newest = facts.reduce<(typeof facts)[number] | null>(
    (best, f) =>
      !best || f.end > best.end || (f.end === best.end && f.filed > best.filed) ? f : best,
    null,
  );
  return newest && newest.val > 0 ? newest.val : null;
}

async function lookupCik(ticker: string): Promise<string> {
  const directory = await universe();
  const listing = directory.value.find((row) => row.ticker === ticker);
  if (!listing) throw new ResearchError(`${ticker} is not in the SEC ticker directory.`, 404);
  return listing.cik;
}

/** Throws rather than serve a stale copy: a list missing today's 8-K would defeat the already-reported guard. */
async function companyFilings(ticker: string): Promise<{ value: CompanyFilings; fetchedAt: IsoInstant }> {
  const result = await cached(`earnings:${ticker}`, async (): Promise<CompanyFilings> => {
    const cik = await lookupCik(ticker);
    const submissions = await secJsonRequired<Submissions>(`https://data.sec.gov/submissions/CIK${cik}.json`);
    const filings = await allFilings(submissions, cik, Date.now());
    return {
      ticker,
      cik,
      name: submissions.name,
      filings,
      releases: findReleases(filings, cik),
      sharesOutstanding: await sharesOutstanding(cik),
    };
  });
  if (result.stale) throw new ResearchError("SEC filings could not be refreshed.");
  return { value: result.value, fetchedAt: result.fetchedAt };
}

function releasesResponse(company: CompanyFilings, fetchedAt: IsoInstant): ReleasesResponse {
  return {
    ticker: company.ticker,
    cik: company.cik,
    name: company.name,
    releases: company.releases,
    sharesOutstanding: company.sharesOutstanding,
    fetchedAt,
  };
}

export async function getReleases(ticker: string): Promise<ReleasesResponse> {
  const { value, fetchedAt } = await companyFilings(ticker);
  return releasesResponse(value, fetchedAt);
}

interface ChosenExhibit {
  accession: string;
  acceptedAt: IsoInstant;
  type: string;
  url: string;
  text: string;
  score: number;
  preliminary: boolean;
}

/** Scores the EX-99 exhibit of every 2.02 8-K filed on the release's filing date and keeps the best. */
async function chooseExhibit(company: CompanyFilings, release: EarningsRelease): Promise<ChosenExhibit | null> {
  const releaseFiling = company.filings.find((f) => f.accession === release.accession);
  if (!releaseFiling) return null;
  const sameDay = company.filings
    .filter((f) => isEarnings8K(f) && f.filingDate === releaseFiling.filingDate)
    .sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt));
  const load = async (): Promise<ChosenExhibit | null> => {
    let best: ChosenExhibit | null = null;
    for (const filing of sameDay) {
      const index = parseFilingIndex(await secText(filingIndexUrl(company.cik, filing.accession)));
      const exhibit = pressReleaseExhibit(index);
      if (!exhibit) continue;
      const html = await secText(exhibit.url);
      const text = htmlToText(html);
      const score = earningsReleaseScore(text);
      if (score > 0 && (!best || score > best.score))
        best = {
          accession: filing.accession,
          acceptedAt: filing.acceptedAt,
          type: exhibit.type,
          url: exhibit.url,
          text,
          score,
          preliminary: isPreliminaryRelease(html),
        };
    }
    return best;
  };
  return (await cached(`earnings-exhibit:${release.accession}`, load, DOCUMENT_TTL)).value;
}

function newestPeriodic(filings: Filing[]): Filing | null {
  return filings
    .filter((f) => f.form === "10-Q" || f.form === "10-K")
    .reduce<Filing | null>((best, f) => (!best || f.acceptedAt > best.acceptedAt ? f : best), null);
}

async function mdnaDoc(company: CompanyFilings, report: Filing): Promise<EvidenceDoc | null> {
  const url = `${accessionPath(company.cik, report.accession)}/${report.primaryDocument.replace(/^\/?ix\?doc=/, "")}`;
  const load = async () => mdnaText(htmlToText(await secText(url)), report.form);
  const text = (await cached(`earnings-mdna:${report.accession}`, load, DOCUMENT_TTL)).value;
  if (!text) return null;
  return {
    source: "mdna",
    form: report.form,
    accession: report.accession,
    filedAt: report.acceptedAt,
    periodEnd: report.reportDate,
    url,
    text,
  };
}

type Refusal = Extract<PacketResponse, { ok: false }>;

function refusal(ticker: string, reason: Refusal["reason"], detail: string): Refusal {
  return { ok: false, ticker, reason, detail };
}

/**
 * The release a packet may be built from: the newest one, which must be older than the
 * already-reported window, recent, and about the same quarter as the newest 10-Q/10-K.
 * Issuers that moved their results 8-Ks off Item 2.02 fail the last two tests.
 */
export function packetRelease(
  ticker: string,
  releases: EarningsRelease[],
  periodic: Filing | null,
  asOf: IsoInstant,
): EarningsRelease | Refusal {
  const newest = releases[0];
  if (!newest) return refusal(ticker, "not-8k-filer", "No 8-K Item 2.02 earnings releases on file.");
  const ageDays = (Date.parse(asOf) - Date.parse(newest.acceptedAt)) / DAY;
  const release = `Newest earnings release ${newest.accession}`;
  if (ageDays < REPORTED_WINDOW_DAYS)
    return refusal(ticker, "already-reported", `${release} was accepted ${newest.acceptedAt}.`);
  if (ageDays > STALE_RELEASE_DAYS || !periodic || newest.periodEnd !== periodic.reportDate) {
    const report = periodic ? `${periodic.accession} (period ${periodic.reportDate})` : "none";
    const detail = `${release} (period ${newest.periodEnd}, accepted ${newest.acceptedAt}) does not cover report ${report}.`;
    return refusal(ticker, "stale-release", detail);
  }
  return newest;
}

/**
 * Evidence packet for a company expected to report after `asOf`: its previous quarter's press release and MD&A.
 * SEC failures throw (the route answers 503 and the caller retries); refusals are definite.
 */
export async function getPacket(ticker: string, asOf: IsoInstant): Promise<PacketResponse> {
  let company: CompanyFilings;
  let fetchedAt: IsoInstant;
  try {
    ({ value: company, fetchedAt } = await companyFilings(ticker));
  } catch (error) {
    if (error instanceof ResearchError && error.status === 404) return refusal(ticker, "unknown-ticker", error.message);
    throw error;
  }

  let releases = company.releases;
  // A pre-announcement ahead of an investor conference is not the quarter's release.
  if (releases[0] && releases[0].periodEnd === null && (await chooseExhibit(company, releases[0]))?.preliminary)
    releases = releases.slice(1);
  const periodic = newestPeriodic(company.filings);
  const newest = packetRelease(ticker, releases, periodic, asOf);
  if ("ok" in newest) return newest;

  const exhibit = await chooseExhibit(company, newest);
  const pressRelease = exhibit && pressReleaseText(exhibit.text);
  if (!exhibit || !pressRelease || pressRelease.words < MIN_PRESS_RELEASE_WORDS)
    return refusal(ticker, "no-press-release", `No EX-99 exhibit reads as an earnings release in ${newest.accession}.`);

  const docs: EvidenceDoc[] = [
    {
      source: "press_release",
      form: `8-K ${exhibit.type}`,
      accession: exhibit.accession,
      filedAt: exhibit.acceptedAt,
      periodEnd: newest.periodEnd,
      url: exhibit.url,
      text: pressRelease.text,
    },
  ];
  const mdna = periodic && (await mdnaDoc(company, periodic));
  if (mdna && wordCount(mdna.text) > 0) docs.push(mdna);
  return { ...releasesResponse(company, fetchedAt), releases, ok: true, asOf, docs };
}
