import { describe, expect, it } from "vitest";
import {
  buildSnapshotFromAlpha,
  normalizeAlphaMover,
  parsePercent,
  rankResearchIdeas,
} from "@/lib/market-data";

describe("market-data normalization", () => {
  it("parses provider percentages safely", () => {
    expect(parsePercent("12.345%")).toBeCloseTo(12.345);
    expect(parsePercent("-8.4%")).toBeCloseTo(-8.4);
    expect(parsePercent("not-a-number")).toBe(0);
  });

  it("derives the comparison close from Alpha Vantage rows", () => {
    const stock = normalizeAlphaMover({
      ticker: "TEST",
      price: "12.50",
      change_amount: "2.50",
      change_percentage: "25.0%",
      volume: "250000",
    });

    expect(stock.symbol).toBe("TEST");
    expect(stock.baselinePrice).toBe(10);
    expect(stock.changePercent).toBe(25);
    expect(stock.volume).toBe(250_000);
  });
});

describe("headline snapshot", () => {
  const snapshot = buildSnapshotFromAlpha({
    last_updated: "2026-08-07 16:15:00 US/Eastern",
    top_gainers: [
      {
        ticker: "GOOD1",
        price: "12",
        change_amount: "3",
        change_percentage: "33.333%",
        volume: "2000000",
      },
      {
        ticker: "GOOD2",
        price: "22",
        change_amount: "2",
        change_percentage: "10%",
        volume: "800000",
      },
      {
        ticker: "THIN",
        price: "15",
        change_amount: "4",
        change_percentage: "36%",
        volume: "1000",
      },
      {
        ticker: "DEMOW",
        price: "6",
        change_amount: "2",
        change_percentage: "50%",
        volume: "900000",
      },
    ],
    top_losers: [
      {
        ticker: "LOSS1",
        price: "8",
        change_amount: "-2",
        change_percentage: "-20%",
        volume: "1000000",
      },
    ],
    most_actively_traded: [
      {
        ticker: "GOOD1",
        price: "12",
        change_amount: "3",
        change_percentage: "33.333%",
        volume: "2000000",
      },
      {
        ticker: "FLAT",
        price: "30",
        change_amount: "0",
        change_percentage: "0%",
        volume: "500000",
      },
    ],
  });

  it("deduplicates, applies the liquidity screen, and ranks both sides", () => {
    expect(snapshot.universeCount).toBe(6);
    expect(snapshot.eligibleCount).toBe(4);
    expect(snapshot.winners.map((stock) => stock.symbol)).toEqual(["GOOD1", "GOOD2"]);
    expect(snapshot.losers.map((stock) => stock.symbol)).toEqual(["LOSS1"]);
    expect(snapshot.unchanged).toBe(1);
    expect(snapshot.marketDate).toContain("ET");
  });

  it("creates explainable research signals from eligible winners", () => {
    const ideas = rankResearchIdeas(snapshot.winners, "1D");

    expect(ideas).toHaveLength(2);
    expect(ideas[0].stock.symbol).toBe("GOOD1");
    expect(ideas[0].score).toBeGreaterThanOrEqual(0);
    expect(ideas[0].score).toBeLessThanOrEqual(100);
    expect(ideas[0].factors.map((factor) => factor.label)).toEqual([
      "Momentum",
      "Turnover",
      "Liquidity",
    ]);
    expect(ideas[0].risks.length).toBeGreaterThan(0);
  });
});
