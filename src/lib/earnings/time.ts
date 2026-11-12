import type { IsoInstant, SessionDate, Timing, TradingDay } from "./types";

/**
 * New York trading-calendar helpers. Pure and runtime-neutral (no Node APIs),
 * so the Cloudflare Worker can bundle them.
 *
 * Calendars are arrays of TradingDay sorted by date ascending, exactly as
 * Alpaca's /v2/calendar returns them. Every lookup assumes that order.
 */

const NEW_YORK = "America/New_York";
const MINUTE_MS = 60_000;

const etFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NEW_YORK,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface EtParts {
  date: SessionDate;
  /** Minutes since New York midnight. */
  minutes: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

/** New York wall-clock date and time for an instant, DST-correct. */
export function etParts(instant: IsoInstant | Date): EtParts {
  const ms = typeof instant === "string" ? Date.parse(instant) : instant.getTime();
  if (!Number.isFinite(ms)) throw new RangeError(`Invalid instant: ${String(instant)}`);
  const parts: Record<string, string> = {};
  for (const part of etFormatter.formatToParts(new Date(ms))) parts[part.type] = part.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday],
  };
}

/** UTC epoch milliseconds of a New York wall-clock time (date + minutes after midnight). */
export function etToEpochMs(date: SessionDate, minutes: number): number {
  const [year, month, day] = date.split("-").map(Number);
  const wanted = Date.UTC(year, month - 1, day) / MINUTE_MS + minutes;
  // New York is UTC-5 or UTC-4. Start at -5 and correct by the observed offset;
  // a second pass settles the rare guess that lands across a DST switch.
  let guess = (wanted + 5 * 60) * MINUTE_MS;
  for (let pass = 0; pass < 2; pass++) {
    const seen = etParts(new Date(guess));
    const [y, m, d] = seen.date.split("-").map(Number);
    const seenMinutes = Date.UTC(y, m - 1, d) / MINUTE_MS + seen.minutes;
    guess += (wanted - seenMinutes) * MINUTE_MS;
  }
  return guess;
}

/** "HH:MM" to minutes after midnight. */
export function clockMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Index of the first calendar day whose date is >= `date` (calendar.length when none). */
function lowerBound(calendar: TradingDay[], date: SessionDate): number {
  let lo = 0;
  let hi = calendar.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (calendar[mid].date < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function tradingDay(calendar: TradingDay[], date: SessionDate): TradingDay | null {
  const day = calendar[lowerBound(calendar, date)];
  return day && day.date === date ? day : null;
}

/** First trading day strictly after `after`, or null when the calendar ends first. */
export function nextSession(calendar: TradingDay[], after: SessionDate): SessionDate | null {
  let index = lowerBound(calendar, after);
  if (calendar[index]?.date === after) index++;
  return calendar[index]?.date ?? null;
}

/** Last trading day strictly before `before`, or null when the calendar starts later. */
export function previousSession(calendar: TradingDay[], before: SessionDate): SessionDate | null {
  return calendar[lowerBound(calendar, before) - 1]?.date ?? null;
}

export function isSession(calendar: TradingDay[], date: SessionDate): boolean {
  return tradingDay(calendar, date) !== null;
}

/** Close of a session in minutes after New York midnight (780 on half days), or null. */
export function sessionClose(calendar: TradingDay[], date: SessionDate): number | null {
  const day = tradingDay(calendar, date);
  return day ? clockMinutes(day.close) : null;
}

/** UTC epoch milliseconds of a session's close, or null when it is not a trading day. */
export function sessionCloseMs(calendar: TradingDay[], date: SessionDate): number | null {
  const close = sessionClose(calendar, date);
  return close === null ? null : etToEpochMs(date, close);
}

/** True when the calendar has entries on both sides of `date`, so a missing entry means "closed". */
export function calendarCovers(calendar: TradingDay[], date: SessionDate): boolean {
  return calendar.length > 0 && calendar[0].date <= date && calendar[calendar.length - 1].date > date;
}

/**
 * The session whose close-to-close move first reflects news released at `acceptedAt`.
 * Before the open of a trading day → that day (bmo); before its close → that day (during);
 * at or after the close → next trading day (amc); on a non-trading day → next trading day (bmo).
 */
export function releaseSession(
  calendar: TradingDay[],
  acceptedAt: IsoInstant,
): { session: SessionDate; timing: Timing | "during" } | null {
  const { date, minutes } = etParts(acceptedAt);
  const day = tradingDay(calendar, date);
  if (!day) {
    if (!calendarCovers(calendar, date)) return null;
    const session = nextSession(calendar, date);
    return session ? { session, timing: "bmo" } : null;
  }
  if (minutes < clockMinutes(day.open)) return { session: date, timing: "bmo" };
  if (minutes < clockMinutes(day.close)) return { session: date, timing: "during" };
  const session = nextSession(calendar, date);
  return session ? { session, timing: "amc" } : null;
}
