import type { Fundamentals, Valuation } from "./company-fundamentals";
/** Serializable contracts shared by the SEC server pipeline and terminal UI. */
export type ListedCompany = {
  ticker: string;
  name: string;
  cik: string;
  exchange: string;
};
export type FactSource = {
  tag: string;
  accession: string;
  filed: string;
  form: string;
  sourceUrl: string;
};
export type FinancialQuarter = {
  start: string;
  end: string;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  operatingMargin: number | null;
  filed: string;
  accession: string;
  sourceUrl: string;
  sources: Partial<
    Record<"revenue" | "operatingIncome" | "netIncome", FactSource>
  >;
};
export type ResearchSignal = {
  id: string;
  title: string;
  explanation: string;
  tone: "positive" | "negative" | "mixed" | "neutral";
  revenueGrowth: number | null;
  operatingIncomeGrowth: number | null;
  marginChangePp: number | null;
};
export type CompanyResearchLive = ListedCompany & {
  fetchedAt: string;
  latestFilingDate: string;
  latestFilingForm: string;
  periodEnd: string;
  quarters: FinancialQuarter[];
  context?: {industry:string; earningsRelease:{date:string;url:string}|null};
  fundamentals?: Fundamentals;
  valuation?: Valuation;
  signals: ResearchSignal[];
  caveats: string[];
  sourceUrl: string;
  stale: boolean;
  warnings: string[];
};
export type DiscoveryCoverage = {
  universeCount: number;
  candidateCount: number;
  scannedCount: number;
  source: string;
  asOf: string;
  description: string;
};
export type DiscoveryResponse = {
  companies: CompanyResearchLive[];
  nextCursor: string | null;
  fetchedAt: string;
  stale: boolean;
  warnings: string[];
  coverage: DiscoveryCoverage;
};
export type SearchResponse = {
  results: ListedCompany[];
  fetchedAt: string;
  stale: boolean;
  warnings: string[];
};
