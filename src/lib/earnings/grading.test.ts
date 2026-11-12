import { describe, expect, it } from "vitest";
import type { DailyBar, Line, TradingDay } from "./types";
import { gradeCall, roundTo, type GradeInput } from "./grading";

/** Weekdays minus holidays; checked against Alpaca /v2/calendar for this window. */
function tradingDays(from: string, to: string, holidays: string[] = [], halfDays: string[] = []): TradingDay[] {
  const days: TradingDay[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const weekday = new Date(t).getUTCDay();
    if (weekday === 0 || weekday === 6 || holidays.includes(date)) continue;
    days.push({ date, open: "09:30", close: halfDays.includes(date) ? "13:00" : "16:00" });
  }
  return days;
}

const CALENDAR = tradingDays("2026-10-01", "2026-12-31", ["2026-11-26", "2026-12-25"], ["2026-11-27", "2026-12-24"]);

// Real AAPL SIP closes. Fiscal Q4 2026 8-K accepted Mon 2026-11-02 16:30 EST; reaction session 11-03 = -1.90%.
const AAPL_BARS: DailyBar[] = [
  { date: "2026-10-29", close: 348.91, volume: 42736941 },
  { date: "2026-10-30", close: 344.63, volume: 68057076 },
  { date: "2026-11-02", close: 338.32, volume: 64967561 },
  { date: "2026-11-03", close: 331.9, volume: 63324019 },
  { date: "2026-11-04", close: 349.51, volume: 89812182 },
];
// AAPL's line going into that print: median |move| of its previous 8 reactions = 1.915 → 1.9.
const AAPL_LINE: Line = { value: 1.9, reactions: [] };

/** A call locked Friday 2026-10-30 21:30 EDT for the 11-02 after-close report, graded on 11-03. */
type Overrides = Partial<Omit<GradeInput, "call">> & { call?: Partial<GradeInput["call"]> };

function input(overrides: Overrides = {}): GradeInput {
  const { call, ...rest } = overrides;
  return {
    calendar: CALENDAR,
    bars: AAPL_BARS,
    releaseAt: "2026-11-02T21:30:00.000Z",
    releaseDate: null,
    releaseSource: "8-K",
    now: "2026-11-03T22:45:00.000Z",
    ...rest,
    call: {
      session: "2026-11-03",
      reportDate: "2026-11-02",
      publishedAt: "2026-10-31T01:30:00.000Z",
      direction: "down",
      overUnder: "under",
      line: AAPL_LINE,
      ...call,
    },
  };
}

describe("roundTo", () => {
  it("rounds half away from zero without float drift", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(2.675, 2)).toBe(2.68);
    expect(roundTo(5.475, 1)).toBe(5.5);
    expect(roundTo(-1.8976, 2)).toBe(-1.9);
  });

  it("never returns negative zero", () => {
    expect(Object.is(roundTo(-0.004, 2), 0)).toBe(true);
    expect(roundTo(1e-9, 2)).toBe(0);
  });
});

