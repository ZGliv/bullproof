import { describe, expect, it } from "vitest";
import type { DailyBar, Reporter, TradingDay } from "./types";
import {
  displayName,
  expectedGradeSession,
  isCalendarCsv,
  liquidityRank,
  parseAlphaVantageCalendar,
  slateCandidates,
} from "./calendar";

// Rows from the real Alpha Vantage EARNINGS_CALENDAR response of 2026-11-11 (CRLF line ends).
const AV_CSV = [
  "symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay",
  "AARD,AARDVARK THERAPEUTICS INCORPORATED,2026-11-12,2026-09-30,-0.69,USD,",
  "ABSI,ABSCI CORPORATION,2026-11-12,2026-09-30,-0.14,USD,pre-market",
  "AERT,AERIES TECHNOLOGY INCORPORATED,2026-11-12,2026-09-30,,USD,pre-market",
  "AMAT,APPLIED MATERIALS INCORPORATED,2026-11-12,2026-10-31,4.06,USD,post-market",
  'OFRM,"ONCE UPON A FARM, PBC",2026-11-12,2026-09-30,-0.09,USD,post-market',
  'SPH,"SUBURBAN PROPANE PARTNERS, L.P.",2026-11-12,2026-09-30,-0.43,USD,pre-market',
  "NVDA,NVIDIA CORPORATION,2026-11-17,2026-10-31,2.49,USD,post-market",
  "TJX,TJX COMPANIES INCORPORATED (THE),2026-11-18,2026-10-31,1.33,USD,pre-market",
  "DELL,DELL TECHNOLOGIES INCORPORATED,2026-11-24,2026-10-31,6.41,USD,",
  "BF.B,BROWN FORMAN CORPORATION,2026-12-03,2026-10-31,0.46,USD,pre-market",
  "JPM-PC,JPM-PC,2027-01-14,2026-12-31,,USD,",
  "",
].join("\r\n");

describe("isCalendarCsv", () => {
  it("recognises the CSV, with or without a byte-order mark", () => {
    expect(isCalendarCsv(AV_CSV)).toBe(true);
    expect(isCalendarCsv(`﻿${AV_CSV}`)).toBe(true);
    expect(isCalendarCsv("symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay\n")).toBe(true);
  });

  it("rejects throttle notes and other bodies", () => {
    expect(isCalendarCsv('{\n    "Information": "rate limit"\n}')).toBe(false);
    expect(isCalendarCsv("")).toBe(false);
    expect(isCalendarCsv("<html>error</html>")).toBe(false);
  });
});

describe("parseAlphaVantageCalendar", () => {
  it("keeps only confirmed pre/post-market USD rows with plain tickers", () => {
    const reporters = parseAlphaVantageCalendar(AV_CSV);
    expect(reporters.map((r) => r.ticker)).toEqual(["ABSI", "AERT", "AMAT", "OFRM", "SPH", "NVDA", "TJX"]);
  });

  it("maps timing, parses estimates and keeps quoted names with commas", () => {
    const byTicker = Object.fromEntries(parseAlphaVantageCalendar(AV_CSV).map((r) => [r.ticker, r]));
    expect(byTicker.AMAT).toEqual({
      ticker: "AMAT",
      name: "APPLIED MATERIALS INCORPORATED",
      reportDate: "2026-11-12",
      timing: "amc",
      epsEstimate: 4.06,
    });
    expect(byTicker.ABSI.timing).toBe("bmo");
    expect(byTicker.ABSI.epsEstimate).toBe(-0.14);
    expect(byTicker.AERT.epsEstimate).toBeNull();
    expect(byTicker.OFRM.name).toBe("ONCE UPON A FARM, PBC");
    expect(byTicker.SPH.name).toBe("SUBURBAN PROPANE PARTNERS, L.P.");
  });

  it("handles LF line ends, escaped quotes and non-USD rows", () => {
    const csv = [
      "symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay",
      'ABC,"THE ""ABC"" COMPANY",2026-11-12,2026-09-30,1.5,USD,post-market',
      "XYZ,XYZ PLC,2026-11-12,2026-09-30,1.5,GBP,pre-market",
    ].join("\n");
    expect(parseAlphaVantageCalendar(csv)).toEqual([
      { ticker: "ABC", name: 'THE "ABC" COMPANY', reportDate: "2026-11-12", timing: "amc", epsEstimate: 1.5 },
    ]);
  });

  it("returns [] for anything that is not the calendar CSV", () => {
    expect(parseAlphaVantageCalendar('{"Information": "rate limit"}')).toEqual([]);
    expect(parseAlphaVantageCalendar("")).toEqual([]);
  });
});

