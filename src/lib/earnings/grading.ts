import type {
  DailyBar,
  EarningsCall,
  Grade,
  IsoInstant,
  LegResult,
  TradingDay,
  VoidReason,
} from "./types";
import { calendarCovers, nextSession, previousSession, releaseSession, sessionCloseMs } from "./time";

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
  call: Pick<EarningsCall, "session" | "publishedAt" | "direction" | "overUnder" | "line">;
  calendar: TradingDay[];
  bars: DailyBar[];
  releaseAt: IsoInstant | null;
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
 * 1. results public before the lock → void pre-release;
 * 2. call session not yet closed (+20 min) → pending;
 * 3. no results evidence: pending through the next session's close, then void no-release;
 * 4. results during regular hours → void intraday-release; in another session → void session-mismatch;
 * 5. bars missing: pending until 3 later sessions have closed, then void missing-bar;
 * 6. grade both legs on the close-to-close move.
 */
export function gradeCall(input: GradeInput): GradeOutcome {
  const { call, calendar, bars, releaseAt, releaseSource } = input;
  const nowMs = Date.parse(input.now);

  if (releaseAt !== null && Date.parse(releaseAt) < Date.parse(call.publishedAt)) return voided("pre-release");

  if (sessionCloseMs(calendar, call.session) === null) {
    // A call session the calendar positively knows is closed can never be graded.
    return calendarCovers(calendar, call.session) ? voided("session-mismatch") : PENDING;
  }
  if (!settled(calendar, call.session, nowMs)) return PENDING;

  if (releaseAt === null) {
    return settled(calendar, nextSession(calendar, call.session), nowMs) ? voided("no-release") : PENDING;
  }

  const release = releaseSession(calendar, releaseAt);
  if (!release) return PENDING;
  if (release.timing === "during") return voided("intraday-release");
  if (release.session !== call.session) return voided("session-mismatch");

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
