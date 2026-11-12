import { describe, expect, it } from "vitest";
import type { EarningsCall } from "@/lib/earnings/types";
import { callHref, callTitle, groupByReport, latestLock, lockLabel } from "./format";

// Real slate rows from the first publish run (local D1, 2026-11-11 evening) plus one later night.
type Row = Pick<EarningsCall, "id" | "reportDate" | "timing" | "publishedAt">;
const row = (id: string, reportDate: string, timing: "bmo" | "amc", publishedAt: string) =>
  ({ id, reportDate, timing, publishedAt }) as Row as EarningsCall;

const firstNight = [
  // board() order: session, then rank. AMC calls on Nov 12 grade on the Nov 13 session.
  row("2026-11-12:TWST", "2026-11-12", "bmo", "2026-11-12T01:12:03.000Z"),
  row("2026-11-13:AMAT", "2026-11-12", "amc", "2026-11-12T01:12:09.000Z"),
  row("2026-11-13:CSCO", "2026-11-12", "amc", "2026-11-12T01:12:15.000Z"),
  row("2026-11-13:CBRS", "2026-11-12", "amc", "2026-11-12T01:12:21.000Z"),
];

describe("groupByReport", () => {
  it("puts after-close calls on the day they report, not the session that grades them", () => {
    const groups = groupByReport(firstNight, "asc");
    expect(groups).toHaveLength(1);
    expect(groups[0].reportDate).toBe("2026-11-12");
    expect(groups[0].calls.map((call) => call.id)).toEqual([
      "2026-11-12:TWST",
      "2026-11-13:AMAT",
      "2026-11-13:CSCO",
      "2026-11-13:CBRS",
    ]);
  });

  it("keeps two publish nights apart when they share a grading session", () => {
    // Second night: Nov 13 BMO calls grade on the same Nov 13 session as Nov 12's AMC calls,
    // and board() interleaves them by per-run rank.
    const board = [
      row("2026-11-13:BIRK", "2026-11-13", "bmo", "2026-11-13T01:12:04.000Z"),
      row("2026-11-13:AMAT", "2026-11-12", "amc", "2026-11-12T01:12:09.000Z"),
      row("2026-11-14:XP", "2026-11-13", "amc", "2026-11-13T01:12:10.000Z"),
      row("2026-11-13:CSCO", "2026-11-12", "amc", "2026-11-12T01:12:15.000Z"),
    ];
    const groups = groupByReport(board, "asc");
    expect(groups.map((group) => group.reportDate)).toEqual(["2026-11-12", "2026-11-13"]);
    expect(groups[0].calls.map((call) => call.id)).toEqual(["2026-11-13:AMAT", "2026-11-13:CSCO"]);
    expect(groups[1].calls.map((call) => call.id)).toEqual(["2026-11-13:BIRK", "2026-11-14:XP"]);
  });

  it("orders result days newest first with pre-market before after-close", () => {
    const recent = [
      row("2026-11-04:AMD", "2026-11-03", "amc", "2026-11-03T01:30:31.000Z"),
      row("2026-11-04:CVS", "2026-11-04", "bmo", "2026-11-04T01:30:45.000Z"),
      row("2026-11-03:SHOP", "2026-11-03", "bmo", "2026-11-03T01:30:06.000Z"),
    ];
    const groups = groupByReport(recent, "desc");
    expect(groups.map((group) => [group.reportDate, group.calls.map((call) => call.id)])).toEqual([
      ["2026-11-04", ["2026-11-04:CVS"]],
      ["2026-11-03", ["2026-11-03:SHOP", "2026-11-04:AMD"]],
    ]);
  });
});

describe("lock times", () => {
  it("labels one publish run with a single ET time", () => {
    const at = firstNight.map((call) => call.publishedAt);
    expect(lockLabel(at)).toBe("Nov 11 20:12 ET");
    expect(latestLock(firstNight)).toBe("2026-11-12T01:12:21.000Z");
  });

  it("shows a range when a run spans minutes or nights", () => {
    expect(lockLabel(["2026-11-12T01:12:03.000Z", "2026-11-12T01:31:00.000Z"])).toBe("Nov 11 20:12–20:31 ET");
    expect(lockLabel(["2026-11-12T01:12:03.000Z", "2026-11-13T01:12:04.000Z"])).toBe(
      "Nov 11 20:12–Nov 12 20:12 ET",
    );
    expect(lockLabel([])).toBeNull();
  });
});

describe("callTitle and callHref", () => {
  const base = {
    id: "2026-11-13:CSCO",
    ticker: "CSCO",
    direction: "up",
    overUnder: "under",
    line: { value: 4.7, reactions: [] },
    status: "locked",
    grade: null,
  } as unknown as EarningsCall;

  it("states the call", () => {
    expect(callTitle(base)).toBe("CSCO ▲ UP · UNDER ±4.7%");
    const noLine = { ...base, ticker: "CBRS", overUnder: null, line: { value: null, reactions: [] } };
    expect(callTitle(noLine as EarningsCall)).toBe("CBRS ▲ UP");
  });

  it("adds the move and leg results once graded, push included", () => {
    // Fixture AAPL: −1.90% against a ±1.9 line is an over/under push.
    const aapl = {
      ...base,
      ticker: "AAPL",
      direction: "down",
      overUnder: "over",
      line: { value: 1.9, reactions: [] },
      status: "graded",
      grade: { movePct: -1.9, direction: "win", overUnder: "push" },
    } as unknown as EarningsCall;
    expect(callTitle(aapl)).toBe("AAPL ▼ DOWN · OVER ±1.9% · −1.90% W/P");
    expect(callTitle({ ...base, status: "void" } as EarningsCall)).toBe("CSCO ▲ UP · UNDER ±4.7% · Void");
  });

  it("links with the raw id", () => {
    expect(callHref("2026-11-13:CSCO")).toBe("/call/2026-11-13:CSCO");
  });
});
