import { describe, expect, it } from "vitest";
import type { TradingDay } from "./types";
import {
  etParts,
  etToEpochMs,
  isSession,
  nextSession,
  previousSession,
  releaseSession,
  sessionClose,
} from "./time";

/** Weekdays minus holidays; checked against Alpaca /v2/calendar for these windows. */
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

// Alpaca calendar, Oct–Dec 2026: Thanksgiving closed, 13:00 closes on Nov 27 and Dec 24.
const FALL_2026 = tradingDays("2026-10-01", "2026-12-31", ["2026-11-26", "2026-12-25"], ["2026-11-27", "2026-12-24"]);
const SPRING_2026 = tradingDays("2026-02-20", "2026-03-20");

describe("etParts", () => {
  it("reads New York wall time on both sides of the 2026-11-01 DST end", () => {
    // EDT (UTC-4) on Friday Oct 30, EST (UTC-5) on Monday Nov 2.
    expect(etParts("2026-10-30T13:29:59Z")).toEqual({ date: "2026-10-30", minutes: 9 * 60 + 29, weekday: 5 });
    expect(etParts("2026-11-02T14:29:59Z")).toEqual({ date: "2026-11-02", minutes: 9 * 60 + 29, weekday: 1 });
    expect(etParts("2026-11-02T13:29:59Z").minutes).toBe(8 * 60 + 29);
  });

  it("reads New York wall time on both sides of the 2026-03-08 DST start", () => {
    expect(etParts("2026-03-06T21:00:00Z")).toEqual({ date: "2026-03-06", minutes: 16 * 60, weekday: 5 });
    expect(etParts("2026-03-09T20:00:00Z")).toEqual({ date: "2026-03-09", minutes: 16 * 60, weekday: 1 });
  });

  it("puts a UTC early-morning instant on the previous New York date", () => {
    expect(etParts("2026-11-12T01:30:04.000Z")).toEqual({ date: "2026-11-11", minutes: 20 * 60 + 30, weekday: 3 });
    expect(etParts(new Date("2026-11-12T04:59:59Z")).date).toBe("2026-11-11");
    expect(etParts(new Date("2026-11-12T05:00:00Z")).date).toBe("2026-11-12");
  });

  it("rejects an unparseable instant", () => {
    expect(() => etParts("not a date")).toThrow(RangeError);
  });
});

describe("etToEpochMs", () => {
  it("round-trips session closes in EDT, EST and on a half day", () => {
    expect(new Date(etToEpochMs("2026-10-30", 16 * 60)).toISOString()).toBe("2026-10-30T20:00:00.000Z");
    expect(new Date(etToEpochMs("2026-11-02", 16 * 60)).toISOString()).toBe("2026-11-02T21:00:00.000Z");
    expect(new Date(etToEpochMs("2026-11-27", 13 * 60)).toISOString()).toBe("2026-11-27T18:00:00.000Z");
    expect(new Date(etToEpochMs("2026-03-09", 16 * 60 + 20)).toISOString()).toBe("2026-03-09T20:20:00.000Z");
  });
});

describe("session navigation", () => {
  it("treats Veterans Day 2026-11-11 as a trading day and skips Thanksgiving", () => {
    expect(isSession(FALL_2026, "2026-11-11")).toBe(true);
    expect(isSession(FALL_2026, "2026-11-26")).toBe(false);
    expect(nextSession(FALL_2026, "2026-11-11")).toBe("2026-11-12");
    expect(nextSession(FALL_2026, "2026-11-25")).toBe("2026-11-27");
    expect(nextSession(FALL_2026, "2026-11-26")).toBe("2026-11-27");
    expect(previousSession(FALL_2026, "2026-11-27")).toBe("2026-11-25");
    expect(nextSession(FALL_2026, "2026-11-14")).toBe("2026-11-16");
    expect(previousSession(FALL_2026, "2026-11-16")).toBe("2026-11-13");
  });

  it("returns null past either end of the calendar", () => {
    expect(nextSession(FALL_2026, "2026-12-31")).toBeNull();
    expect(previousSession(FALL_2026, "2026-10-01")).toBeNull();
  });

  it("reports the 13:00 half-day close", () => {
    expect(sessionClose(FALL_2026, "2026-11-27")).toBe(13 * 60);
    expect(sessionClose(FALL_2026, "2026-11-25")).toBe(16 * 60);
    expect(sessionClose(FALL_2026, "2026-11-26")).toBeNull();
  });
});

