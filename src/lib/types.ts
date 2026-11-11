export type MarketPeriod = "1D" | "1W";

export type DataSourceKind = "alpha-vantage" | "massive" | "sample";

export interface SignalFactor {
  label: string;
  value: number;
}

export interface StockMover {
  symbol: string;
  name: string;
  exchange: string;
  sector: string | null;
  price: number;
  baselinePrice: number;
  changeAmount: number;
  changePercent: number;
  volume: number;
  relativeVolume: number | null;
  marketCap: number | null;
  rank: number;
}

export interface ResearchIdea {
  stock: StockMover;
  score: number;
  label: "Strong signal" | "Positive signal" | "Watch closely";
  horizon: "Short-term momentum" | "Momentum watch";
  factors: SignalFactor[];
  thesis: string[];
  risks: string[];
}

export interface MarketSnapshot {
  period: MarketPeriod;
  fetchedAt: string;
  marketDate: string;
  sourceName: string;
  sourceUrl: string;
  sourceKind: DataSourceKind;
  coverage: "headline" | "full";
  universeCount: number;
  eligibleCount: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  medianMove: number;
  strongestSector: string | null;
  winners: StockMover[];
  losers: StockMover[];
  ideas: ResearchIdea[];
  isFallback: boolean;
  supportsWeekly: boolean;
  notice: string;
}