// Alpaca calendar, Nov 2026 (Thanksgiving closed, 13:00 close on the 27th).
const NOV_2026: TradingDay[] = [
  "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17",
  "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-27",
  "2026-11-30",
].map((date) => ({ date, open: "09:30", close: date === "2026-11-27" ? "13:00" : "16:00" }));

describe("slateCandidates and expectedGradeSession", () => {
  const reporters = parseAlphaVantageCalendar(AV_CSV);

  it("selects both bmo and amc reporters for the next session", () => {
    expect(slateCandidates(reporters, "2026-11-12").map((r) => `${r.ticker}:${r.timing}`)).toEqual([
      "ABSI:bmo",
      "AERT:bmo",
      "AMAT:amc",
      "OFRM:amc",
      "SPH:bmo",
    ]);
    expect(slateCandidates(reporters, "2026-11-13")).toEqual([]);
  });

  it("grades bmo on the report date and amc on the next session", () => {
    const amat = reporters.find((r) => r.ticker === "AMAT")!;
    const absi = reporters.find((r) => r.ticker === "ABSI")!;
    expect(expectedGradeSession(NOV_2026, absi)).toBe("2026-11-12");
    expect(expectedGradeSession(NOV_2026, amat)).toBe("2026-11-13");
  });

  it("crosses weekends and Thanksgiving", () => {
    const friday: Reporter = { ticker: "A", name: "A", reportDate: "2026-11-13", timing: "amc", epsEstimate: null };
    const wednesday: Reporter = { ...friday, reportDate: "2026-11-25" };
    expect(expectedGradeSession(NOV_2026, friday)).toBe("2026-11-16");
    expect(expectedGradeSession(NOV_2026, wednesday)).toBe("2026-11-27");
    // A bmo date that is not a trading day reacts at the next open.
    expect(expectedGradeSession(NOV_2026, { ...friday, reportDate: "2026-11-26", timing: "bmo" })).toBe("2026-11-27");
    expect(expectedGradeSession(NOV_2026, { ...friday, reportDate: "2026-11-30" })).toBeNull();
  });
});

describe("liquidityRank", () => {
  // Real Alpaca SIP daily bars, 2026-10-28 … 11-06.
  const aapl: DailyBar[] = [
    ["2026-10-28", 343.83, 35858672], ["2026-10-29", 348.91, 42736941], ["2026-10-30", 344.63, 68057076],
    ["2026-11-02", 338.32, 64967561], ["2026-11-03", 331.9, 63324019], ["2026-11-04", 349.51, 89812182],
    ["2026-11-05", 344.17, 75846688], ["2026-11-06", 342.37, 44861923],
  ].map(([date, close, volume]) => ({ date: date as string, close: close as number, volume: volume as number }));
  const nvda: DailyBar[] = [
    ["2026-10-28", 215.38, 93664476], ["2026-10-29", 213.66, 78201170], ["2026-10-30", 204.64, 169416197],
    ["2026-11-02", 202.06, 120042182], ["2026-11-03", 206.69, 92579121], ["2026-11-04", 200.13, 149700744],
    ["2026-11-05", 181.6, 307179382], ["2026-11-06", 186.64, 180953653],
  ].map(([date, close, volume]) => ({ date: date as string, close: close as number, volume: volume as number }));
  // KRUS, Nov 2021: ~$45 and ~40k shares a day.
  const krus: DailyBar[] = [
    { date: "2021-11-08", close: 49.94, volume: 60661 },
    { date: "2021-11-09", close: 49.87, volume: 27929 },
  ];
  const reporter = (ticker: string): Reporter => ({ ticker, name: ticker, reportDate: "2026-11-12", timing: "amc", epsEstimate: null });

  it("ranks by average dollar volume and reports the last close", () => {
    const ranked = liquidityRank([reporter("AAPL"), reporter("NVDA"), reporter("KRUS"), reporter("NONE")], {
      AAPL: aapl,
      NVDA: [...nvda].reverse(),
      KRUS: krus,
    });
    expect(ranked.map((r) => r.reporter.ticker)).toEqual(["NVDA", "AAPL"]);
    expect(ranked[0]).toMatchObject({ lastClose: 186.64, lastCloseDate: "2026-11-06" });
    const aaplDollarVolume = aapl.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / aapl.length;
    expect(ranked[1].dollarVolume).toBeCloseTo(aaplDollarVolume, 0);
  });

  it("averages only the last 20 sessions", () => {
    const long: DailyBar[] = Array.from({ length: 25 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      close: 20,
      volume: i < 5 ? 1e12 : 3_000_000,
    }));
    expect(liquidityRank([reporter("X")], { X: long })[0].dollarVolume).toBe(60_000_000);
  });

  it("applies the price and dollar-volume floors", () => {
    expect(liquidityRank([reporter("AAPL")], { AAPL: aapl }, { minPrice: 400 })).toEqual([]);
    expect(liquidityRank([reporter("AAPL")], { AAPL: aapl }, { minDollarVolume: 1e12 })).toEqual([]);
    expect(liquidityRank([reporter("KRUS")], { KRUS: krus }, { minDollarVolume: 1_000_000 })).toHaveLength(1);
  });
});

