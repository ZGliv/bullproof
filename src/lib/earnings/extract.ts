/**
 * SEC filing HTML -> plain narrative text, and trimming of the press release and MD&A.
 * Pure string/regex code: no DOM parser and no Node-only imports.
 */

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  bull: "•",
  middot: "·",
  reg: "®",
  trade: "™",
  copy: "©",
  hellip: "…",
  sect: "§",
  zwsp: "",
  shy: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n > 0x10ffff) return match;
      return n === 160 ? " " : String.fromCodePoint(n);
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function wordCount(s: string): number {
  return s.match(/\S+/g)?.length ?? 0;
}

const BLOCK_TAGS = "p|div|li|ul|ol|h[1-6]|tr|table|center|section|article|blockquote|dt|dd";

/** Removes elements whose inline style hides them, including nested children of the same tag. */
function removeHidden(html: string): string {
  const open = /<(div|span|p|table)\b[^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^>]*>/gi;
  let out = "";
  let from = 0;
  let match: RegExpExecArray | null;
  while ((match = open.exec(html))) {
    const tag = match[1].toLowerCase();
    const end = closingIndex(html, tag, match.index + match[0].length);
    out += html.slice(from, match.index);
    from = end;
    open.lastIndex = end;
  }
  return out + html.slice(from);
}

function closingIndex(html: string, tag: string, from: number): number {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = from;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return html.length;
}

