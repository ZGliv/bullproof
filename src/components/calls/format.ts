import type { EarningsCall, LegResult, SessionDate, VoidReason } from "@/lib/earnings/types";

const MINUS = "−";
const ET = "America/New_York";

const etTime = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const etDate = new Intl.DateTimeFormat("en-US", { timeZone: ET, month: "short", day: "numeric", year: "numeric" });
const etShortDate = new Intl.DateTimeFormat("en-US", { timeZone: ET, month: "short", day: "numeric" });
const sessionLong = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});
const sessionShort = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const sessionMonthOnly = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" });

/** Session dates are calendar dates; anchor at UTC noon so no time zone can shift the day. */
const sessionInstant = (date: SessionDate) => new Date(`${date}T12:00:00Z`);

export const etClock = (iso: string) => `${etTime.format(new Date(iso))} ET`;
export const etDay = (iso: string) => etShortDate.format(new Date(iso));
export const filedDate = (iso: string) => etDate.format(new Date(iso));
export const sessionLabel = (date: SessionDate) => sessionLong.format(sessionInstant(date));
export const sessionTick = (date: SessionDate) => sessionShort.format(sessionInstant(date));
export const sessionMonth = (date: SessionDate) => sessionMonthOnly.format(sessionInstant(date));

export function signed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return text;
  return `${value > 0 ? "+" : MINUS}${text}`;
}

export const movePct = (value: number) => `${signed(value, 2)}%`;
export const lineLabel = (value: number | null) => (value === null ? "—" : `±${value.toFixed(1)}%`);
export const price = (value: number) => value.toFixed(2);

export function marketCap(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(value >= 1e11 ? 0 : 1)}B`;
  return `$${Math.round(value / 1e6)}M`;
}

export const recordLine = (win: number, loss: number, push: number) => `${win}–${loss}–${push}`;

export const timingLabel = (timing: EarningsCall["timing"]) => timing.toUpperCase();

export const RESULT_LETTER: Record<LegResult | "void", string> = { win: "W", loss: "L", push: "P", void: "V" };

export const VOID_LABEL: Record<VoidReason, string> = {
  "pre-release": "Released before lock",
  "no-release": "No release found",
  "intraday-release": "Released intraday",
  "session-mismatch": "Different session",
  "missing-bar": "Missing price bar",
};

export interface ReportGroup {
  reportDate: SessionDate;
  calls: EarningsCall[];
}

const TIMING_ORDER: Record<EarningsCall["timing"], number> = { bmo: 0, amc: 1 };

/**
 * Groups calls by the day the company reports, not the session that grades them: an after-close
 * report on Nov 12 is graded on Nov 13 but belongs to Nov 12. Days run in `order`; inside a day
 * pre-market reports come before after-close ones, and the incoming order breaks ties.
 */
export function groupByReport(calls: EarningsCall[], order: "asc" | "desc"): ReportGroup[] {
  const sign = order === "asc" ? 1 : -1;
  const sorted = calls
    .map((call, index) => ({ call, index }))
    .sort(
      (a, b) =>
        sign * a.call.reportDate.localeCompare(b.call.reportDate) ||
        TIMING_ORDER[a.call.timing] - TIMING_ORDER[b.call.timing] ||
        a.index - b.index,
    );
  const groups: ReportGroup[] = [];
  for (const { call } of sorted) {
    const last = groups.at(-1);
    if (last && last.reportDate === call.reportDate) last.calls.push(call);
    else groups.push({ reportDate: call.reportDate, calls: [call] });
  }
  return groups;
}

/** Latest lock time among the calls, or null for none. */
export function latestLock(calls: EarningsCall[]): string | null {
  let latest: string | null = null;
  for (const call of calls) {
    if (latest === null || Date.parse(call.publishedAt) > Date.parse(latest)) latest = call.publishedAt;
  }
  return latest;
}

/** "Nov 11 20:12 ET", or a range when the instants fall on different minutes. */
export function lockLabel(instants: string[]): string | null {
  const times = instants.map((instant) => Date.parse(instant)).sort((a, b) => a - b);
  if (times.length === 0) return null;
  const first = new Date(times[0]);
  const last = new Date(times[times.length - 1]);
  const start = `${etShortDate.format(first)} ${etTime.format(first)}`;
  const sameDay = etShortDate.format(first) === etShortDate.format(last);
  const end = sameDay ? etTime.format(last) : `${etShortDate.format(last)} ${etTime.format(last)}`;
  return start === `${etShortDate.format(last)} ${etTime.format(last)}` ? `${start} ET` : `${start}–${end} ET`;
}

const ARROW: Record<EarningsCall["direction"], string> = { up: "▲", down: "▼" };

/** Short text form of a call for titles and link previews, e.g. "CSCO ▲ UP · UNDER ±4.7%". */
export function callTitle(call: EarningsCall): string {
  const parts = [`${call.ticker} ${ARROW[call.direction]} ${call.direction.toUpperCase()}`];
  if (call.overUnder && call.line.value !== null) {
    parts.push(`${call.overUnder.toUpperCase()} ${lineLabel(call.line.value)}`);
  }
  if (call.status === "void") parts.push("Void");
  if (call.status === "graded" && call.grade) {
    const legs = [call.grade.direction, call.grade.overUnder].filter((leg) => leg !== null);
    parts.push(`${movePct(call.grade.movePct)} ${legs.map((leg) => RESULT_LETTER[leg]).join("/")}`);
  }
  return parts.join(" · ");
}

/** Call ids are `YYYY-MM-DD:TICKER`; ':' is legal in a path segment, so the id goes in as is. */
export const callHref = (id: string) => `/call/${id}`;