describe("displayName", () => {
  // Real Alpha Vantage EARNINGS_CALENDAR names (pulled 2026-11-11) and their display form.
  const NAMES: [string, string, string][] = [
    ["CSCO", "CISCO SYSTEMS INCORPORATED", "Cisco Systems Inc"],
    ["AMAT", "APPLIED MATERIALS INCORPORATED", "Applied Materials Inc"],
    ["ABSI", "ABSCI CORPORATION", "Absci Corporation"],
    ["TWST", "TWIST BIOSCIENCE CORPORATION", "Twist Bioscience Corporation"],
    ["NBIS", "NEBIUS GROUP NAAMLOZE VENNOOTSCHAP", "Nebius Group N.V."],
    ["DLO", "DLOCAL LIMITED", "Dlocal Limited"],
    ["DIS", "WALT DISNEY COMPANY (THE)", "The Walt Disney Company"],
    ["HD", "HOME DEPOT INCORPORATED (THE)", "The Home Depot Inc"],
    ["TJX", "TJX COMPANIES INCORPORATED (THE)", "The TJX Companies Inc"],
    ["JD", "JD.COM INCORPORATED", "JD.com Inc"],
    ["LOW", "LOWE'S COMPANIES INCORPORATED", "Lowe's Companies Inc"],
    ["BJ", "BJ'S WHOLESALE CLUB HOLDINGS INCORPORATED", "BJ's Wholesale Club Holdings Inc"],
    ["M", "MACY'S INCORPORATED", "Macy's Inc"],
    ["BALY", "BALLY'S CORPORATION", "Bally's Corporation"],
    ["CINT", "CI&T INCORPORATED", "CI&T Inc"],
    ["CXII", "CHURCHILL CAPITAL CORPORATION XII", "Churchill Capital Corporation XII"],
    ["AIB", "AIB DATA CENTERS INCORPORATED", "AIB Data Centers Inc"],
    ["AADX", "APPLIED AEROSPACE & DEFENSE INCORPORATED", "Applied Aerospace & Defense Inc"],
    ["AIRT", "AIR T INCORPORATED", "Air T Inc"],
    ["APUS", "APIMEDS PHARMACEUTICALS US INCORPORATED", "Apimeds Pharmaceuticals US Inc"],
    ["RMR", "THE RMR GROUP INCORPORATED", "The RMR Group Inc"],
    ["NDLS", "NOODLES & COMPANY", "Noodles & Company"],
    ["BMO", "BANK OF MONTREAL", "Bank of Montreal"],
    ["VALN", "VALNEVA SE", "Valneva SE"],
    ["OFRM", "ONCE UPON A FARM, PBC", "Once Upon a Farm, PBC"],
    ["GBDC", "GOLUB CAPITAL BDC INCORPORATED", "Golub Capital BDC Inc"],
    ["CAE", "CAE INCORPORATED", "CAE Inc"],
    ["BBY", "BEST BUY COMPANY INCORPORATED", "Best Buy Company Inc"],
    ["JJSF", "J & J SNACK FOODS CORPORATION", "J & J Snack Foods Corporation"],
    ["AZ", "A2Z CUST2MATE SOLUTIONS CORPORATION", "A2Z Cust2mate Solutions Corporation"],
    ["CODX", "COMPANY-DIAGNOSTICS INCORPORATED", "Company-Diagnostics Inc"],
  ];
  it.each(NAMES)("%s: %s", (ticker, raw, expected) => {
    expect(displayName(raw, ticker)).toBe(expected);
  });
});
