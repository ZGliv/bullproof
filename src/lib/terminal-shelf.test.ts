import { describe, expect, it } from "vitest";
import { parseTerminal } from "./terminal-shelf";

describe("terminal research persistence", () => {
  it("round-trips watchlists, seen companies and research notes", () => {
    const saved = {
      version: 1,
      watchlist: ["AAPL", "BRK-B"],
      seen: ["AAPL"],
      notes: { AAPL: "Check recurring revenue before deciding." },
    };
    expect(parseTerminal(JSON.stringify(saved))).toEqual(saved);
  });
  it("recovers safely from damaged storage and validates ticker keys", () => {
    expect(parseTerminal("{")).toEqual({
      version: 1,
      watchlist: [],
      seen: [],
      notes: {},
    });
    expect(
      parseTerminal(
        JSON.stringify({
          version: 1,
          watchlist: ["AAPL", "AAPL", "bad ticker", null],
          seen: {},
          notes: { AAPL: "x".repeat(7000), "bad ticker": "invalid" },
        }),
      ),
    ).toEqual({
      version: 1,
      watchlist: ["AAPL"],
      seen: [],
      notes: { AAPL: "x".repeat(5000) },
    });
  });
});
