import type { EarningsCall, EvidenceDoc, EvidenceSource, ModelCall } from "./types";

/**
 * Deterministic checks on a model's call before it can be locked: shape, lengths, verbatim
 * quotes from the named document, and no numbers in the prose that the evidence does not hold.
 */

const POINT_MAX = 240;
const THESIS_MAX = 300;
const WRONG_IF_MAX = 240;
const QUOTE_MIN_WORDS = 6;
const QUOTE_MAX_WORDS = 25;
const ALLOWED_NUMBER_TOLERANCE = 0.05;

const SOURCES: EvidenceSource[] = ["press_release", "mdna"];

/** Canonical text for verbatim comparison: NFKC, straight quotes, ASCII hyphens, no pipes, single spaces, lowercase. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

/** True when `needle` occurs in `haystack` (both normalised) at word boundaries. */
export function containsVerbatim(haystack: string, needle: string): boolean {
  if (needle === "") return false;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    if (onWordBoundaries(haystack, at, at + needle.length)) return true;
  }
  return false;
}

/** Form names and exhibit numbers are labels, not figures. */
const LABELS = /\b(?:10-q|10-k|8-k|20-f|6-k|40-f)\b|\bex-\d+(?:\.\d+)?/g;
/** A figure not glued to a preceding letter (so Q3, FY27 and H1 are skipped). */
const FIGURE = /(?<![a-z0-9.,])\d+(?:,\d{3})*(?:\.\d+)?(?!\d|st\b|nd\b|rd\b|th\b)/g;

/** Absolute numeric values written in a normalised text. */
function figures(normalized: string): { raw: string; value: number }[] {
  const text = normalized.replace(LABELS, " ");
  return [...text.matchAll(FIGURE)].map((m) => ({ raw: m[0], value: Number(m[0].replace(/,/g, "")) }));
}

/** Quarter numbers (1–4) and years (2000–2099) are allowed without evidence. */
function exempt(raw: string, value: number): boolean {
  if (/^[1-4]$/.test(raw)) return true;
  return /^20\d\d$/.test(raw) && value >= 2000 && value <= 2099;
}

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
  const words = normalizedQuote.split(" ").length;
  if (words < QUOTE_MIN_WORDS || words > QUOTE_MAX_WORDS) errors.push(`${side}.quote_word_count:${words}`);
  const doc = docs.find((d) => d.source === source);
  if (!doc) errors.push(`${side}.source_doc_missing:${source}`);
  else if (!containsVerbatim(normalizeText(doc.text), normalizedQuote)) {
    errors.push(`${side}.quote_not_found_in_${source}`);
  }
  return { point, source: source as EvidenceSource, quote };
}

function checkNumbers(
  errors: Errors,
  field: string,
  text: string,
  evidence: Set<number>,
  allowed: number[],
): void {
  const reported = new Set<string>();
  for (const { raw, value } of figures(normalizeText(text))) {
    if (exempt(raw, value) || evidence.has(value)) continue;
    if (allowed.some((n) => Math.abs(Math.abs(n) - value) <= ALLOWED_NUMBER_TOLERANCE + 1e-9)) continue;
    const label = raw.replace(/,/g, "");
    if (reported.has(label)) continue;
    reported.add(label);
    errors.push(`${field}.number_not_in_evidence:${label}`);
  }
}

const isConfidence = (value: unknown): value is ModelCall["confidence"] =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;

export function validateModelCall(
  raw: unknown,
  ctx: { ticker: string; docs: EvidenceDoc[]; allowedNumbers: number[] },
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

  const evidence = new Set(ctx.docs.flatMap((doc) => figures(normalizeText(doc.text)).map((f) => f.value)));
  if (bull) checkNumbers(errors, "bull.point", bull.point, evidence, ctx.allowedNumbers);
  if (bear) checkNumbers(errors, "bear.point", bear.point, evidence, ctx.allowedNumbers);
  checkNumbers(errors, "thesis", thesis, evidence, ctx.allowedNumbers);
  checkNumbers(errors, "wrong_if", wrongIf, evidence, ctx.allowedNumbers);

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
