import type { EarningsCall, EvidenceDoc, EvidenceSource, ModelCall } from "./types";

/**
 * Deterministic checks on a model's call before it can be locked: shape, lengths, verbatim
 * quotes from the named document, no numbers in the prose that the evidence does not hold,
 * and the failure modes of the writing that can be caught mechanically (advice, consensus talk,
 * a wrong_if that restates the grading rule, quotes from boilerplate, points that copy quotes).
 */

const POINT_MIN = 40;
const POINT_MAX = 240;
const THESIS_MAX = 300;
const WRONG_IF_MAX = 240;
const QUOTE_MIN_WORDS = 6;
const QUOTE_MAX_WORDS = 25;
const ALLOWED_NUMBER_TOLERANCE = 0.05;
/** Word overlap above which a point counts as the quote reworded. */
const COPY_OVERLAP = 0.8;
/** Small counts such as "3 of the last 8 reactions" need no evidence. */
const COUNT_MAX = 8;

const SOURCES: EvidenceSource[] = ["press_release", "mdna"];

const QUOTE_CHARS: [RegExp, string][] = [
  [/[‘’‚‛′]/, "'"],
  [/[“”„‟″]/, '"'],
  [/[‐-―−]/, "-"],
];

/**
 * Normalised text plus, for each of its characters, the span of the original text it came from,
 * so a match in the normalised text can be cut back out of the original.
 */
function normalizeWithMap(s: string): { text: string; from: number[]; to: number[] } {
  let text = "";
  const from: number[] = [];
  const to: number[] = [];
  let at = 0;
  for (const char of s) {
    const end = at + char.length;
    let out = char.normalize("NFKC");
    for (const [pattern, replacement] of QUOTE_CHARS) out = out.replace(pattern, replacement);
    out = out.toLowerCase();
    for (const c of out) {
      const space = /\s/.test(c) || c === "|";
      if (space && (text === "" || text.endsWith(" "))) continue;
      text += space ? " " : c;
      from.push(at);
      to.push(end);
    }
    at = end;
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    from.pop();
    to.pop();
  }
  return { text, from, to };
}

/** Canonical text for verbatim comparison: NFKC, straight quotes, ASCII hyphens, no pipes, single spaces, lowercase. */
export function normalizeText(s: string): string {
  return normalizeWithMap(s).text;
}

const WRAPPING_QUOTES: [string, string][] = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["‘", "’"],
  ["«", "»"],
];

function stripWrappingQuotes(quote: string): string {
  let text = quote.trim();
  for (let changed = true; changed; ) {
    changed = false;
    for (const [open, close] of WRAPPING_QUOTES) {
      if (text.length >= 2 && text.startsWith(open) && text.endsWith(close)) {
        text = text.slice(open.length, -close.length).trim();
        changed = true;
      }
    }
  }
  return text;
}

const WORD_CHAR = /[a-z0-9]/;

/**
 * A match must start and end on word boundaries, or a quote could be a fragment of a figure
 * ("$114" inside "$114.5 billion") or start mid-word ("ompany posted"). A period next to the
 * match only counts as part of a figure when a digit sits on its far side, so a quote may
 * still stop right before a sentence-ending period.
 */
function onWordBoundaries(text: string, start: number, end: number): boolean {
  const before = text[start - 1] ?? " ";
  const after = text[end] ?? " ";
  if (WORD_CHAR.test(before) || before === "$" || before === "%") return false;
  if (before === "." && /\d/.test(text[start - 2] ?? "")) return false;
  if (WORD_CHAR.test(after) || after === "$" || after === "%") return false;
  if (after === "." && /\d/.test(text[end + 1] ?? "")) return false;
  return true;
}

/** Where `needle` occurs in `haystack` (both normalised) at word boundaries, or -1. */
function findVerbatim(haystack: string, needle: string): number {
  if (needle === "") return -1;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    if (onWordBoundaries(haystack, at, at + needle.length)) return at;
  }
  return -1;
}

