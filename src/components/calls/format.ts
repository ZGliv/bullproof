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

export function groupBySession(calls: EarningsCall[]): { session: SessionDate; calls: EarningsCall[] }[] {
  const groups: { session: SessionDate; calls: EarningsCall[] }[] = [];
  for (const call of calls) {
    const last = groups.at(-1);
    if (last && last.session === call.session) last.calls.push(call);
    else groups.push({ session: call.session, calls: [call] });
  }
  return groups;
}

export const callHref = (id: string) => `/call/${encodeURIComponent(id)}`;