function cellText(cellHtml: string): string {
  return decodeEntities(cellHtml.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

const NUMERIC_CELL = /^[\s$()%,.\-—–‒−*0-9]+$/;

/** Financial statement tables are dropped; layout tables (bullets, two-column text) become lines. */
function tableToText(table: string): string {
  const cells = [...table.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map((m) => cellText(m[1]))
    .filter(Boolean);
  if (!cells.length) return "\n";
  const numeric = cells.filter((c) => NUMERIC_CELL.test(c)).length;
  if (numeric / cells.length > 0.35) return "\n";
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => cellText(m[1]))
      .filter(Boolean)
      .join(" "),
  );
  return `\n${rows.filter(Boolean).join("\n")}\n`;
}

const PAGE_ARTEFACT = /^(\d{1,3}|-\s?\d{1,3}\s?-|[ivxlc]{1,6}|table of contents|index|page \d+( of \d+)?)$/i;
/** Running page headers and footers: "LANDSTAR SYSTEM/4", "Apple Inc. | 2026 Form 10-K | 29". */
const PAGE_HEADER = /^[^a-z]{2,40}\/\s?\d{1,3}$/;
const PAGE_FOOTER = /^.{0,40}\bform 10-[kq]\s*\|\s*\d{1,3}$/i;

/** Converts an EDGAR HTML document (exhibit or inline-XBRL report) to text with one block per line. */
export function htmlToText(html: string): string {
  let h = html;
  const text = h.match(/<TEXT>([\s\S]*?)(<\/TEXT>|$)/i);
  if (text) h = text[1];
  h = h
    .replace(/<ix:header>[\s\S]*?<\/ix:header>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<head\b[\s\S]*?<\/head>/gi, "")
    .replace(/<(script|style|title)\b[\s\S]*?<\/\1>/gi, "");
  h = removeHidden(h);
  h = h.replace(/\s+/g, " ");
  h = h.replace(/<table\b[\s\S]*?<\/table>/gi, tableToText);
  h = h
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(new RegExp(`</?(${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n")
    .replace(/<[^>]+>/g, "");
  h = decodeEntities(h)
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, " ")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "");
  return h
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line && !PAGE_ARTEFACT.test(line) && !PAGE_HEADER.test(line) && !PAGE_FOOTER.test(line))
    .join("\n");
}

/** A line is numeric (table residue) when most of its tokens start with a digit. */
export function isNumericLine(line: string): boolean {
  const tokens = line
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/(^|\s)[\u2014\u2013-](?=\s|$)/g, "$1 0")
    .replace(/[|$%(),+/\u2014\u2013-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 3) return false;
  // Years are words here, so "September 30, 2026" does not look like a table row.
  const isNumber = (t: string) => /^\.?\d/.test(t) && !/^(19|20)\d\d$/.test(t);
  const share = tokens.filter(isNumber).length / tokens.length;
  const trailing = trailingFigures(tokens, isNumber);
  // Table rows that lost their markup end in a run of figures and carry no sentence punctuation.
  const unpunctuated = !/[.!?:;\u201d"]$/.test(line);
  return share > 0.5 || trailing >= 3 || (share >= 0.3 && trailing >= 2 && unpunctuated);
}

function trailingFigures(tokens: string[], isNumber: (t: string) => boolean): number {
  let i = tokens.length - 1;
  if (i >= 0 && !isNumber(tokens[i]) && tokens[i].length <= 4) i--;
  let run = 0;
  while (i >= 0 && isNumber(tokens[i])) {
    run++;
    i--;
  }
  return run;
}

function letterCount(line: string): number {
  return line.match(/\p{L}/gu)?.length ?? 0;
}

const FOOTNOTE = /^(\(\s?[a-zA-Z0-9]{1,2}\s?\)|\*+|\u2020|\[\d{1,2}\]|\d{1,2}\s+[A-Z]|[Nn]otes?:)/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const UNIT_CAPTION = /^\((in|dollars in|amounts in|\$ in) (thousands|millions|billions)/i;

function isNarrative(line: string): boolean {
  return (
    letterCount(line) >= 3 &&
    !isNumericLine(line) &&
    !FOOTNOTE.test(line) &&
    !UNIT_CAPTION.test(line) &&
    !EMAIL.test(line)
  );
}

function takeWords(lines: string[], budget: number): string[] {
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    const words = wordCount(line);
    if (used + words > budget) {
      const room = budget - used;
      if (room >= 12) out.push(line.split(/\s+/).slice(0, room).join(" "));
      break;
    }
    out.push(line);
    used += words;
  }
  return out;
}

const PR_NOISE =
  /^(exhibit\s*99(\.\d+)?|ex-?99(\.\d+)?|(press|news) release|news|for immediate (release|distribution)\b.{0,60})$/i;
/** Contact lines are dropped where they stand: some releases put them on page one, above the results. */
const CONTACT_LINE = /^((press|investor|media|analyst)( relations)? )?(contacts?|inquiries)\b|\bcontacts?:/i;
/** Headings that open the safe-harbor / company-profile tail of a release. */
const LEGAL_TAIL =
  /forward[- ]looking (statements?|information)|^safe harbor|^cautionary (note|statement|language)|^about [\p{L}][\p{L}\d .,&'\u2019()-]{1,60}$/iu;
/** Everything else that ends the narrative: call details, contacts, non-GAAP notes, statements. */
const OTHER_TAIL = new RegExp(
  [
    "conference call|webcast|earnings call",
    "^(statement regarding |use of )*non-gaap (financial )?(measures?|information)",
    "^reconciliations? of\\b",
    "^supplemental (information|data|schedules?)$",
    "\\bconsolidated (statements? of|balance sheets?)",
  ].join("|"),
  "iu",
);

function isHeading(line: string): boolean {
  return line.length < 120 && !/[.!?]$/.test(line);
}

const SAFE_HARBOR_PARAGRAPH =
  /private securities litigation reform act|^(this|the) (press|news|earnings) release (contains|includes|may contain)[^.]{0,80}forward-looking/i;

function isLegalTail(line: string): boolean {
  return (isHeading(line) && LEGAL_TAIL.test(line)) || SAFE_HARBOR_PARAGRAPH.test(line);
}

function isTail(line: string): boolean {
  return isLegalTail(line) || (isHeading(line) && OTHER_TAIL.test(line));
}

const OUTLOOK_HEADING = /^[\p{L}\d .,&'\u2019()-]{0,40}\b(outlook|guidance)\b[\p{L}\d .,&'\u2019()-]{0,40}$/iu;
const GUIDANCE_WORDS = /\b(outlook|guidance|expects?|expected to|anticipates?|forecasts?|full[- ]year|next quarter)\b/i;
const SAFE_HARBOR_TEXT = /forward-looking|private securities litigation reform act/i;

export interface PressReleaseText {
  text: string;
  words: number;
  outlookWords: number;
}

function firstIndex(lines: string[], test: (line: string) => boolean): number {
  const at = lines.findIndex((line, i) => i > 3 && test(line));
  return at > 0 ? at : lines.length;
}

/**
 * Headline + first ~1,500 words of narrative, stopping at boilerplate headings,
 * plus up to 400 words of outlook/guidance lines that fell outside that budget.
 */
export function pressReleaseText(fullText: string, budget = 1500, outlookBudget = 400): PressReleaseText {
  const lines = fullText.split("\n").filter((line) => !PR_NOISE.test(line) && !CONTACT_LINE.test(line));
  const body = lines.slice(0, firstIndex(lines, isTail)).filter(isNarrative);
  const main = takeWords(body, budget);
  const included = new Set(main);

  // An outlook section can sit after the call details, but never inside the legal tail.
  const region = lines
    .slice(0, firstIndex(lines, isLegalTail))
    .filter((line) => isNarrative(line) && !SAFE_HARBOR_TEXT.test(line));
  const outlook: string[] = [];
  const heading = region.findIndex((line) => line.length < 80 && OUTLOOK_HEADING.test(line));
  if (heading >= 0) {
    for (let i = heading; i < Math.min(region.length, heading + 25); i++) {
      if (i > heading && isTail(region[i])) break;
      if (!included.has(region[i])) outlook.push(region[i]);
    }
  }
  for (const line of body) {
    if (GUIDANCE_WORDS.test(line) && wordCount(line) > 12 && !included.has(line) && !outlook.includes(line))
      outlook.push(line);
  }
  const extra = takeWords(outlook, outlookBudget);
  const text = [...main, ...extra].join("\n");
  return { text, words: wordCount(text), outlookWords: wordCount(extra.join(" ")) };
}

/** Counts earnings-results phrases in the first ~40 narrative lines of an exhibit. */
export function earningsReleaseScore(fullText: string): number {
  const head = fullText
    .split("\n")
    .filter((line) => !PR_NOISE.test(line) && isNarrative(line))
    .slice(0, 40)
    .join("\n");
  const re = /(first|second|third|fourth)[- ]quarter|fiscal (year|20\d\d)|financial results|net (income|loss)|revenue/gi;
  return head.match(re)?.length ?? 0;
}

const PART_PREFIX = "(?:part\\s+i{1,2}\\b[\\s.,:|\\u2014\\u2013-]*)?";
const SEP = "[\\s.:|\\u2014\\u2013-]*";

function mdnaHeading(form: string): RegExp {
  const item = form === "10-K" ? "7(?!\\s*a)" : "2";
  return new RegExp(
    `^\\s*${PART_PREFIX}item\\s*${item}\\b${SEP}management[\\u2019']?s?\\s+discussion`,
    "gim",
  );
}

function mdnaEnd(form: string): RegExp {
  return form === "10-K"
    ? new RegExp(`^\\s*${PART_PREFIX}item\\s*(7a|8)\\b`, "gim")
    : new RegExp(`^\\s*${PART_PREFIX}item\\s*(3${SEP}quantitative|4${SEP}controls)`, "gim");
}

/** Last heading match that is not a table-of-contents entry (followed by a run of other "Item N" lines). */
function bodyHeading(text: string, re: RegExp): number {
  const matches = [...text.matchAll(re)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const after = text.slice(matches[i].index, matches[i].index + 1500);
    if ((after.match(/\bitem\s+\d/gi) ?? []).length <= 2) return matches[i].index;
  }
  return matches.length ? matches[matches.length - 1].index : -1;
}

/** The MD&A section of a 10-Q or 10-K, or "" when its heading cannot be found. */
export function mdnaSection(text: string, form: string): string {
  let start = bodyHeading(text, mdnaHeading(form));
  if (start < 0)
    start = bodyHeading(text, /^\s*management[’']?s discussion and analysis of (financial condition|results)/gim);
  // Some banks (JPM) open the MD&A with a sentence instead of an Item heading.
  if (start < 0)
    start = bodyHeading(text, /^the following (is|discussion)[^\n]{0,40}management[’']?s discussion and analysis/gim);
  if (start < 0) return "";
  const end = [...text.matchAll(mdnaEnd(form))].find((m) => m.index > start + 200);
  return text.slice(start, end ? end.index : start + 200_000);
}

const RESULTS_HEADING =
  /^[^\n]{0,60}(results of operations|operating results|segment (operating )?(performance|results)|comparison of )[^\n]{0,40}$/gim;
const RESULTS_END = /^[^\n]{0,40}(liquidity|capital resources|financial condition)[^\n]{0,40}$/gim;

function mdnaLines(section: string): string[] {
  return section
    .split("\n")
    .filter((line) => isNarrative(line) && wordCount(line) >= 8 && !SAFE_HARBOR_TEXT.test(line));
}

/** Results-of-operations discussion (falls back to the whole MD&A when that part is under 200 words). */
export function mdnaText(fullText: string, form: string, budget = 1200): string {
  const mdna = mdnaSection(fullText, form);
  if (!mdna) return "";
  const heading = [...mdna.matchAll(RESULTS_HEADING)].find((m) => m.index > 200);
  let lines: string[] = [];
  if (heading) {
    const end = [...mdna.matchAll(RESULTS_END)].find((m) => m.index > heading.index + 200);
    lines = mdnaLines(mdna.slice(heading.index, end?.index));
  }
  if (wordCount(lines.join(" ")) < 200) lines = mdnaLines(mdna);
  return takeWords(lines, budget).join("\n");
}

export interface IndexDocument {
  type: string;
  description: string;
  url: string;
}

/** Rows of an EDGAR `{accession}-index.htm` document table. */
export function parseFilingIndex(html: string): IndexDocument[] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((row) => {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 5) return [];
    const href = cells[2].match(/href="([^"]+)"/i)?.[1];
    if (!href) return [];
    const path = href.replace(/^\/ix\?doc=/, "");
    return [
      {
        type: cellText(cells[3]).toUpperCase(),
        description: cellText(cells[1]),
        url: new URL(path, "https://www.sec.gov").toString(),
      },
    ];
  });
}

const EXHIBIT_PREFERENCE = ["EX-99.1", "EX-99.01", "EX-99"];

/** The press-release exhibit by TYPE column only: EX-99.1 > EX-99.01 > EX-99. */
export function pressReleaseExhibit(docs: IndexDocument[]): IndexDocument | null {
  for (const type of EXHIBIT_PREFERENCE) {
    const doc = docs.find((d) => d.type === type);
    if (doc) return doc;
  }
  return null;
}