/** True when `needle` occurs in `haystack` (both normalised) at word boundaries. */
export function containsVerbatim(haystack: string, needle: string): boolean {
  return findVerbatim(haystack, needle) !== -1;
}

/**
 * The document's own text for a quote, or null when the quote is not in it. The published quote
 * is cut from the filing, so case or punctuation the model changed never reaches the page.
 */
export function quoteFromDocument(docText: string, quote: string): string | null {
  const doc = normalizeWithMap(docText);
  const needle = normalizeText(quote);
  const at = findVerbatim(doc.text, needle);
  if (at === -1) return null;
  return docText.slice(doc.from[at], doc.to[at + needle.length - 1]).replace(/\s+/g, " ");
}

const PASSAGE_MAX_WORDS = 50;

/**
 * The sentence of a document that shares the most words with a quote the model got wrong, so a
 * retry can show it the real text. Long sentences are cut to their first 50 words. `shared` is
 * the number of the quote's words the sentence holds.
 */
export function closestPassage(docText: string, quote: string): { text: string; shared: number } | null {
  const target = words(normalizeText(quote));
  let best: { text: string; shared: number } | null = null;
  for (const sentence of docText.split(/(?<=[.!?])\s+|\n+/)) {
    const shared = [...words(normalizeText(sentence))].filter((word) => target.has(word)).length;
    if (shared > (best?.shared ?? 0)) best = { text: sentence, shared };
  }
  if (!best) return null;
  return { text: best.text.trim().split(/\s+/).slice(0, PASSAGE_MAX_WORDS).join(" "), shared: best.shared };
}

/** Form names, exhibit numbers and ISO dates are labels, not figures. */
const LABELS = /\b(?:10-q|10-k|8-k|20-f|6-k|40-f)\b|\bex-\d+(?:\.\d+)?|\b20\d\d-\d\d-\d\d\b/g;
/** A figure not glued to a preceding letter (so Q3, FY27 and H1 are skipped). */
const FIGURE = /(?<![a-z0-9.,])\d+(?:,\d{3})*(?:\.\d+)?(?!\d|st\b|nd\b|rd\b|th\b)/g;
const PERCENT_AFTER = /^ ?(?:%|percent)/;
const COUNT_AFTER = /^ of\b/;
const COUNT_BEFORE = /\b(?:last|past) $/;

interface Figure {
  raw: string;
  value: number;
  percent: boolean;
  count: boolean;
}

/** Absolute numeric values written in a normalised text. */
function figures(normalized: string): Figure[] {
  const text = normalized.replace(LABELS, " ");
  return [...text.matchAll(FIGURE)].map((m) => {
    const before = text.slice(Math.max(0, m.index - 6), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 9);
    const value = Number(m[0].replace(/,/g, ""));
    const count = COUNT_AFTER.test(after) || COUNT_BEFORE.test(before);
    return { raw: m[0], value, percent: PERCENT_AFTER.test(after), count };
  });
}

/** Years (2000–2099) and small counts ("3 of the last 4") are allowed without evidence. */
function exempt({ raw, value, count }: Figure): boolean {
  if (count && /^\d$/.test(raw) && value <= COUNT_MAX) return true;
  return /^20\d\d$/.test(raw) && value >= 2000 && value <= 2099;
}

/** All patterns run on normalised (lower-case) text unless noted. */
const matchesAny = (patterns: RegExp[], text: string) => patterns.some((pattern) => pattern.test(text));

