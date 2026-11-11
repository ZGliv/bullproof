/** Verified against issuer earnings releases on 2026-10-27. Static reported data, not a live feed. */
export type ResearchMetric = {
  id: string;
  label: string;
  prior: number;
  current: number;
  unit: "USDm" | "percent";
  basis: "GAAP" | "non-GAAP" | "operational";
  /** Index into this company's sources, not discovery.ts sources. */
  source: number;
  priorSource?: number;
  /** Overrides the company quarter for explicitly year-to-date cash comparisons. */
  period?: string;
  priorPeriod?: string;
  note?: string;
};
export type ResearchCompany = {
  period: string;
  priorPeriod: string;
  periodEnd: string;
  priorPeriodEnd: string;
  verifiedAt: string;
  metrics: ResearchMetric[];
  segments: ResearchMetric[];
  sources: { title: string; url: string; publishedAt: string; section: string }[];
  caveats: string[];
};

export const researchData: Record<string, ResearchCompany> = {
  gxo: {
    period: "Q2 2026", priorPeriod: "Q2 2025",
    periodEnd: "2026-06-30", priorPeriodEnd: "2025-06-30", verifiedAt: "2026-10-27",
    metrics: [
      { id: "revenue", label: "Revenue", prior: 3299, current: 3441, unit: "USDm", basis: "GAAP", source: 0 },
      { id: "operating-income", label: "Operating income", prior: 89, current: 77, unit: "USDm", basis: "GAAP", source: 0 },
      { id: "net-income", label: "Consolidated net income", prior: 28, current: 27, unit: "USDm", basis: "GAAP", source: 0, note: "Includes noncontrolling interests; net income attributable to GXO is a different measure." },
      { id: "operating-margin", label: "Operating margin", prior: 2.7, current: 2.2, unit: "percent", basis: "GAAP", source: 0 },
      { id: "adjusted-ebitda", label: "Adjusted EBITDA", prior: 212, current: 219, unit: "USDm", basis: "non-GAAP", source: 0 },
      { id: "adjusted-ebitda-margin", label: "Adjusted EBITDA margin", prior: 6.4, current: 6.4, unit: "percent", basis: "non-GAAP", source: 0, note: "EBITDA excludes depreciation and amortization. This is not adjusted operating margin." },
      { id: "operating-cash-flow", label: "Operating cash flow", prior: 3, current: 76, unit: "USDm", basis: "GAAP", source: 0, note: "Quarter-only values from the free-cash-flow reconciliation." },
      { id: "free-cash-flow", label: "Free cash flow", prior: -43, current: 12, unit: "USDm", basis: "non-GAAP", source: 0, note: "Operating cash less capital expenditures plus property-sale proceeds. Prior period is negative: show dollar change, not percentage growth." },
      { id: "business-wins", label: "Signed new business wins", prior: 307, current: 410, unit: "USDm", basis: "operational", source: 0, priorSource: 1, note: "Prior value comes directly from the 2025 release, not from reversing rounded growth. Wins are not recognized revenue or cash." },
    ],
    segments: [],
    sources: [
      { title: "GXO Q2 2026 results", url: "https://investors.gxo.com/news-releases/news-release-details/gxo-reports-second-quarter-2026-results", publishedAt: "2026-08-04", section: "Statements of operations; adjusted EBITDA reconciliation; operating cash flow / free cash flow reconciliation; business wins" },
      { title: "GXO Q2 2025 results", url: "https://investors.gxo.com/news-releases/news-release-details/gxo-reports-second-quarter-2025-results", publishedAt: "2025-08-05", section: "Business wins; Q2 cash-flow discussion" },
    ],
    caveats: [
      "Two matched quarters are a comparison, not a multi-year trend.",
      "The 2025 cash comparison includes working-capital investment and a one-time regulatory payment.",
      "No segment-sales dataset is asserted from this release. Signed wins have a different recognition basis from revenue.",
    ],
  },
  brunswick: {
    period: "Q2 2026", priorPeriod: "Q2 2025",
    periodEnd: "2026-07-04", priorPeriodEnd: "2025-06-28", verifiedAt: "2026-10-27",
    metrics: [
      { id: "revenue", label: "Net sales", prior: 1447, current: 1557.8, unit: "USDm", basis: "GAAP", source: 0 },
      { id: "operating-income", label: "Operating earnings", prior: 103.3, current: 129.4, unit: "USDm", basis: "GAAP", source: 0 },
      { id: "adjusted-operating-income", label: "Adjusted operating earnings", prior: 126, current: 150.1, unit: "USDm", basis: "non-GAAP", source: 0 },
      { id: "operating-margin", label: "Operating margin", prior: 7.1, current: 8.3, unit: "percent", basis: "GAAP", source: 0 },
      { id: "adjusted-operating-margin", label: "Adjusted operating margin", prior: 8.7, current: 9.6, unit: "percent", basis: "non-GAAP", source: 0, note: "Adjusted results still include tariff-refund benefits; adjusted does not mean free of all unusual benefits." },
      { id: "operating-cash-flow", label: "Operating cash flow · continuing operations", prior: 309.1, current: 251.5, unit: "USDm", basis: "GAAP", source: 0, period: "H1 2026 · six months ended July 4", priorPeriod: "H1 2025 · six months ended June 28", note: "Year-to-date, not Q2 alone. Excludes discontinued operations." },
      { id: "free-cash-flow", label: "Free cash flow", prior: 243.5, current: 160.7, unit: "USDm", basis: "non-GAAP", source: 0, period: "H1 2026 · six months ended July 4", priorPeriod: "H1 2025 · six months ended June 28", note: "Year-to-date. Company reconciliation includes continuing operating cash, capex, property-sale proceeds and FX effects." },
    ],
    segments: [
      { id: "propulsion", label: "Propulsion", prior: 598.2, current: 644, unit: "USDm", basis: "GAAP", source: 0 },
      { id: "engine-parts-accessories", label: "Engine Parts & Accessories", prior: 337.8, current: 367.9, unit: "USDm", basis: "GAAP", source: 0 },
      { id: "navico", label: "Navico Group", prior: 202.3, current: 215.8, unit: "USDm", basis: "GAAP", source: 0 },
      { id: "boat", label: "Boat", prior: 405.6, current: 424.4, unit: "USDm", basis: "GAAP", source: 0 },
    ],
    sources: [
      { title: "Brunswick Q2 2026 earnings release · Exhibit 99.1", url: "https://www.brunswick.com/investors/sec-filings/all-sec-filings/content/0000014930-26-000087/q22026exhibit99_1.htm", publishedAt: "2026-07-30", section: "Comparative statements of operations; quarterly segment information; six-month cash flows and free-cash-flow reconciliation" },
    ],
    caveats: [
      "Cash figures cover six months; sales, earnings and margins cover the quarter.",
      "Segment sales include intersegment activity: eliminations are −$96.9m in 2025 and −$94.3m in 2026. Do not portray these four rows as shares of consolidated sales.",
      "The periods end July 4, 2026 and June 28, 2025; preserve the company's fiscal-quarter labels.",
    ],
  },
  "mueller-water": {
    period: "Fiscal Q3 2026", priorPeriod: "Fiscal Q3 2025",
    periodEnd: "2026-06-30", priorPeriodEnd: "2025-06-30", verifiedAt: "2026-10-27",
    metrics: [
      { id: "revenue", label: "Net sales", prior: 380.3, current: 395.9, unit: "USDm", basis: "GAAP", source: 0 },
      { id: "operating-income", label: "Operating income", prior: 73.7, current: 80.6, unit: "USDm", basis: "GAAP", source: 0 },
      { id: "adjusted-operating-income", label: "Adjusted operating income", prior: 74.7, current: 94.9, unit: "USDm", basis: "non-GAAP", source: 0 },
      { id: "operating-margin", label: "Operating margin", prior: 19.4, current: 20.4, unit: "percent", basis: "GAAP", source: 0 },
      { id: "adjusted-operating-margin", label: "Adjusted operating margin", prior: 19.6, current: 24, unit: "percent", basis: "non-GAAP", source: 0, note: "Excludes strategic-reorganization charges and portfolio-optimization costs; tariff refunds remain a benefit." },
      { id: "operating-cash-flow", label: "Operating cash flow", prior: 135.8, current: 154.2, unit: "USDm", basis: "GAAP", source: 0, period: "9M FY2026 · ended June 30", priorPeriod: "9M FY2025 · ended June 30", note: "Nine-month cumulative cash, not fiscal Q3 alone." },
      { id: "free-cash-flow", label: "Free cash flow", prior: 103, current: 110.6, unit: "USDm", basis: "non-GAAP", source: 0, period: "9M FY2026 · ended June 30", priorPeriod: "9M FY2025 · ended June 30", note: "Nine-month operating cash less capital expenditures." },
    ],
    segments: [
      { id: "water-flow", label: "Water Flow Solutions", prior: 216.6, current: 215.3, unit: "USDm", basis: "GAAP", source: 0 },
      { id: "water-management", label: "Water Management Solutions", prior: 163.7, current: 180.6, unit: "USDm", basis: "GAAP", source: 0 },
    ],
    sources: [
      { title: "Mueller Water Products fiscal Q3 2026 results", url: "https://ir.muellerwaterproducts.com/press-releases/2026/08-05-2026-211118748", publishedAt: "2026-08-05", section: "Consolidated results; segment results; nine-month cash flows and non-GAAP reconciliations" },
    ],
    caveats: [
      "Fiscal Q3 ends June 30. Cash figures cover nine months and cannot be divided by quarter-only revenue for a cash margin.",
      "Higher prices offset slightly lower overall volume; sales growth is not equivalent to unit growth.",
      "Margin improvement includes tariff refunds. The release does not establish a refund-free normalized margin.",
    ],
  },
};
