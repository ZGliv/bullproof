import type { DailyBar, EarningsRelease, Line, Reaction, SessionDate, Timing, TradingDay } from "./types";
import { etParts, isSession, nextSession, previousSession, releaseSession } from "./time";
import { roundTo } from "./grading";

const LINE_WINDOW = 8;
const LINE_MIN_REACTIONS = 4;
const VOLUME_BASELINE_SESSIONS = 20;
/** To displace the default session, a candidate must trade this multiple of its 20-session median volume… */
const REPORT_DATE_MIN_RATIO = 2.0;
/** …and this multiple of the default session's own ratio. */
const REPORT_DATE_DOMINANCE = 1.5;

export function median(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface BarIndex {
  bars: DailyBar[];
  byDate: Map<SessionDate, number>;
}

function indexBars(bars: DailyBar[]): BarIndex {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  return { bars: sorted, byDate: new Map(sorted.map((bar, i) => [bar.date, i])) };
}

/** Session volume ÷ median volume of the 20 bars before it; null without a full baseline. */
function volumeRatio(index: BarIndex, session: SessionDate): number | null {
  const i = index.byDate.get(session);
  if (i === undefined || i < VOLUME_BASELINE_SESSIONS) return null;
  const baseline = median(index.bars.slice(i - VOLUME_BASELINE_SESSIONS, i).map((bar) => bar.volume));
  return baseline > 0 ? index.bars[i].volume / baseline : null;
}

/** Close-to-close move into `session` in percent (2 dp), or null when either bar is missing. */
function sessionMove(index: BarIndex, calendar: TradingDay[], session: SessionDate): number | null {
  const prior = previousSession(calendar, session);
  const i = index.byDate.get(session);
  const j = prior === null ? undefined : index.byDate.get(prior);
  if (i === undefined || j === undefined) return null;
  return roundTo(100 * (index.bars[i].close / index.bars[j].close - 1), 2);
}

interface Candidate {
  session: SessionDate;
  timing: Timing | "during";
  mapping: Reaction["mapping"];
  ratio: number | null;
}

/** Sessions suggested by the 8-K's date of report when it precedes the acceptance date. */
function reportDateCandidates(
  calendar: TradingDay[],
  index: BarIndex,
  reportDate: SessionDate,
): { candidates: Candidate[]; reportDateIsSession: boolean } {
  const reportDateIsSession = isSession(calendar, reportDate);
  const slots: { session: SessionDate | null; timing: Timing }[] = reportDateIsSession
    ? [
        { session: reportDate, timing: "bmo" },
        { session: nextSession(calendar, reportDate), timing: "amc" },
      ]
    : [{ session: nextSession(calendar, reportDate), timing: "bmo" }];
  const candidates = slots
    .filter((slot): slot is { session: SessionDate; timing: Timing } => slot.session !== null)
    .map((slot) => ({ ...slot, mapping: "report-date" as const, ratio: volumeRatio(index, slot.session) }));
  return { candidates, reportDateIsSession };
}

function strongest(candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (candidate.ratio === null) continue;
    if (!best || candidate.ratio > (best.ratio ?? 0)) best = candidate;
  }
  return best;
}

/**
 * Picks the reaction session for one release.
 *
 * Default: the session implied by the 8-K acceptance time. Some issuers publish the press
 * release days before the 8-K (HELE, KRUS); their 8-K "date of report" is earlier than the
 * acceptance date, and trading volume shows which session actually reacted.
 * - Report date on a trading day: switch only on a clear volume spike (≥ 2.0× baseline and
 *   ≥ 1.5× the acceptance session's ratio), so a stray earlier event date (GOOGL 2023-07) stays put.
 * - Report date on a weekend or holiday: Berkshire releases on Saturdays and files the 8-K days
 *   later at random hours, with volume ratios too small to clear a spike test (1.1–1.6). So the
 *   next session after the report date is the default here, and the acceptance session wins back
 *   only when the 8-K went in before an open (how companies time a release — CROX 2019-05,
 *   Sunday event date, 07:07 Tuesday filing) or shows a clear volume spike of its own.
 */
function chooseSession(
  calendar: TradingDay[],
  index: BarIndex,
  release: EarningsRelease,
): Candidate | null {
  const accepted = releaseSession(calendar, release.acceptedAt);
  const acceptedCandidate: Candidate | null = accepted
    ? { ...accepted, mapping: "accepted", ratio: volumeRatio(index, accepted.session) }
    : null;
  const acceptedDate = etParts(release.acceptedAt).date;
  if (!release.reportDate || release.reportDate >= acceptedDate) return acceptedCandidate;

  const { candidates, reportDateIsSession } = reportDateCandidates(calendar, index, release.reportDate);
  const reportCandidate = strongest(candidates.filter((c) => c.session !== acceptedCandidate?.session));
  if (!reportCandidate) return acceptedCandidate;
  if (reportDateIsSession) {
    return clearSpike(reportCandidate, acceptedCandidate) ? reportCandidate : acceptedCandidate;
  }
  if (!acceptedCandidate) return reportCandidate;
  if (acceptedCandidate.timing === "bmo" || clearSpike(acceptedCandidate, reportCandidate)) return acceptedCandidate;
  return reportCandidate;
}

/** True when `challenger` trades ≥ 2.0× its baseline and ≥ 1.5× the incumbent's ratio. */
function clearSpike(challenger: Candidate, incumbent: Candidate | null): boolean {
  if (challenger.ratio === null || challenger.ratio < REPORT_DATE_MIN_RATIO) return false;
  return incumbent?.ratio == null || challenger.ratio >= REPORT_DATE_DOMINANCE * incumbent.ratio;
}

/** Past earnings reactions, oldest first, one per session. */
export function historicalReactions(
  releases: EarningsRelease[],
  bars: DailyBar[],
  calendar: TradingDay[],
): Reaction[] {
  const index = indexBars(bars);
  const ordered = [...releases].sort((a, b) => Date.parse(a.acceptedAt) - Date.parse(b.acceptedAt));
  const reactions: Reaction[] = [];
  const seen = new Set<SessionDate>();
  for (const release of ordered) {
    const chosen = chooseSession(calendar, index, release);
    if (!chosen || seen.has(chosen.session)) continue;
    const movePct = sessionMove(index, calendar, chosen.session);
    if (movePct === null) continue;
    seen.add(chosen.session);
    reactions.push({
      session: chosen.session,
      movePct,
      timing: chosen.timing,
      mapping: chosen.mapping,
      accession: release.accession,
    });
  }
  return reactions.sort((a, b) => a.session.localeCompare(b.session));
}

/** The typical earnings-day move: median |move| of the last 8 reactions, to 0.1. */
export function computeLine(reactions: Reaction[]): Line {
  const recent = reactions.slice(-LINE_WINDOW);
  const value =
    recent.length < LINE_MIN_REACTIONS ? null : roundTo(median(recent.map((r) => Math.abs(r.movePct))), 1);
  return { value, reactions: recent };
}
