import type { EarningsCall, LegRecord, LegResult, RecordMark, SeasonRecord, SessionDate } from "./types";
import { roundTo } from "./grading";

const MIN_N_FOR_PCT = 30;
const MAX_N_FOR_INTERVAL = 100;
const LAST_MARKS = 20;
const Z_95 = 1.959964;

/** Calendar quarter of a session, e.g. "2026 Q4". */
export function seasonOf(session: SessionDate): string {
  const [year, month] = session.split("-").map(Number);
  return `${year} Q${Math.ceil(month / 3)}`;
}

/** 95% Wilson score interval for `wins` out of `n`, in percent to one decimal. */
export function wilson(wins: number, n: number): [number, number] {
  if (n <= 0) return [0, 100];
  const p = wins / n;
  const z2 = Z_95 * Z_95;
  const centre = p + z2 / (2 * n);
  const spread = Z_95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const denominator = 1 + z2 / n;
  return [roundTo((100 * (centre - spread)) / denominator, 1), roundTo((100 * (centre + spread)) / denominator, 1)];
}

interface Tally {
  win: number;
  loss: number;
  push: number;
}

const emptyTally = (): Tally => ({ win: 0, loss: 0, push: 0 });

function count(tally: Tally, result: LegResult): void {
  tally[result]++;
}

/** What a fixed pick would have scored: + is a win, − a loss, 0 a push. */
function fixedPickResult(signedEdge: number): LegResult {
  if (signedEdge === 0) return "push";
  return signedEdge > 0 ? "win" : "loss";
}

function legRecord(tally: Tally, baseLabel: string, base: Tally): LegRecord {
  const n = tally.win + tally.loss;
  return {
    ...tally,
    n,
    pct: n >= MIN_N_FOR_PCT ? roundTo((100 * tally.win) / n, 1) : null,
    interval: n >= MIN_N_FOR_PCT && n < MAX_N_FOR_INTERVAL ? wilson(tally.win, n) : null,
    base: { label: baseLabel, ...base },
  };
}

function mark(call: EarningsCall): RecordMark {
  const grade = call.grade;
  if (call.status === "void" || grade === null) {
    return {
      id: call.id,
      ticker: call.ticker,
      session: call.session,
      direction: "void",
      overUnder: call.overUnder === null ? null : "void",
    };
  }
  return {
    id: call.id,
    ticker: call.ticker,
    session: call.session,
    direction: grade.direction,
    overUnder: grade.overUnder,
  };
}

const newestFirst = (a: EarningsCall, b: EarningsCall) =>
  b.session.localeCompare(a.session) ||
  b.publishedAt.localeCompare(a.publishedAt) ||
  a.ticker.localeCompare(b.ticker);

/**
 * Season record over the graded and void calls whose session falls in `season`.
 * Bases score naive picks on the same graded calls: always down, and always over the line.
 */
export function buildRecord(calls: EarningsCall[], season: string): SeasonRecord {
  const settledCalls = calls
    .filter((call) => seasonOf(call.session) === season)
    .filter((call) => call.status === "void" || (call.status === "graded" && call.grade !== null))
    .sort(newestFirst);

  const direction = emptyTally();
  const alwaysDown = emptyTally();
  const overUnder = emptyTally();
  const alwaysOver = emptyTally();
  let voids = 0;

  for (const call of settledCalls) {
    const grade = call.grade;
    if (call.status === "void" || grade === null) {
      voids++;
      continue;
    }
    count(direction, grade.direction);
    count(alwaysDown, fixedPickResult(-grade.movePct));
    if (grade.overUnder !== null && call.line.value !== null) {
      count(overUnder, grade.overUnder);
      const edge = Math.round(Math.abs(grade.movePct) * 100) - Math.round(call.line.value * 100);
      count(alwaysOver, fixedPickResult(edge));
    }
  }

  return {
    season,
    direction: legRecord(direction, "Always down", alwaysDown),
    overUnder: legRecord(overUnder, "Always over", alwaysOver),
    voids,
    last: settledCalls.slice(0, LAST_MARKS).map(mark),
  };
}
