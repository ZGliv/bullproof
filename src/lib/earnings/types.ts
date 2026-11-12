/**
 * Shared contract for the earnings-calls product.
 * Imported by the Next app (src/) and by the Cloudflare Worker (cloud/).
 * Keep this file free of runtime imports so both bundles can use it.
 */

/** Trading-day date in America/New_York, formatted YYYY-MM-DD. */
export type SessionDate = string;
/** ISO-8601 instant in UTC, e.g. 2026-11-12T01:30:04.000Z. */
export type IsoInstant = string;

export type Timing = "bmo" | "amc";
export type Direction = "up" | "down";
export type OverUnder = "over" | "under";
export type LegResult = "win" | "loss" | "push";
export type CallStatus = "locked" | "graded" | "void";
export type VoidReason =
  | "pre-release" // results were public before the call was locked
  | "no-release" // no results evidence within one session of the expected slot
  | "intraday-release" // results came out during regular trading hours
  | "session-mismatch" // results landed in a different session than the call was locked for
  | "missing-bar"; // no daily bar for the session or the prior session after retries

/** One trading day from the exchange calendar. Times are HH:MM in New York. */
export interface TradingDay {
  date: SessionDate;
  open: string;
  close: string;
}

/** A daily price bar. `date` is the New York session date. */
export interface DailyBar {
  date: SessionDate;
  close: number;
  volume: number;
}

/** A row from the upcoming-earnings calendar, already normalised. */
export interface Reporter {
  ticker: string;
  name: string;
  reportDate: SessionDate;
  timing: Timing;
  epsEstimate: number | null;
}

/** A past earnings release located in SEC filings. */
export interface EarningsRelease {
  accession: string;
  acceptedAt: IsoInstant;
  /** The 8-K's "date of report" (event date); can precede acceptance by days. */
  reportDate: SessionDate | null;
  /** Period end of the 10-Q/10-K this release was matched to. */
  periodEnd: SessionDate | null;
  url: string;
}

/** A past earnings reaction: the close-to-close move on the reaction session. */
export interface Reaction {
  session: SessionDate;
  /** Signed percent move, close(session) / close(previous session) - 1, times 100. */
  movePct: number;
  timing: Timing | "during";
  /** How the session was chosen: from the filing acceptance time, or the report date confirmed by volume. */
  mapping: "accepted" | "report-date";
  accession: string;
}

/** The typical-move line a call is graded against. */
export interface Line {
  /** Median absolute move in percent, rounded to 0.1. Null when there are fewer than 4 reactions. */
  value: number | null;
  /** Reactions used, oldest first (at most 8). */
  reactions: Reaction[];
}

export type EvidenceSource = "press_release" | "mdna";

/** One document excerpt handed to the model. */
export interface EvidenceDoc {
  source: EvidenceSource;
  form: string; // "8-K EX-99.1", "10-Q", "10-K"
  accession: string;
  filedAt: IsoInstant;
  periodEnd: SessionDate | null;
  url: string;
  text: string;
}

/** Response of GET /api/earnings/releases?ticker= (Next, SEC-backed). */
export interface ReleasesResponse {
  ticker: string;
  cik: string;
  name: string;
  /** Newest first. Empty for issuers that do not file 8-K Item 2.02 (e.g. foreign private issuers). */
  releases: EarningsRelease[];
  sharesOutstanding: number | null;
  fetchedAt: IsoInstant;
}

/** Response of GET /api/earnings/packet?ticker=&asOf= (Next, SEC-backed). */
export type PacketResponse =
  | (ReleasesResponse & { ok: true; asOf: IsoInstant; docs: EvidenceDoc[] })
  | { ok: false; ticker: string; reason: PacketRefusal; detail: string };

export type PacketRefusal =
  | "unknown-ticker"
  | "not-8k-filer"
  | "already-reported" // newest earnings release was accepted after asOf or within the last 45 days
  | "no-press-release" // no EX-99 exhibit that reads as an earnings release
  | "stale-release"; // newest release is old or not about the newest 10-Q/10-K (results moved off Item 2.02)

