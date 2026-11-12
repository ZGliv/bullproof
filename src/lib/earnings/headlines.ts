import type { IsoInstant } from "./types";

/**
 * Recognises news headlines that announce a company's own quarterly or annual results.
 *
 * A false positive is expensive: at publish time it drops a company from the slate, and at
 * grading time an early "results" headline can void a call. So the patterns are narrow and
 * anything that reads as a schedule notice, preview, transcript, guidance-only line, analyst
 * note or market wrap is rejected first.
 */

const NOT_RESULTS = [
  /\b(?:to|will) (?:report|announce|release|host|hold|present|discuss|webcast)\b/i,
  /\b(?:sets?|schedules?|scheduled|confirms?|announces?) (?:the )?(?:date|time)\b/i,
  /\bschedules?\b/i,
  /\b(?:release|reporting|announcement|call) dates?\b/i,
  /\bdate for\b/i,
  /\b(?:conference|earnings|investor) call\b/i,
  /\btranscript\b/i,
  /\bwebcast\b/i,
  /\bpreview\b/i,
  /\b(?:ahead of|before|heading into|gears? up for)\b/i,
  /\bexpectations?\b/i,
  /\bwhat (?:to expect|investors need)\b/i,
  /\b(?:likely to|expected to|could|set to)\b/i,
  /\b(?:earnings|results) (?:are )?(?:due|loom|imminent)\b/i,
  /\bprediction market\b/i,
  /\banalysts?\b/i,
  /\bprice target\b/i,
  /\b(?:forecasts?|estimates?) (?:changes?|revis)/i,
  /\b(?:upgrades?|downgrades?|initiates? coverage)\b/i,
  /\bpreliminary\b/i,
  /\bjoins\b.*\b(?:stocks|shares)\b/i,
  /\?\s*$/,
];

/** Case-insensitive match of any alternative as a whole word. */
function anyWord(alternatives: string[]): RegExp {
  return new RegExp(`\\b(?:${alternatives.join("|")})\\b`, "i");
}

/** Verbs a company uses when it publishes its own results. */
const REPORT_VERB = /\b(?:reports?|reported|announces?|announced|posts?|posted|delivers?|releases?|unveils?)\b/i;

/** A fiscal period: Q3, third quarter, fiscal 2026, full year, nine months ended, September quarter. */
const PERIOD = anyWord([
  "q[1-4]",
  "(?:first|second|third|fourth|1st|2nd|3rd|4th)[- ](?:fiscal )?quarter",
  "fiscal (?:year )?(?:20)?\\d\\d",
  "fy ?(?:20)?\\d\\d",
  "full[- ]year",
  "year[- ]end",
  "(?:three|six|nine|twelve)[- ]months?",
  "nine-month",
  "(?:march|june|september|december) quarter",
  "quarterly",
]);

/** Words that make a period-and-verb headline about financials rather than, say, a trial. */
const FINANCIAL = /\b(?:results|earnings|eps|revenues?|sales|profit|loss|income)\b/i;

/** Benzinga-style results flash: "Q3 EPS $0.18 Beats …", "Q3 Adj. EPS $(0.23) Misses …". */
const RESULTS_FLASH = new RegExp(
  "\\bq[1-4]\\s+" +
    "(?:(?:adj\\.?|adjusted|gaap|non-gaap|core)\\s+)?" +
    "(?:eps|sales|revenues?|net (?:income|loss)|earnings|loss)\\s+" +
    "(?:of\\s+)?(?:r?\\$|\\(|-?\\d)",
  "i",
);

/** Guidance lines ("Sees Q4 Sales $142M-$152M") look like flashes but are forecasts. */
const GUIDANCE = anyWord([
  "sees", "expects", "guides", "projects", "forecasts", "reaffirms",
  "affirms", "reiterates", "maintains", "raises", "lowers", "cuts",
]);

/** "Posts Upbeat Earnings", "Reports Strong Results" — tone word then results, no period named. */
const TONED_RESULTS = new RegExp(
  "\\b(?:reports?|posts?|delivers?)\\s+" +
    "(?:upbeat|downbeat|strong|weak|mixed|solid|record|better-than-expected|worse-than-expected)\\s+" +
    "(?:quarterly\\s+)?(?:results|earnings)\\b",
  "i",
);

export function isResultsHeadline(headline: string): boolean {
  const text = headline.replace(/\s+/g, " ").trim();
  if (text === "" || NOT_RESULTS.some((pattern) => pattern.test(text))) return false;
  if (RESULTS_FLASH.test(text) && !GUIDANCE.test(text)) return true;
  if (TONED_RESULTS.test(text)) return true;
  return REPORT_VERB.test(text) && PERIOD.test(text) && FINANCIAL.test(text);
}

/** The earliest results headline published strictly after `after`, or null. */
export function firstResultsHeadline(
  items: { headline: string; createdAt: IsoInstant }[],
  after: IsoInstant,
): { at: IsoInstant; headline: string } | null {
  const afterMs = Date.parse(after);
  let first: { at: IsoInstant; headline: string; ms: number } | null = null;
  for (const item of items) {
    const ms = Date.parse(item.createdAt);
    if (!Number.isFinite(ms) || ms <= afterMs || !isResultsHeadline(item.headline)) continue;
    if (!first || ms < first.ms) first = { at: item.createdAt, headline: item.headline, ms };
  }
  return first && { at: first.at, headline: first.headline };
}