/** Words that sell or rate the stock rather than describe the business. */
const ADVICE = [
  /\b(?:buy|sell|hold|short|own)(?:ing)? (?:the |its )?(?:stock|shares)\b/,
  /\bgo(?:ing)? long\b|\btake profits?\b|\bbuy the dip\b/,
  /\bprice target\b|\b(?:buy|sell|hold) rating\b|\bwe recommend\b/,
  /\b(?:investors|you|readers|holders) should\b|\bshould (?:buy|sell|own|hold)\b/,
  /\b(?:upside|downside) (?:target|potential)\b|\d% (?:upside|downside)\b/,
];
/** Third-party expectations the model has no source for. */
const CONSENSUS = [/\bconsensus\b|\banalysts?\b|\bestimates?\b|\bthe street\b|\bwall street\b|\bwhisper\b/];
/** Words about the line or the size of the move. */
const LINE_TALK = [/\bthe line\b|\bmedian\b|\bover\/under\b|\bover or under\b/];
/** A wrong_if that says how the call is graded instead of naming a business result. */
const RESTATES_GRADING = [
  ...LINE_TALK,
  /\b(?:stock|shares) (?:closes?|ends?|finish(?:es)?|rises?|falls?|drops?|gains?|declines?|trades?|moves?)\b/,
  /\b(?:closes?|closing|moves?) (?:up|down|higher|lower)\b/,
  /\babsolute move\b|\bthe move\b|\bmove (?:exceeds|is (?:over|under|below|above))\b/,
];
/** Talk about the size of the move, for a call that has no line. */
const NO_LINE = [
  ...LINE_TALK,
  /% line\b|\btypical move\b|\bsize of the move\b|\bpast (?:two|\d+|earnings) reactions\b/,
  /\b(?:absolute|price|stock|share|earnings-day|earnings day) move\b/,
];
/** A stock-price figure: it must be one of the supplied figures (a past reaction, the line). */
const STOCK_FIGURE = /\b(?:stock|shares)\b[^.;]{0,40}?(\d+(?:\.\d+)?) ?%/g;
/** Runs on the original text, so "US" is not "us". */
const FIRST_PERSON = /\b(?:we|We|our|Our|us)\b/;
/** Policy, risk-factor and safe-harbour language. */
const BOILERPLATE = [
  /\bmay\b|\bcould\b|\bmight\b|in a particular period|forward-looking|safe harbou?r/,
  /recogni[sz]e[sd]? revenue|revenue recognition|performance obligations/,
  /in accordance with|generally accepted/,
];
/** A pointer to another part of the filing is never evidence. */
const CROSS_REFERENCE = [/\b(?:refer to|see) (?:note|part|item)\b/];
/** A result, trend or expectation, which a hedged sentence can still carry. */
const DIRECTION_WORD = [
  /increas|decreas|\bgr[eo]w|declin|\brose\b|\bfell\b|\bup\b|\bdown\b|record|lower|higher/,
  /expect|improv|expan|contract|slow|accelerat|strong|weak/,
];

