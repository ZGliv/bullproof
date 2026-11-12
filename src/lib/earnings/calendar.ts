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

/** Alpha Vantage spells out "Inc." and "N.V."; everything else keeps its own word. */
const SPELLED_OUT: Record<string, string> = { INCORPORATED: "Inc", "NAAMLOZE VENNOOTSCHAP": "N.V." };
/** Corporate forms and acronyms that are written in capitals. */
const UPPER_WORDS = new Set(["PLC", "LLC", "LP", "LLP", "NV", "SA", "AG", "SE", "ADR", "ADS", "REIT", "ETF", "US", "USA"]);
/** Abbreviations written in title case. */
const TITLE_WORDS = new Set(["INC", "CORP", "CO", "LTD"]);
/** Short words lower-cased inside a name ("Bank of America"). */
const MINOR_WORDS = new Set(["A", "AN", "AND", "AT", "BY", "DE", "DEL", "FOR", "IN", "OF", "ON", "OR", "THE", "TO"]);
const ROMAN = /^(?:I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV)$/;

const title = (word: string) => word.charAt(0) + word.slice(1).toLowerCase();

/** One upper-case word (no spaces) in display case. */
function displayWord(word: string, ticker: string, first: boolean): string {
  if (word.includes("-")) return word.split("-").map((part) => displayWord(part, ticker, first)).join("-");
  const dotCom = /^(.+)\.COM$/.exec(word);
  if (dotCom) return `${displayWord(dotCom[1], ticker, first)}.com`;
  const possessive = /^(.+)'S$/.exec(word);
  if (possessive) return `${displayWord(possessive[1], ticker, first)}'s`;
  const letters = word.replace(/[^A-Z]/g, "");
  if (letters === "") return word;
  if (UPPER_WORDS.has(word) || ROMAN.test(word) || word.includes("&") || word.includes(".")) return word;
  if (TITLE_WORDS.has(word)) return title(word);
  if (MINOR_WORDS.has(word)) return first ? title(word) : word.toLowerCase();
  // Acronyms: no vowels (CSX, NVR, TJX), a single letter, a short word with digits (3M, A2Z),
  // or a short leading word that is the ticker itself (CAE Inc, AIB Data Centers).
  if (!/[AEIOUY]/.test(letters) || letters.length === 1) return word;
  if (/\d/.test(word) && word.length <= 3) return word;
  if (first && word === ticker && word.length <= 3) return word;
  if (/^MC[A-Z]{3,}$/.test(word)) return `Mc${title(word.slice(2))}`;
  if (/^O'[A-Z]/.test(word)) return `O'${title(word.slice(2))}`;
  return title(word);
}

/**
 * Display case for Alpha Vantage's upper-case company names:
 * "CISCO SYSTEMS INCORPORATED" → "Cisco Systems Inc", "HOME DEPOT INCORPORATED (THE)" → "The Home Depot Inc".
 */
export function displayName(raw: string, ticker: string): string {
  let name = raw.trim().replace(/\s+/g, " ").toUpperCase();
  if (name.endsWith(" (THE)")) name = `THE ${name.slice(0, -6)}`;
  for (const [long, short] of Object.entries(SPELLED_OUT)) name = name.replace(new RegExp(`\\b${long}\\b`, "g"), short);
  return name
    .split(" ")
    .map((word, i) => (word === "Inc" || word === "N.V." ? word : displayWord(word, ticker, i === 0)))
    .join(" ");
}
