import { scaleLinear } from "d3-scale";
import type {
  CompanyResearchLive,
  FinancialQuarter,
  ListedCompany,
} from "./live-research-types";
export type Lens = "all" | "growth" | "margin" | "pressure" | "unseen";
export type FinancialMetric =
  | "revenue"
  | "operatingIncome"
  | "netIncome"
  | "operatingMargin";
export const metricLabels: Record<FinancialMetric, string> = {
  revenue: "Revenue",
  operatingIncome: "Operating profit",
  netIncome: "Net income",
  operatingMargin: "Operating margin",
};
export const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
export function percent(v: number | null | undefined, suffix = "%") {
  return !isNumber(v)
    ? "—"
    : `${v >= 0.05 ? "+" : ""}${(Math.abs(v) < 0.05 ? 0 : v).toFixed(1)}${suffix}`;
}
export function money(v: number | null | undefined) {
  return !isNumber(v)
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(v);
}
export function amount(v: number | null | undefined, metric: FinancialMetric) {
  return metric === "operatingMargin"
    ? isNumber(v)
      ? `${v.toFixed(1)}%`
      : "—"
    : money(v);
}
export function tone(v: number | null | undefined) {
  return !isNumber(v) || Math.abs(v) < 0.05
    ? ""
    : v < 0
      ? "negative"
      : "positive";
}
export function fullDate(s: string) {
  const d = new Date(s.length === 10 ? s + "T12:00:00Z" : s);
  return Number.isNaN(d.valueOf())
    ? s
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(d);
}
export function checkedAt(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.valueOf())
    ? "Unknown"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(d);
}
export function displayName(c: ListedCompany) {
  return c.name === c.name.toUpperCase()
    ? c.name.toLowerCase().replace(/\b\w/g, (v) => v.toUpperCase())
    : c.name;
}
export function symbol(c: ListedCompany) {
  const ex = c.exchange.toUpperCase();
  if (!ex) return c.ticker.replace("-", ".");
  return `${ex === "NYSE AMERICAN" || ex === "NYSE ARCA" ? "AMEX" : ex}:${c.ticker.replace("-", ".")}`;
}
export function priorQuarter(quarters: FinancialQuarter[], end?: string) {
  const q = quarters.find((p) => p.end === end) ?? quarters.at(-1);
  if (!q) return undefined;
  return quarters.find((p) => {
    const a = (Date.parse(q.end) - Date.parse(p.end)) / 86400000,
      b = (Date.parse(q.start) - Date.parse(p.start)) / 86400000;
    return a >= 350 && a <= 380 && b >= 350 && b <= 380 && Math.abs(a - b) <= 7;
  });
}
export function matches(c: CompanyResearchLive, lens: Lens, seen: string[]) {
  const s = c.signals[0];
  return (
    lens === "all" ||
    (lens === "unseen" && !seen.includes(c.ticker)) ||
    (lens === "growth" &&
      isNumber(s?.revenueGrowth) &&
      s.revenueGrowth >= 10) ||
    (lens === "margin" &&
      isNumber(s?.marginChangePp) &&
      s.marginChangePp >= 1) ||
    (lens === "pressure" &&
      [s?.revenueGrowth, s?.operatingIncomeGrowth, s?.marginChangePp].some(
        (v) => isNumber(v) && v < -0.05,
      ))
  );
}
export function chartPoint(c: CompanyResearchLive) {
  const s = c.signals[0];
  return isNumber(s?.revenueGrowth) && isNumber(s?.marginChangePp)
    ? { company: c, x: s.revenueGrowth, y: s.marginChangePp }
    : null;
}
export function numericDomain(
  values: (number | null | undefined)[],
  minimumSpan = 1,
): [number, number] {
  const valid = values.filter(isNumber);
  let min = Math.min(0, ...valid),
    max = Math.max(0, ...valid);
  const span = Math.max(max - min, minimumSpan);
  if (max === min) {
    min = -span / 2;
    max = span / 2;
  } else {
    min -= span * 0.08;
    max += span * 0.08;
  }
  const d = scaleLinear().domain([min, max]).nice(5).domain();
  return [d[0], d[1]];
}
export function headline(c: CompanyResearchLive) {
  const s = c.signals[0],
    q = c.quarters.at(-1);
  if (!s) return "A company worth understanding.";
  if (s.id === "operating-turnaround") return s.title;
  if (
    isNumber(q?.operatingIncome) &&
    q.operatingIncome < 0 &&
    isNumber(s.marginChangePp) &&
    s.marginChangePp > 1
  )
    return "The operating loss margin improved.";
  if (
    isNumber(s.revenueGrowth) &&
    s.revenueGrowth > 0 &&
    isNumber(s.operatingIncomeGrowth) &&
    s.operatingIncomeGrowth < 0
  )
    return "Sales rose. Profit didn’t.";
  if (isNumber(s.marginChangePp) && s.marginChangePp >= 1)
    return "More profit from every dollar.";
  if (isNumber(s.revenueGrowth) && s.revenueGrowth < 0)
    return "A slowdown worth unpacking.";
  if (isNumber(s.revenueGrowth) && s.revenueGrowth >= 10)
    return "Growth worth a closer look.";
  return s.title;
}
export function explanation(c: CompanyResearchLive) {
  const s = c.signals[0],
    q = c.quarters.at(-1);
  if (!s)
    return "Open the source filings to examine the available financial history.";
  const parts = [];
  if (isNumber(s.revenueGrowth))
    parts.push(
      `Sales ${Math.abs(s.revenueGrowth) < 0.05 ? "were essentially flat" : `${s.revenueGrowth > 0 ? "grew" : "fell"} ${Math.abs(s.revenueGrowth).toFixed(1)}%`} year over year.`,
    );
  if (isNumber(s.operatingIncomeGrowth))
    parts.push(
      `Operating profit ${s.operatingIncomeGrowth >= 0 ? "rose" : "fell"} ${Math.abs(s.operatingIncomeGrowth).toFixed(1)}%.`,
    );
  else if (isNumber(q?.operatingIncome) && q.operatingIncome < 0)
    parts.push(
      `The latest quarter reported an operating loss of ${money(Math.abs(q.operatingIncome))}.`,
    );
  if (!parts.length)
    parts.push(
      "Comparable year-over-year growth is unavailable. The reported quarters remain available below.",
    );
  return parts.join(" ");
}
export function researchQuestion(c: CompanyResearchLive) {
  const s = c.signals[0];
  if (!s)
    return "Which changes in demand, costs, or business mix explain the quarter? Start with the original filing.";
  if (isNumber(s.marginChangePp) && s.marginChangePp < -0.05)
    return "Did costs, product mix, or a one-off charge drive margin pressure? Check management’s discussion before treating it as a trend.";
  if (isNumber(s.marginChangePp) && s.marginChangePp >= 1)
    return "Is the margin gain coming from pricing, business mix, or lower costs—and can it last? Compare management’s explanation with the reported numbers.";
  return "How much of the sales change was organic, and how much came from acquisitions, portfolio changes, or currency? Check the revenue discussion before extrapolating.";
}
export function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  const safe = typeof v === "string" && /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function researchCsv(companies: CompanyResearchLive[]) {
  const rows: unknown[][] = [
    [
      "Ticker",
      "Company",
      "Quarter end",
      "Revenue USD",
      "Operating income USD",
      "Operating margin %",
      "Revenue YoY %",
      "Margin change pp",
      "Fetched at",
      "Source filing",
    ],
  ];
  for (const c of companies) {
    const q = c.quarters.at(-1),
      s = c.signals[0];
    rows.push([
      c.ticker,
      c.name,
      q?.end,
      q?.revenue,
      q?.operatingIncome,
      q?.operatingMargin,
      s?.revenueGrowth,
      s?.marginChangePp,
      c.fetchedAt,
      c.sourceUrl,
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