describe("gradeCall: graded", () => {
  it("grades AAPL 2026-11-03 from real closes", () => {
    const outcome = gradeCall(input());
    expect(outcome).toEqual({
      status: "graded",
      grade: {
        gradedAt: "2026-11-03T22:45:00.000Z",
        releaseAt: "2026-11-02T21:30:00.000Z",
        releaseSource: "8-K",
        baseDate: "2026-11-02",
        baseClose: 338.32,
        resultDate: "2026-11-03",
        resultClose: 331.9,
        movePct: -1.9,
        direction: "win",
        // |−1.90| sits exactly on the 1.9 line.
        overUnder: "push",
      },
    });
  });

  it("scores the direction leg against the sign of the move", () => {
    const up = gradeCall(input({ call: { direction: "up" } }));
    expect(up.status === "graded" && up.grade.direction).toBe("loss");
  });

  it("scores over/under strictly beyond the line, push on equality", () => {
    const at = (overUnder: "over" | "under", value: number) => {
      const outcome = gradeCall(input({ call: { overUnder, line: { value, reactions: [] } } }));
      return outcome.status === "graded" ? outcome.grade.overUnder : outcome.status;
    };
    expect(at("over", 1.89)).toBe("win");
    expect(at("under", 1.89)).toBe("loss");
    expect(at("over", 1.91)).toBe("loss");
    expect(at("under", 1.91)).toBe("win");
    expect(at("over", 1.9)).toBe("push");
    expect(at("under", 1.9)).toBe("push");
  });

  it("pushes the direction leg on a 0.00 move (rounded to the cent of a percent)", () => {
    const flat = AAPL_BARS.map((bar) => (bar.date === "2026-11-03" ? { ...bar, close: 338.33 } : bar));
    const outcome = gradeCall(input({ bars: flat, call: { direction: "up", overUnder: "over" } }));
    // 338.33 / 338.32 − 1 = +0.003% → 0.00.
    expect(outcome.status === "graded" && outcome.grade.movePct).toBe(0);
    expect(outcome.status === "graded" && outcome.grade.direction).toBe("push");
    expect(outcome.status === "graded" && outcome.grade.overUnder).toBe("loss");
  });

  it("has no over/under leg when the call or the line has none", () => {
    const noPick = gradeCall(input({ call: { overUnder: null } }));
    expect(noPick.status === "graded" && noPick.grade.overUnder).toBeNull();
    const noLine = gradeCall(input({ call: { line: { value: null, reactions: [] } } }));
    expect(noLine.status === "graded" && noLine.grade.overUnder).toBeNull();
  });

  it("accepts a release from news", () => {
    const outcome = gradeCall(input({ releaseAt: "2026-11-02T21:31:05.000Z", releaseSource: "news" }));
    expect(outcome.status === "graded" && outcome.grade.releaseSource).toBe("news");
  });
});

describe("gradeCall: timing", () => {
  it("is pending until 20 minutes after the session close (EST)", () => {
    expect(gradeCall(input({ now: "2026-11-03T21:19:59.000Z" }))).toEqual({ status: "pending" });
    expect(gradeCall(input({ now: "2026-11-03T21:20:00.000Z" })).status).toBe("graded");
  });

  it("uses the EDT close before the 2026-11-01 DST change", () => {
    const call = { session: "2026-10-30", publishedAt: "2026-10-29T01:30:00.000Z" };
    const releaseAt = "2026-10-29T20:30:00.000Z"; // Thu 16:30 EDT → Fri session
    expect(gradeCall(input({ call, releaseAt, now: "2026-10-30T20:19:59.000Z" }))).toEqual({ status: "pending" });
    const outcome = gradeCall(input({ call, releaseAt, now: "2026-10-30T20:20:00.000Z" }));
    expect(outcome.status === "graded" && outcome.grade.movePct).toBe(-1.23);
  });

  it("uses the 13:00 close on the 2026-11-27 half day", () => {
    // Timing-only bars: 11-27 is after the fixture date, so these two closes are constructed.
    const bars: DailyBar[] = [
      { date: "2026-11-25", close: 100, volume: 1 },
      { date: "2026-11-27", close: 103, volume: 1 },
    ];
    const call = { session: "2026-11-27", publishedAt: "2026-11-25T01:30:00.000Z", direction: "up" as const };
    const releaseAt = "2026-11-25T21:10:00.000Z"; // Wed after the close → Fri, across Thanksgiving
    expect(gradeCall(input({ bars, call, releaseAt, now: "2026-11-27T18:19:59.000Z" }))).toEqual({ status: "pending" });
    const outcome = gradeCall(input({ bars, call, releaseAt, now: "2026-11-27T18:20:00.000Z" }));
    expect(outcome.status === "graded" && outcome.grade).toMatchObject({ baseDate: "2026-11-25", movePct: 3, direction: "win" });
  });
});

