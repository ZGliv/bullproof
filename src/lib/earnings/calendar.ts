import type { DailyBar, Reporter, SessionDate, Timing, TradingDay } from "./types";
import { isSession, nextSession } from "./time";

/** Alpha Vantage EARNINGS_CALENDAR CSV header, exactly as served. */
const CALENDAR_HEADER = "symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay";
const PLAIN_TICKER = /^[A-Z]{1,5}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMING: Record<string, Timing> = { "pre-market": "bmo", "post-market": "amc" };

/**
 * True when the body is the calendar CSV. When Alpha Vantage throttles or rejects a key it
 * answers 200 with a JSON note instead, which must be told apart from an empty calendar.
 */
export function isCalendarCsv(text: string): boolean {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0];
  return firstLine.trim() === CALENDAR_HEADER;
}

/** Splits CSV text into rows of fields (RFC 4180 quoting, CRLF or LF line ends). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseEstimate(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Upcoming reporters with a confirmed session slot. Rows without a pre/post-market time are
 * estimates and are dropped, as are non-USD rows and tickers that are not plain 1–5 letters
 * (share-class dots, preferreds and units).
 */
export function parseAlphaVantageCalendar(csv: string): Reporter[] {
  if (!isCalendarCsv(csv)) return [];
  const [, ...rows] = parseCsv(csv.replace(/^﻿/, ""));
  const reporters: Reporter[] = [];
  const seen = new Set<string>();
  for (const [symbol, name, reportDate, , estimate, currency, timeOfDay] of rows) {
    const timing = TIMING[timeOfDay?.trim() ?? ""];
    if (!timing || currency !== "USD") continue;
    if (!PLAIN_TICKER.test(symbol) || !ISO_DATE.test(reportDate) || seen.has(symbol)) continue;
    seen.add(symbol);
    reporters.push({ ticker: symbol, name: name.trim(), reportDate, timing, epsEstimate: parseEstimate(estimate) });
  }
  return reporters;
}

/** Reporters whose results land on `session` (both before the open and after the close). */
export function slateCandidates(reporters: Reporter[], session: SessionDate): Reporter[] {
  return reporters.filter((reporter) => reporter.reportDate === session);
}

/** The session whose close grades a call on this reporter. */
export function expectedGradeSession(calendar: TradingDay[], reporter: Reporter): SessionDate | null {
  if (reporter.timing === "bmo" && isSession(calendar, reporter.reportDate)) return reporter.reportDate;
  return nextSession(calendar, reporter.reportDate);
}

export interface RankedReporter {
  reporter: Reporter;
  lastClose: number;
  lastCloseDate: SessionDate;
  dollarVolume: number;
}

const LIQUIDITY_WINDOW = 20;

/** Candidates that clear the price and liquidity floors, most liquid first. */
export function liquidityRank(
  candidates: Reporter[],
  barsByTicker: Record<string, DailyBar[]>,
  opts: { minPrice?: number; minDollarVolume?: number } = {},
): RankedReporter[] {
  const minPrice = opts.minPrice ?? 10;
  const minDollarVolume = opts.minDollarVolume ?? 50_000_000;
  const ranked: RankedReporter[] = [];
  for (const reporter of candidates) {
    const bars = [...(barsByTicker[reporter.ticker] ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    const recent = bars.slice(-LIQUIDITY_WINDOW);
    if (recent.length === 0) continue;
    const last = recent[recent.length - 1];
    const dollarVolume = recent.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / recent.length;
    if (last.close < minPrice || dollarVolume < minDollarVolume) continue;
    ranked.push({ reporter, lastClose: last.close, lastCloseDate: last.date, dollarVolume });
  }
  return ranked.sort(
    (a, b) => b.dollarVolume - a.dollarVolume || a.reporter.ticker.localeCompare(b.reporter.ticker),
  );
}