type Errors = string[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkText(errors: Errors, field: string, value: unknown, max: number): string {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field}.empty`);
    return "";
  }
  const text = value.trim();
  if (text.length > max) errors.push(`${field}.too_long`);
  return text;
}

const words = (normalized: string) => new Set(normalized.match(/[a-z0-9]+(?:[.,]\d+)*/g) ?? []);

/** True when the point is the quote, inside it, around it, or the quote with a few words swapped. */
function copiesQuote(point: string, quote: string): boolean {
  const p = normalizeText(point).replace(/[.!]$/, "");
  const q = normalizeText(quote).replace(/[.!]$/, "");
  if (p.includes(q) || q.includes(p)) return true;
  const a = words(p);
  const b = words(q);
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / (a.size + b.size - shared) > COPY_OVERLAP;
}

function checkSide(
  errors: Errors,
  side: "bull" | "bear",
  raw: unknown,
  docs: EvidenceDoc[],
): ModelCall["bull"] | null {
  if (!isRecord(raw)) {
    errors.push(`${side}.missing`);
    return null;
  }
  const point = checkText(errors, `${side}.point`, raw.point, POINT_MAX);
  if (point !== "" && point.length < POINT_MIN) errors.push(`${side}.point.too_short`);
  const source = raw.source;
  if (!SOURCES.includes(source as EvidenceSource)) {
    errors.push(`${side}.source_invalid`);
    return null;
  }
  const quote = typeof raw.quote === "string" ? stripWrappingQuotes(raw.quote) : "";
  if (quote === "") {
    errors.push(`${side}.quote.empty`);
    return null;
  }
  const normalizedQuote = normalizeText(quote);
  const count = normalizedQuote.split(" ").length;
  if (count < QUOTE_MIN_WORDS || count > QUOTE_MAX_WORDS) errors.push(`${side}.quote_word_count:${count}`);
  const hedged = matchesAny(BOILERPLATE, normalizedQuote) && !/\d/.test(normalizedQuote);
  if (matchesAny(CROSS_REFERENCE, normalizedQuote) || (hedged && !matchesAny(DIRECTION_WORD, normalizedQuote))) {
    errors.push(`${side}.quote_boilerplate`);
  }
  if (point !== "" && copiesQuote(point, quote)) errors.push(`${side}.point_copies_quote`);
  const doc = docs.find((d) => d.source === source);
  if (!doc) {
    errors.push(`${side}.source_doc_missing:${source}`);
    return { point, source: source as EvidenceSource, quote };
  }
  const published = quoteFromDocument(doc.text, quote);
  if (published === null) errors.push(`${side}.quote_not_found_in_${source}`);
  return { point, source: source as EvidenceSource, quote: published ?? quote };
}

interface Evidence {
  values: Set<number>;
  percents: Set<number>;
  allowed: number[];
}

const isAllowed = (allowed: number[], value: number) =>
  allowed.some((n) => Math.abs(Math.abs(n) - value) <= ALLOWED_NUMBER_TOLERANCE + 1e-9);

/**
 * Every figure must be in the documents or among the supplied figures. A percentage must be a
 * percentage in the documents too, so an unrelated "14" cannot carry a "14%" claim.
 */
function checkNumbers(errors: Errors, field: string, normalized: string, evidence: Evidence): void {
  const reported = new Set<string>();
  for (const figure of figures(normalized)) {
    if (exempt(figure) || isAllowed(evidence.allowed, figure.value)) continue;
    const known = figure.percent ? evidence.percents : evidence.values;
    if (known.has(figure.value)) continue;
    const label = figure.raw.replace(/,/g, "");
    if (reported.has(label)) continue;
    reported.add(label);
    errors.push(`${field}.number_not_in_evidence:${label}`);
  }
  for (const match of normalized.matchAll(STOCK_FIGURE)) {
    const value = Number(match[1]);
    if (!isAllowed(evidence.allowed, value)) errors.push(`${field}.stock_forecast:${match[1]}`);
  }
}

/** Rules for every piece of the model's own prose. */
function checkProse(errors: Errors, field: string, text: string, evidence: Evidence, line: number | null): void {
  const normalized = normalizeText(text);
  if (matchesAny(ADVICE, normalized)) errors.push(`${field}.advice_language`);
  if (matchesAny(CONSENSUS, normalized)) errors.push(`${field}.invented_consensus`);
  if (FIRST_PERSON.test(text)) errors.push(`${field}.first_person`);
  if (line === null && matchesAny(NO_LINE, normalized)) errors.push(`${field}.no_line_mentioned`);
  checkNumbers(errors, field, normalized, evidence);
}

function restatesGrading(wrongIf: string, line: number | null): boolean {
  const normalized = normalizeText(wrongIf);
  if (matchesAny(RESTATES_GRADING, normalized)) return true;
  return line !== null && new RegExp(`(?<![\\d.])${line.toFixed(1).replace(".", "\\.")} ?%`).test(normalized);
}

/** True when the text holds one of the line's figures, so the move pick rests on the history. */
function citesReaction(text: string, values: number[]): boolean {
  return figures(normalizeText(text)).some((figure) => isAllowed(values, figure.value));
}

const isConfidence = (value: unknown): value is ModelCall["confidence"] =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;

export interface ValidationContext {
  ticker: string;
  docs: EvidenceDoc[];
  /** Supplied figures the prose may use: the reference close, and the line and past moves when there is a line. */
  allowedNumbers: number[];
  /** The line value; null when the call has no over/under leg. */
  line: number | null;
  /** Absolute past reaction moves behind the line; the thesis must cite one (or the line) to argue the move. */
  moves: number[];
}

export function validateModelCall(
  raw: unknown,
  ctx: ValidationContext,
): { ok: true; call: ModelCall } | { ok: false; errors: string[] } {
  if (!isRecord(raw)) return { ok: false, errors: ["not_object"] };
  const errors: Errors = [];

  const ticker = typeof raw.ticker === "string" ? raw.ticker.trim().toUpperCase() : "";
  if (ticker !== ctx.ticker.toUpperCase()) errors.push("ticker.mismatch");
  if (raw.direction !== "up" && raw.direction !== "down") errors.push("direction.invalid");
  if (raw.move !== "over" && raw.move !== "under") errors.push("move.invalid");
  if (!isConfidence(raw.confidence)) errors.push("confidence.invalid");

  const bull = checkSide(errors, "bull", raw.bull, ctx.docs);
  const bear = checkSide(errors, "bear", raw.bear, ctx.docs);
  if (bull && bear && normalizeText(bull.quote) === normalizeText(bear.quote)) errors.push("quotes_identical");

  const thesis = checkText(errors, "thesis", raw.thesis, THESIS_MAX);
  const wrongIf = checkText(errors, "wrong_if", raw.wrong_if, WRONG_IF_MAX);
  if (wrongIf !== "" && restatesGrading(wrongIf, ctx.line)) errors.push("wrong_if.restates_grading");

  const docFigures = ctx.docs.flatMap((doc) => figures(normalizeText(doc.text)));
  const evidence: Evidence = {
    values: new Set(docFigures.map((f) => f.value)),
    percents: new Set(docFigures.filter((f) => f.percent).map((f) => f.value)),
    allowed: ctx.allowedNumbers,
  };
  if (bull) checkProse(errors, "bull.point", bull.point, evidence, ctx.line);
  if (bear) checkProse(errors, "bear.point", bear.point, evidence, ctx.line);
  checkProse(errors, "thesis", thesis, evidence, ctx.line);
  if (thesis !== "" && ctx.line !== null && !citesReaction(thesis, [ctx.line, ...ctx.moves])) {
    errors.push("thesis.move_unargued");
  }
  checkProse(errors, "wrong_if", wrongIf, evidence, ctx.line);

  if (errors.length > 0 || !bull || !bear) return { ok: false, errors };
  return {
    ok: true,
    call: {
      ticker,
      direction: raw.direction as ModelCall["direction"],
      move: raw.move as ModelCall["move"],
      confidence: raw.confidence as ModelCall["confidence"],
      bull,
      bear,
      thesis,
      wrong_if: wrongIf,
    },
  };
}

type HashedCall = Omit<EarningsCall, "hash" | "status" | "grade" | "voidReason">;
const MUTABLE_FIELDS = new Set(["hash", "status", "grade", "voidReason"]);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) sorted[key] = canonical(value[key]);
  }
  return sorted;
}

/**
 * Canonical JSON (keys sorted at every depth) of the fields fixed at lock time. The caller
 * hashes it with SHA-256. Status, grade, void reason and the hash itself are excluded.
 */
export function callHashInput(call: HashedCall | EarningsCall): string {
  const immutable = Object.fromEntries(Object.entries(call).filter(([key]) => !MUTABLE_FIELDS.has(key)));
  return JSON.stringify(canonical(immutable));
}
