import { describe, expect, it } from "vitest";
import type { EarningsCall, LegResult, VoidReason } from "./types";
import { buildRecord, seasonOf, wilson } from "./record";

function baseCall(ticker: string, session: string): EarningsCall {
  return {
    id: `${session}:${ticker}`,
    ticker,
    name: ticker,
    session,
    reportDate: session,
    timing: "bmo",
    publishedAt: `${session}T01:30:00.000Z`,
    hash: "0".repeat(64),
    marketCap: null,
    refClose: 100,
    refCloseDate: session,
    line: { value: 1.9, reactions: [] },
    direction: "down",
    overUnder: "under",
    confidence: 3,
    thesis: "",
    wrongIf: "",
    bull: { point: "", quote: "", source: "press_release", form: "8-K EX-99.1", filedAt: "", url: "" },
    bear: { point: "", quote: "", source: "mdna", form: "10-Q", filedAt: "", url: "" },
    model: "@cf/google/gemma-4-26b-a4b-it",
    promptVersion: "calls-v1",
    status: "locked",
    grade: null,
    voidReason: null,
  };
}

function graded(
  ticker: string,
  session: string,
  movePct: number,
  direction: LegResult,
  overUnder: LegResult | null,
  lineValue: number | null = 1.9,
): EarningsCall {
  const call = baseCall(ticker, session);
  return {
    ...call,
    line: { value: lineValue, reactions: [] },
    overUnder: overUnder === null ? null : "under",
    status: "graded",
    grade: {
      gradedAt: `${session}T22:45:00.000Z`,
      releaseAt: null,
      releaseSource: "8-K",
      baseDate: session,
      baseClose: 100,
      resultDate: session,
      resultClose: 100 + movePct,
      movePct,
      direction,
      overUnder,
    },
  };
}

function voided(ticker: string, session: string, reason: VoidReason, withOverUnder = true): EarningsCall {
  return { ...baseCall(ticker, session), overUnder: withOverUnder ? "over" : null, status: "void", voidReason: reason };
}

describe("seasonOf", () => {
  it("names the calendar quarter of a session", () => {
    expect(seasonOf("2026-11-12")).toBe("2026 Q4");
    expect(seasonOf("2026-03-31")).toBe("2026 Q1");
    expect(seasonOf("2026-04-01")).toBe("2026 Q2");
    expect(seasonOf("2026-09-30")).toBe("2026 Q3");
  });
});

describe("wilson", () => {
  it("matches the 18–12 at N=30 example (42–75%)", () => {
    expect(wilson(18, 30)).toEqual([42.3, 75.4]);
  });

  it("stays inside 0–100 at the extremes", () => {
    expect(wilson(0, 30)).toEqual([0, 11.4]);
    expect(wilson(30, 30)).toEqual([88.6, 100]);
    expect(wilson(0, 0)).toEqual([0, 100]);
  });
});

describe("buildRecord", () => {
  // AAPL 2026-11-03: -1.90% on a 1.9 line, called down/under → win, push.
  const calls: EarningsCall[] = [
    graded("AAPL", "2026-11-03", -1.9, "win", "push"),
    graded("NVDA", "2026-11-06", 2.77, "loss", "loss"),
    graded("WMT", "2026-11-19", 0, "push", "win"),
    graded("TGT", "2026-11-18", -6.4, "win", null, null),
    voided("CRM", "2026-11-20", "intraday-release"),
    voided("LSTR", "2026-11-23", "no-release", false),
    { ...baseCall("HD", "2026-11-24"), status: "locked" },
    graded("MDLZ", "2026-09-30", 3.85, "loss", "win"),
  ];

  it("tallies both legs over the season's graded calls and counts voids", () => {
    const record = buildRecord(calls, "2026 Q4");
    expect(record.season).toBe("2026 Q4");
    expect(record.direction).toMatchObject({ win: 2, loss: 1, push: 1, n: 3, pct: null, interval: null });
    expect(record.overUnder).toMatchObject({ win: 1, loss: 1, push: 1, n: 2, pct: null, interval: null });
    expect(record.voids).toBe(2);
  });

  it("scores the naive bases on the same graded calls", () => {
    const record = buildRecord(calls, "2026 Q4");
    // Always down: AAPL −1.90 win, NVDA +2.77 loss, WMT 0.00 push, TGT −6.40 win.
    expect(record.direction.base).toEqual({ label: "Always down", win: 2, loss: 1, push: 1 });
    // Always over (O/U calls only): AAPL 1.90 on 1.9 push, NVDA 2.77 > 1.9 win, WMT 0 < 1.9 loss.
    expect(record.overUnder.base).toEqual({ label: "Always over", win: 1, loss: 1, push: 1 });
  });

  it("lists the last marks newest first, voids included", () => {
    const record = buildRecord(calls, "2026 Q4");
    expect(record.last).toEqual([
      { id: "2026-11-23:LSTR", ticker: "LSTR", session: "2026-11-23", direction: "void", overUnder: null },
      { id: "2026-11-20:CRM", ticker: "CRM", session: "2026-11-20", direction: "void", overUnder: "void" },
      { id: "2026-11-19:WMT", ticker: "WMT", session: "2026-11-19", direction: "push", overUnder: "win" },
      { id: "2026-11-18:TGT", ticker: "TGT", session: "2026-11-18", direction: "win", overUnder: null },
      { id: "2026-11-06:NVDA", ticker: "NVDA", session: "2026-11-06", direction: "loss", overUnder: "loss" },
      { id: "2026-11-03:AAPL", ticker: "AAPL", session: "2026-11-03", direction: "win", overUnder: "push" },
    ]);
  });

  it("keeps other seasons apart", () => {
    const q3 = buildRecord(calls, "2026 Q3");
    expect(q3.direction).toMatchObject({ win: 0, loss: 1, push: 0, n: 1 });
    expect(q3.last.map((m) => m.ticker)).toEqual(["MDLZ"]);
    expect(buildRecord(calls, "2025 Q4").last).toEqual([]);
  });

  it("shows a percentage and Wilson interval from n = 30, and drops the interval at n = 100", () => {
    const series = (wins: number, losses: number, pushes = 0) => [
      ...Array.from({ length: wins }, (_, i) => graded(`W${i}`, "2026-10-01", -1, "win", "win")),
      ...Array.from({ length: losses }, (_, i) => graded(`L${i}`, "2026-10-02", 1, "loss", "loss")),
      ...Array.from({ length: pushes }, (_, i) => graded(`P${i}`, "2026-10-03", 0, "push", "push")),
    ];
    const at29 = buildRecord(series(17, 12, 5), "2026 Q4").direction;
    expect(at29).toMatchObject({ n: 29, pct: null, interval: null });
    const at30 = buildRecord(series(18, 12), "2026 Q4").direction;
    expect(at30).toMatchObject({ n: 30, pct: 60, interval: [42.3, 75.4] });
    const at99 = buildRecord(series(55, 44), "2026 Q4").direction;
    expect(at99.interval).not.toBeNull();
    const at100 = buildRecord(series(55, 45), "2026 Q4").direction;
    expect(at100).toMatchObject({ n: 100, pct: 55, interval: null });
    expect(buildRecord(series(25, 0), "2026 Q4").last).toHaveLength(20);
  });
});
