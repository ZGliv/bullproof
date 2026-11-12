import type {
  DailyBar,
  EarningsCall,
  Grade,
  IsoInstant,
  LegResult,
  SessionDate,
  TradingDay,
  VoidReason,
} from "./types";
import { calendarCovers, etParts, nextSession, previousSession, releaseSession, sessionCloseMs } from "./time";

/** Grading waits this long after the close so the consolidated closing print has settled. */
const SETTLE_MS = 20 * 60_000;
/** A missing bar is retried until this many sessions after the call session have closed. */
const MISSING_BAR_SESSIONS = 3;

export const ROUND2 = 2;

/** Rounds half away from zero at `dp` decimals without binary-float drift (1.005 → 1.01). */
export function roundTo(x: number, dp: number): number {
  if (!Number.isFinite(x)) return x;
  const magnitude = String(Math.abs(x));
  // Shift in decimal text so 1.005 becomes exactly 100.5; tiny values already print in e-notation.
  const shifted = magnitude.includes("e") ? Math.abs(x) * 10 ** dp : Number(`${magnitude}e${dp}`);
  const rounded = Math.round(shifted) / 10 ** dp;
  if (rounded === 0) return 0;
  return x < 0 ? -rounded : rounded;
}

export type GradeOutcome =
  | { status: "graded"; grade: Grade }
  | { status: "void"; reason: VoidReason }
  | { status: "pending" };

export interface GradeInput {
  call: Pick<EarningsCall, "session" | "reportDate" | "publishedAt" | "direction" | "overUnder" | "line">;
  calendar: TradingDay[];
  bars: DailyBar[];
  /** Earliest time-stamped results evidence: an 8-K acceptance or a results headline. */
  releaseAt: IsoInstant | null;
  /**
   * The release day when it is known only by date: the "date of report" of an 8-K accepted on a
   * later day (issuers such as HELE and KRUS publish the press release days before the 8-K).
   */
  releaseDate: SessionDate | null;
  releaseSource: "8-K" | "news" | null;
  now: IsoInstant;
}

const PENDING = { status: "pending" } as const;
const voided = (reason: VoidReason): GradeOutcome => ({ status: "void", reason });

/** The `n`-th trading day after `date` (n ≥ 1), or null past the end of the calendar. */
function sessionsAfter(calendar: TradingDay[], date: string, n: number): string | null {
  let current: string | null = date;
  for (let i = 0; i < n && current !== null; i++) current = nextSession(calendar, current);
  return current;
}

/** True once `session` has closed and settled by `nowMs`. Unknown sessions never count as closed. */
function settled(calendar: TradingDay[], session: string | null, nowMs: number): boolean {
  if (session === null) return false;
  const close = sessionCloseMs(calendar, session);
  return close !== null && nowMs >= close + SETTLE_MS;
}

/** True once the call session has closed and its closing print has settled. */
export function sessionSettled(calendar: TradingDay[], session: SessionDate, now: IsoInstant): boolean {
  return settled(calendar, session, Date.parse(now));
}

/** True once a call with no results evidence would be voided as no-release: the next session has settled. */
export function releaseDeadlinePassed(calendar: TradingDay[], session: SessionDate, now: IsoInstant): boolean {
  return settled(calendar, nextSession(calendar, session), Date.parse(now));
}

/** Same scale for both sides: hundredths of a percent as integers, so 3.1 vs 3.10 compare exactly. */
const hundredths = (pct: number) => Math.round(Math.abs(pct) * 100);

function directionResult(direction: EarningsCall["direction"], movePct: number): LegResult {
  if (movePct === 0) return "push";
  return (movePct > 0) === (direction === "up") ? "win" : "loss";
}

function overUnderResult(
  pick: NonNullable<EarningsCall["overUnder"]>,
  movePct: number,
  line: number,
): LegResult {
  const move = hundredths(movePct);
  const threshold = hundredths(line);
  if (move === threshold) return "push";
  return (move > threshold) === (pick === "over") ? "win" : "loss";
}

/**
 * Decides one call. Rules apply in order:
 * 1. results public before the lock → void pre-release (a release known only by date counts when
 *    that date is on or before the lock's New York date);
 * 2. call session not yet closed (+20 min) → pending;
 * 3. no results evidence: pending through the next session's close, then void no-release;
 * 4. results during regular hours → void intraday-release; in another session → void session-mismatch.
 *    A release known only by date is in the session when it falls on the calendar's report date;
 *    the time-of-day slot is then the calendar's;
 * 5. bars missing: pending until 3 later sessions have closed, then void missing-bar;
 * 6. grade both legs on the close-to-close move.
 */
export function gradeCall(input: GradeInput): GradeOutcome {
  const { call, calendar, bars, releaseAt, releaseDate, releaseSource } = input;
  const nowMs = Date.parse(input.now);

  if (releaseAt !== null && Date.parse(releaseAt) < Date.parse(call.publishedAt)) return voided("pre-release");
  // Without a time of day the lock's own date counts as "before": the void errs on the safe side.
  if (releaseDate !== null && releaseDate <= etParts(call.publishedAt).date) return voided("pre-release");

  if (sessionCloseMs(calendar, call.session) === null) {
    // A call session the calendar positively knows is closed can never be graded.
    return calendarCovers(calendar, call.session) ? voided("session-mismatch") : PENDING;
  }
  if (!settled(calendar, call.session, nowMs)) return PENDING;

  // A time stamp wins unless a late 8-K's date of report shows the release came on an earlier day.
  if (releaseAt !== null && (releaseDate === null || etParts(releaseAt).date <= releaseDate)) {
    const release = releaseSession(calendar, releaseAt);
    if (!release) return PENDING;
    if (release.timing === "during") return voided("intraday-release");
    if (release.session !== call.session) return voided("session-mismatch");
  } else if (releaseDate !== null) {
    if (releaseDate !== call.reportDate) return voided("session-mismatch");
  } else {
    return settled(calendar, nextSession(calendar, call.session), nowMs) ? voided("no-release") : PENDING;
  }

  const baseDate = previousSession(calendar, call.session);
  const result = bars.find((bar) => bar.date === call.session);
  const base = baseDate === null ? undefined : bars.find((bar) => bar.date === baseDate);
  if (!result || !base || baseDate === null) {
    const deadline = sessionsAfter(calendar, call.session, MISSING_BAR_SESSIONS);
    return settled(calendar, deadline, nowMs) ? voided("missing-bar") : PENDING;
  }

  const movePct = roundTo(100 * (result.close / base.close - 1), ROUND2);
  const line = call.line.value;
  const grade: Grade = {
    gradedAt: input.now,
    releaseAt,
    releaseSource,
    baseDate,
    baseClose: base.close,
    resultDate: call.session,
    resultClose: result.close,
    movePct,
    direction: directionResult(call.direction, movePct),
    overUnder: call.overUnder !== null && line !== null ? overUnderResult(call.overUnder, movePct, line) : null,
  };
  return { status: "graded", grade };
}