describe("releaseSession", () => {
  it("maps pre-open, intraday and after-close acceptances on a trading day", () => {
    // Friday 2026-10-30 16:30 EDT → next session Monday.
    expect(releaseSession(FALL_2026, "2026-10-30T20:30:12.000Z")).toEqual({ session: "2026-11-02", timing: "amc" });
    expect(releaseSession(FALL_2026, "2026-11-12T11:59:00.000Z")).toEqual({ session: "2026-11-12", timing: "bmo" });
    expect(releaseSession(FALL_2026, "2026-11-12T17:00:00.000Z")).toEqual({ session: "2026-11-12", timing: "during" });
  });

  it("uses the exact open and close minutes as boundaries", () => {
    expect(releaseSession(FALL_2026, "2026-11-12T14:29:59Z")?.timing).toBe("bmo");
    expect(releaseSession(FALL_2026, "2026-11-12T14:30:00Z")?.timing).toBe("during");
    expect(releaseSession(FALL_2026, "2026-11-12T20:59:59Z")?.timing).toBe("during");
    expect(releaseSession(FALL_2026, "2026-11-12T21:00:00Z")).toEqual({ session: "2026-11-13", timing: "amc" });
  });

  it("is DST-correct around 2026-11-01: 09:29 EDT and 09:29 EST are both before the open", () => {
    expect(releaseSession(FALL_2026, "2026-10-30T13:29:00Z")).toEqual({ session: "2026-10-30", timing: "bmo" });
    expect(releaseSession(FALL_2026, "2026-11-02T14:29:00Z")).toEqual({ session: "2026-11-02", timing: "bmo" });
    // 14:29Z on Oct 30 is 10:29 EDT, already trading.
    expect(releaseSession(FALL_2026, "2026-10-30T14:29:00Z")?.timing).toBe("during");
  });

  it("is DST-correct around 2026-03-08", () => {
    expect(releaseSession(SPRING_2026, "2026-03-06T21:00:00Z")).toEqual({ session: "2026-03-09", timing: "amc" });
    // 20:30Z on Mar 9 is 16:30 EDT.
    expect(releaseSession(SPRING_2026, "2026-03-09T20:30:00Z")).toEqual({ session: "2026-03-10", timing: "amc" });
    // 20:30Z on Mar 6 was 15:30 EST, still trading.
    expect(releaseSession(SPRING_2026, "2026-03-06T20:30:00Z")?.timing).toBe("during");
  });

  it("closes the 2026-11-27 half day at 13:00", () => {
    expect(releaseSession(FALL_2026, "2026-11-27T17:59:00Z")).toEqual({ session: "2026-11-27", timing: "during" });
    expect(releaseSession(FALL_2026, "2026-11-27T18:00:00Z")).toEqual({ session: "2026-11-30", timing: "amc" });
  });

  it("sends weekend and holiday releases to the next session before the open", () => {
    // BRK.B released Q3 2026 on Saturday 2026-11-07 (08:00 EST here).
    expect(releaseSession(FALL_2026, "2026-11-07T13:00:00Z")).toEqual({ session: "2026-11-09", timing: "bmo" });
    expect(releaseSession(FALL_2026, "2026-11-26T21:30:00Z")).toEqual({ session: "2026-11-27", timing: "bmo" });
  });

  it("returns null when the calendar does not cover the instant", () => {
    expect(releaseSession(FALL_2026, "2027-01-02T15:00:00Z")).toBeNull();
    expect(releaseSession(FALL_2026, "2026-12-31T21:30:00Z")).toBeNull();
  });
});