describe("gradeCall: voids", () => {
  it("voids pre-release when results came one second before the lock", () => {
    const outcome = gradeCall(input({ releaseAt: "2026-10-31T01:29:59.000Z" }));
    expect(outcome).toEqual({ status: "void", reason: "pre-release" });
  });

  it("voids pre-release even before the session has closed", () => {
    expect(gradeCall(input({ releaseAt: "2026-10-30T20:00:00.000Z", now: "2026-11-02T15:00:00.000Z" }))).toEqual({
      status: "void",
      reason: "pre-release",
    });
  });

  it("does not void a release at exactly the lock instant", () => {
    const outcome = gradeCall(
      input({ call: { session: "2026-11-02", publishedAt: "2026-11-02T13:00:00.000Z" }, releaseAt: "2026-11-02T13:00:00.000Z" }),
    );
    expect(outcome.status).toBe("graded");
  });

  it("waits one more session for missing results, then voids no-release", () => {
    expect(gradeCall(input({ releaseAt: null, releaseSource: null, now: "2026-11-03T22:45:00.000Z" }))).toEqual({
      status: "pending",
    });
    expect(gradeCall(input({ releaseAt: null, releaseSource: null, now: "2026-11-04T21:19:59.000Z" }))).toEqual({
      status: "pending",
    });
    expect(gradeCall(input({ releaseAt: null, releaseSource: null, now: "2026-11-04T21:20:00.000Z" }))).toEqual({
      status: "void",
      reason: "no-release",
    });
  });

  it("voids an intraday release", () => {
    expect(gradeCall(input({ releaseAt: "2026-11-03T15:00:00.000Z" }))).toEqual({
      status: "void",
      reason: "intraday-release",
    });
  });

  it("voids results that landed in another session", () => {
    // Before the open on 11-02 → the 11-02 session, not 11-03.
    expect(gradeCall(input({ releaseAt: "2026-11-02T12:00:00.000Z" }))).toEqual({
      status: "void",
      reason: "session-mismatch",
    });
    // After the close on 11-03 → the 11-04 session.
    expect(gradeCall(input({ releaseAt: "2026-11-03T21:30:00.000Z", now: "2026-11-04T22:00:00.000Z" }))).toEqual({
      status: "void",
      reason: "session-mismatch",
    });
  });

  it("retries a missing bar through 3 later sessions, then voids missing-bar", () => {
    const bars = AAPL_BARS.filter((bar) => bar.date !== "2026-11-03");
    // 3 sessions after 11-03 are 11-04, 11-05, 11-06; the last closes 21:00Z.
    expect(gradeCall(input({ bars, now: "2026-11-06T21:19:59.000Z" }))).toEqual({ status: "pending" });
    expect(gradeCall(input({ bars, now: "2026-11-06T21:20:00.000Z" }))).toEqual({ status: "void", reason: "missing-bar" });
    const noBase = AAPL_BARS.filter((bar) => bar.date !== "2026-11-02");
    expect(gradeCall(input({ bars: noBase, now: "2026-11-06T21:20:00.000Z" }))).toEqual({ status: "void", reason: "missing-bar" });
  });

  it("voids a call whose session the calendar shows closed; stays pending past the calendar's end", () => {
    expect(gradeCall(input({ call: { session: "2026-11-26" } }))).toEqual({ status: "void", reason: "session-mismatch" });
    expect(gradeCall(input({ call: { session: "2027-01-05" } }))).toEqual({ status: "pending" });
  });
});

describe("gradeCall: a release known only by its 8-K date of report", () => {
  // The 8-K went in two days after the press release; its date of report is the release day.
  const late = { releaseAt: "2026-11-04T21:05:00.000Z", releaseSource: "8-K" as const };

  it("grades the call when the date of report is the calendar's report date", () => {
    const outcome = gradeCall(input({ ...late, releaseDate: "2026-11-02" }));
    expect(outcome).toMatchObject({ status: "graded", grade: { movePct: -1.9, releaseAt: late.releaseAt } });
  });

  it("voids pre-release when the press release went out on or before the lock's New York date", () => {
    // Locked Friday 10-30 21:30 EDT; the release was dated 10-30 and the 8-K came after the lock.
    expect(gradeCall(input({ ...late, releaseDate: "2026-10-30" }))).toEqual({ status: "void", reason: "pre-release" });
  });

  it("voids session-mismatch when the release day differs from the calendar's", () => {
    expect(gradeCall(input({ ...late, releaseDate: "2026-11-03" }))).toEqual({
      status: "void",
      reason: "session-mismatch",
    });
  });

  it("uses a same-day headline time over the date alone", () => {
    const headline = { releaseAt: "2026-11-02T15:00:00.000Z", releaseSource: "news" as const };
    expect(gradeCall(input({ ...headline, releaseDate: "2026-11-02" }))).toEqual({
      status: "void",
      reason: "intraday-release",
    });
  });
});
