import type { MarketPeriod, MarketSnapshot, StockMover } from "@/lib/types";

const sampleRows: Array<
  Pick<StockMover, "symbol" | "name" | "price" | "changePercent" | "volume">
> = [
  { symbol: "DEMO1", name: "Illustrative data", price: 42.18, changePercent: 12.4, volume: 8_420_000 },
  { symbol: "DEMO2", name: "Illustrative data", price: 18.72, changePercent: 9.1, volume: 4_110_000 },
  { symbol: "DEMO3", name: "Illustrative data", price: 86.05, changePercent: 7.8, volume: 2_780_000 },
  { symbol: "DEMO4", name: "Illustrative data", price: 27.39, changePercent: 6.6, volume: 6_220_000 },
  { symbol: "DEMO5", name: "Illustrative data", price: 31.44, changePercent: -6.1, volume: 3_540_000 },
  { symbol: "DEMO6", name: "Illustrative data", price: 64.08, changePercent: -7.4, volume: 5_920_000 },
  { symbol: "DEMO7", name: "Illustrative data", price: 12.95, changePercent: -9.7, volume: 7_310_000 },
  { symbol: "DEMO8", name: "Illustrative data", price: 51.22, changePercent: -11.2, volume: 9_060_000 },
];

function toMover(row: (typeof sampleRows)[number], rank: number): StockMover {
  const baselinePrice = row.price / (1 + row.changePercent / 100);

  return {
    ...row,
    baselinePrice,
    changeAmount: row.price - baselinePrice,
    exchange: "SAMPLE",
    sector: null,
    relativeVolume: null,
    marketCap: null,
    rank,
  };
}

export function getFallbackSnapshot(period: MarketPeriod): MarketSnapshot {
  const movers = sampleRows.map(toMover);
  const winners = movers
    .filter((stock) => stock.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .map((stock, index) => ({ ...stock, rank: index + 1 }));
  const losers = movers
    .filter((stock) => stock.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .map((stock, index) => ({ ...stock, rank: index + 1 }));

  return {
    period,
    fetchedAt: new Date().toISOString(),
    marketDate: "Illustrative sample — not current market data",
    sourceName: "Sample dataset",
    sourceUrl: "#methodology",
    sourceKind: "sample",
    coverage: "headline",
    universeCount: movers.length,
    eligibleCount: movers.length,
    advancers: winners.length,
    decliners: losers.length,
    unchanged: 0,
    medianMove: 8.45,
    strongestSector: null,
    winners,
    losers,
    ideas: [],
    isFallback: true,
    supportsWeekly: false,
    notice: "The live feed is temporarily unavailable. Values below are clearly labeled illustrative samples.",
  };
}
