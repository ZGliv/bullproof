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

interface Cell {
  text: string;
  /** First and one-past-last grid column, counting colspans. */
  start: number;
  end: number;
}

/** Non-empty visible cells of each row, placed on the column grid so values can be matched to headers. */
function tableRows(table: string): Cell[][] {
  return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) => {
      const cells: Cell[] = [];
      let column = 0;
      for (const m of row[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
        if (/display\s*:\s*none/i.test(m[1])) continue;
        const span = Number(m[1].match(/colspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1) || 1;
        cells.push({ text: cellText(m[2]), start: column, end: column + span });
        column += span;
      }
      return cells.filter((cell) => cell.text);
    })
    .filter((row) => row.length);
}

/** "$", "10,250", "27%", "$18.0 billion - $18.2 billion": a cell that is or starts with a figure. */
const VALUE_CELL = /^([\s$()%,.\-—–‒−*0-9]+$|[$€£(+\-−~]*\s?\.?\d)/;

/** A row label followed by at least one cell with a figure: "Net sales (cc) | Increase 3.0% to 3.75%". */
function isLabelledFigures(row: Cell[]): boolean {
  return row.length > 1 && !VALUE_CELL.test(row[0].text) && row.slice(1).some((cell) => /\d/.test(cell.text));
}

/** Guidance tables are small; a financial statement runs to dozens of rows. */
const MAX_OUTLOOK_ROWS = 12;
const OUTLOOK_WORD = /\b(outlook|guidance)\b/i;
const OUTLOOK_LEAD_IN = /\bexpect(s|ed)?\b[^.]{0,160}\b(as follows|the following)\b/i;

/** The last two text blocks before a table: its heading and lead-in sentence, if any. */
function leadIn(htmlBefore: string): string[] {
  return decodeEntities(
    htmlBefore
      .replace(/<table\b[\s\S]*?<\/table>/gi, "\n")
      .replace(new RegExp(`</?(${BLOCK_TAGS}|br)\\b[^>]*>`, "gi"), "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-2);
}

/** A company's own outlook table: few rows, under an Outlook/Guidance heading or "expected to be as follows". */
function isOutlookTable(rows: Cell[][], htmlBefore: string): boolean {
  if (rows.length > MAX_OUTLOOK_ROWS || !rows.some(isLabelledFigures)) return false;
  // A quote above a results table can say "beat our guidance"; only a heading-sized block counts.
  const lead = leadIn(htmlBefore);
  const own = rows.flat().map((cell) => cell.text).join(" ");
  return (
    lead.some((block) => (block.length <= 100 && OUTLOOK_WORD.test(block)) || OUTLOOK_LEAD_IN.test(block)) ||
    OUTLOOK_WORD.test(own)
  );
}

/** "$ 10,250 +/- $ 500" -> "$10,250 +/- $500". */
function joinFigures(cells: Cell[]): string {
  return cells
    .map((cell) => cell.text)
    .join(" ")
    .replace(/([$(]) (?=[\d.$(])/g, "$1")
    .replace(/ (?=[%)])/g, "");
}

/**
 * One "Label: value" line per row, e.g. "Total revenue: $10,250 +/- $500". When the table has
 * several value columns each value carries its (stacked) headers:
 * "Operating Income: GAAP FY27 $7,408 to $7,490; GAAP Change 26% to 27%; Non-GAAP FY27 ...".
 * A single column header and the unit caption become one title line; other rows stay as text.
 */
function outlookTableText(rows: Cell[][]): string {
  const labelStart = Math.min(...rows.map((row) => row[0].start));
  const labelled = rows.filter((row) => row[0].start === labelStart && isLabelledFigures(row));
  // "Consolidated metric | Q3 FY27" above "Net sales (cc) | Increase 3.0% to 3.75%" is a header row.
  const first = rows.find((row) => row.length > 1 && row[0].start === labelStart && !VALUE_CELL.test(row[0].text));
  const headerRow =
    first && labelled.length && !first.slice(1).some((cell) => VALUE_CELL.test(cell.text)) && first !== labelled.at(-1)
      ? first
      : null;
  const dataRows = labelled.filter((row) => row !== headerRow);
  const above = rows.slice(0, rows.indexOf(dataRows[0]));
  const valueStart = Math.min(...dataRows.map((row) => row[1].start));
  const headerRows = above.filter((row) => row[0].start >= valueStart);
  const headers = [...headerRows, ...(headerRow ? [headerRow.slice(1)] : [])];
  const headerFor = (cell: Cell) =>
    headers
      .map((row) => row.find((h) => h.start <= cell.start && cell.start < h.end)?.text)
      .filter(Boolean)
      .join(" ");
  const distinct = new Set(dataRows.flatMap((row) => row.slice(1).map(headerFor)));
  const perValue = distinct.size > 1;
  const captions = above.filter((row) => row.length === 1 && UNIT_CAPTION.test(row[0].text));
  const title = [...(perValue ? [] : distinct), ...captions.map((row) => row[0].text)]
    .filter(Boolean)
    .join(" ")
    .replace(/^\((.*)\)$/, "$1");

  const dataLine = (row: Cell[]): string => {
    const values = row.slice(1);
    if (!perValue) return `${row[0].text}: ${joinFigures(values)}`;
    const groups: { header: string; cells: Cell[] }[] = [];
    for (const cell of values) {
      const header = headerFor(cell) || (groups.at(-1)?.header ?? "");
      if (groups.at(-1)?.header === header) groups.at(-1)?.cells.push(cell);
      else groups.push({ header, cells: [cell] });
    }
    const parts = groups.map(({ header, cells }) => `${header ? `${header} ` : ""}${joinFigures(cells)}`);
    return `${row[0].text}: ${parts.join("; ")}`;
  };

  const lines: string[] = [];
  for (const row of rows) {
    if (row === dataRows[0] && title) lines.push(title);
    if (dataRows.includes(row)) lines.push(dataLine(row));
    else if (row === headerRow) lines.push(row[0].text);
    else if (!headerRows.includes(row) && !captions.includes(row)) lines.push(row.map((cell) => cell.text).join(" "));
  }
  return `\n${lines.join("\n")}\n`;
}

/**
 * Financial statement tables are dropped; outlook tables become "Label: value" lines;
 * layout tables (bullets, two-column text) become lines.
 */
function tableToText(table: string, offset: number, html: string): string {
  const grid = tableRows(table);
  if (isOutlookTable(grid, html.slice(Math.max(0, offset - 4000), offset))) return outlookTableText(grid);
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

/** A row of a kept outlook table, "Total revenue: $10,250 +/- $500": a short label, a colon, then figures. */
const FIGURE_ROW = /^\p{L}[^:]{1,80}: .*\d/u;

function isFigureRow(line: string): boolean {
  return FIGURE_ROW.test(line) && !FOOTNOTE.test(line) && !EMAIL.test(line);
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

/** Short line without closing punctuation; "About HP Inc." still counts. */
function isHeading(line: string): boolean {
  return line.length < 120 && (!/[.!?]$/.test(line) || /\b(inc|corp|co|ltd|plc|n\.v|s\.a|l\.p)\.$/i.test(line));
}

/** "This press release contains forward-looking statements", optionally after a "Forward-Looking Statements:" label. */
const SAFE_HARBOR_PARAGRAPH = new RegExp(
  [
    "private securities litigation reform act",
    "^(forward-looking statements?\\s*[:.\\u2014\\u2013-]\\s*)?(this|the) (press|news|earnings) release " +
      "(and [^.]{0,60})?(contains?|includes?|may contain)[^.]{0,80}forward-looking",
  ].join("|"),
  "i",
);

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

const HEADLINE = /\b(reports?|announces?|delivers?|posts?|results|earnings|quarter|fiscal)\b/i;

/** Drops what sits above the headline: contact tables, dates, "furnished herewith" notes. */
function fromHeadline(lines: string[]): string[] {
  const at = lines.slice(0, 8).findIndex((line) => HEADLINE.test(line));
  return at > 0 ? lines.slice(at) : lines;
}

/**
 * Headline + first ~1,500 words of narrative, stopping at boilerplate headings,
 * plus up to 400 words of outlook/guidance lines that fell outside that budget.
 */
export function pressReleaseText(fullText: string, budget = 1500, outlookBudget = 400): PressReleaseText {
  const lines = fromHeadline(fullText.split("\n").filter((line) => !PR_NOISE.test(line) && !CONTACT_LINE.test(line)));
  const kept = (line: string) => isNarrative(line) || isFigureRow(line);
  const body = lines.slice(0, firstIndex(lines, isTail)).filter(kept);
  const main = takeWords(body, budget);
  // Full source lines, so a line takeWords cut short is not added again in full.
  const included = new Set(body.slice(0, main.length));

  // An outlook section can sit after the call details, but never inside the legal tail.
  const region = lines
    .slice(0, firstIndex(lines, isLegalTail))
    .filter((line) => kept(line) && !SAFE_HARBOR_TEXT.test(line));
  const outlook: string[] = [];
  const heading = region.findIndex((line) => line.length < 80 && OUTLOOK_HEADING.test(line));
  if (heading >= 0) {
    for (let i = heading; i < Math.min(region.length, heading + 25); i++) {
      if (i > heading && isTail(region[i])) break;
      if (!included.has(region[i])) outlook.push(region[i]);
    }
  }
  for (const line of body) {
    if (included.has(line) || outlook.includes(line) || SAFE_HARBOR_TEXT.test(line)) continue;
    if (GUIDANCE_WORDS.test(line) && wordCount(line) > 12) outlook.push(line);
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

const STATEMENT_CAPTION = /statements? of (consolidated )?(income|operations|earnings)|balance sheets?/i;

/**
 * A pre-announcement ("Intuitive Announces Preliminary Fourth Quarter ... Results") made ahead of
 * the full release: the headline says preliminary and the exhibit carries no financial statements.
 */
export function isPreliminaryRelease(exhibitHtml: string): boolean {
  const headline = pressReleaseText(htmlToText(exhibitHtml)).text.split("\n").slice(0, 2).join(" ");
  return /\bpreliminary\b/i.test(headline) && !STATEMENT_CAPTION.test(cellText(exhibitHtml));
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
/** The running page header "MANAGEMENT'S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION ... (Continued)". */
const RUNNING_HEADER = /discussion and analysis/i;

function isResultsEnd(match: RegExpMatchArray): boolean {
  return !RUNNING_HEADER.test(match[0]) && !/[.;,]$/.test(match[0].trim());
}

function mdnaLines(section: string): string[] {
  return section
    .split("\n")
    .filter(
      (line) =>
        isNarrative(line) && wordCount(line) >= 8 && !SAFE_HARBOR_TEXT.test(line) && !RUNNING_HEADER.test(line),
    );
}

/** An MD&A that only points elsewhere, e.g. "can be found in the 2025 Annual Report to Shareholders". */
const CROSS_REFERENCE = /incorporated (into [^.]{0,30})?(herein )?by reference|can be found in|annual report to (share|stock)holders|exhibit 13/i;

/**
 * Results-of-operations discussion (falls back to the whole MD&A when that part is under 200 words).
 * "" when there is no MD&A or it only refers the reader to the annual report.
 */
export function mdnaText(fullText: string, form: string, budget = 1200): string {
  const mdna = mdnaSection(fullText, form);
  if (!mdna) return "";
  const heading = [...mdna.matchAll(RESULTS_HEADING)].find((m) => m.index > 200);
  let lines: string[] = [];
  if (heading) {
    const end = [...mdna.matchAll(RESULTS_END)].find((m) => m.index > heading.index + 200 && isResultsEnd(m));
    lines = mdnaLines(mdna.slice(heading.index, end?.index));
  }
  if (wordCount(lines.join(" ")) < 200) lines = mdnaLines(mdna);
  const text = takeWords(lines, budget).join("\n");
  if (wordCount(text) < 200 && CROSS_REFERENCE.test(mdna)) return "";
  return text;
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