/** A quoted piece of evidence behind one side of a call. `quote` appears verbatim in the source text. */
export interface EvidencePoint {
  point: string;
  quote: string;
  source: EvidenceSource;
  form: string;
  filedAt: IsoInstant;
  url: string;
}

/** What the model must return for one company. */
export interface ModelCall {
  ticker: string;
  direction: Direction;
  move: OverUnder;
  confidence: 1 | 2 | 3 | 4 | 5;
  bull: { point: string; source: EvidenceSource; quote: string };
  bear: { point: string; source: EvidenceSource; quote: string };
  thesis: string;
  wrong_if: string;
}

export interface Grade {
  gradedAt: IsoInstant;
  /** Earliest results evidence found (8-K Item 2.02 acceptance or first results headline). */
  releaseAt: IsoInstant | null;
  releaseSource: "8-K" | "news" | null;
  baseDate: SessionDate;
  baseClose: number;
  resultDate: SessionDate;
  resultClose: number;
  /** Signed percent move, rounded to 0.01. */
  movePct: number;
  direction: LegResult;
  /** Null when the call had no over/under leg. */
  overUnder: LegResult | null;
}

export interface EarningsCall {
  /** `${session}:${ticker}` */
  id: string;
  ticker: string;
  name: string;
  /** The session whose close grades this call. */
  session: SessionDate;
  reportDate: SessionDate;
  timing: Timing;
  /** When the call was locked. Always earlier than the results release, or the call is void. */
  publishedAt: IsoInstant;
  /** SHA-256 (hex) of the canonical call JSON at lock time. */
  hash: string;
  marketCap: number | null;
  refClose: number;
  refCloseDate: SessionDate;
  line: Line;
  direction: Direction;
  /** Null when there was no line (fewer than 4 past reactions). */
  overUnder: OverUnder | null;
  confidence: 1 | 2 | 3 | 4 | 5;
  thesis: string;
  wrongIf: string;
  bull: EvidencePoint;
  bear: EvidencePoint;
  model: string;
  promptVersion: string;
  status: CallStatus;
  grade: Grade | null;
  voidReason: VoidReason | null;
}

export interface LegRecord {
  win: number;
  loss: number;
  push: number;
  /** Graded calls in this leg excluding pushes and voids. */
  n: number;
  /** Win percentage 0-100, one decimal. Null below n = 30. */
  pct: number | null;
  /** 95% Wilson interval in percent. Present for 30 <= n < 100. */
  interval: [number, number] | null;
  /** Naive comparator on the same calls: always-down for direction, always-over for over/under. */
  base: { label: string; win: number; loss: number; push: number };
}

export interface RecordMark {
  id: string;
  ticker: string;
  session: SessionDate;
  direction: LegResult | "void";
  overUnder: LegResult | "void" | null;
}

export interface SeasonRecord {
  /** e.g. "2026 Q4" — the calendar quarter of the graded sessions. */
  season: string;
  direction: LegRecord;
  overUnder: LegRecord;
  voids: number;
  /** Most recent first, at most 20. */
  last: RecordMark[];
}

/** Response of the Worker's GET /earnings/board. */
export interface BoardResponse {
  generatedAt: IsoInstant;
  /** Locked calls awaiting a grade, soonest session first, then by rank. */
  slate: EarningsCall[];
  /** Graded and void calls, newest session first. At most 60. */
  recent: EarningsCall[];
  record: SeasonRecord;
  run: {
    lastPublishAt: IsoInstant | null;
    lastGradeAt: IsoInstant | null;
  };
}

/**
 * Response of the Worker's GET /earnings/ledger[?season=2026 Q4]: one season's calls (default the
 * current season) plus every call still open, newest first.
 */
export interface LedgerResponse {
  generatedAt: IsoInstant;
  calls: EarningsCall[];
  record: SeasonRecord;
}
