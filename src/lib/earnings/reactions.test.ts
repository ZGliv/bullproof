import { describe, expect, it } from "vitest";
import type { DailyBar, EarningsRelease, Reaction, TradingDay } from "./types";
import { computeLine, historicalReactions, median } from "./reactions";

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

/** Real Alpaca SIP daily bars (split-adjusted): "MM-DD close volume" rows. */
function bars(year: number, rows: string): DailyBar[] {
  return rows
    .split(",")
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [monthDay, close, volume] = row.split(" ");
      return { date: `${year}-${monthDay}`, close: Number(close), volume: Number(volume) };
    });
}

function release(accession: string, acceptedAt: string, reportDate: string): EarningsRelease {
  return { accession, acceptedAt, reportDate, periodEnd: null, url: "" };
}

// HELE fiscal Q1 2024: press release Mon 2023-07-10 before the open, 8-K accepted Wed 07-12 16:40 EDT.
const HELE_BARS = bars(
  2023,
  `05-01 98.61 773803, 05-02 93.61 905686, 05-03 96.47 728856, 05-04 96.57 637346,
  05-05 99.08 588093, 05-08 96.16 799979, 05-09 94.59 462482, 05-10 95.03 294173,
  05-11 96.43 349330, 05-12 97.97 676708, 05-15 97.11 426476, 05-16 94.58 331999,
  05-17 97.75 331238, 05-18 98.62 381032, 05-19 97.15 447301, 05-22 99.85 614105,
  05-23 99.38 324009, 05-24 98.7 310468, 05-25 98.25 232497, 05-26 100.24 293317,
  05-30 98.41 329190, 05-31 96.28 362613, 06-01 94.02 541516, 06-02 98.47 514227,
  06-05 95.16 277727, 06-06 98.73 394504, 06-07 101.64 415342, 06-08 100.14 315406,
  06-09 99.25 387555, 06-12 99.39 302994, 06-13 99.46 328915, 06-14 98.86 459956,
  06-15 99.85 263090, 06-16 97.68 548626, 06-20 96.84 465442, 06-21 97.04 375450,
  06-22 98.25 239152, 06-23 98.14 1120112, 06-26 100.53 264671, 06-27 102.4 456780,
  06-28 105.78 527283, 06-29 107.32 339069, 06-30 108.02 406899, 07-03 110.13 187076,
  07-05 109.29 351932, 07-06 109.02 486754, 07-07 112.54 859802, 07-10 133.35 2738919,
  07-11 129.55 1402282, 07-12 131.18 786207, 07-13 130.84 500496, 07-14 128.38 362732,
  07-17 128.255 467471, 07-18 128.72 496074, 07-19 131 510761, 07-20 132.41 487690`,
);
const CAL_2023 = tradingDays("2023-04-01", "2023-07-31", ["2023-04-07", "2023-05-29", "2023-06-19", "2023-07-04"], ["2023-07-03"]);

// KRUS fiscal Q4 2021: press release Thu 2021-11-11 after the close, 8-K accepted Fri 11-12 16:15 EST.
const KRUS_BARS = bars(
  2021,
  `09-20 44.45 32387, 09-21 43.55 14603, 09-22 43.59 48444, 09-23 45.1 62077,
  09-24 47.92 100716, 09-27 47.68 57790, 09-28 45.59 39382, 09-29 43.37 48488,
  09-30 43.68 45383, 10-01 47.35 52369, 10-04 44.26 51082, 10-05 44.51 32396,
  10-06 44.27 27422, 10-07 44.4 62204, 10-08 46.14 43686, 10-11 46.31 38369,
  10-12 45.81 17182, 10-13 45.91 24892, 10-14 48.09 53200, 10-15 45.75 46914,
  10-18 46.45 26037, 10-19 46.45 16991, 10-20 45.23 49947, 10-21 44.51 73354,
  10-22 45.17 22728, 10-25 43.91 84773, 10-26 41.48 84853, 10-27 41.55 41985,
  10-28 42.1 57635, 10-29 42.58 27700, 11-01 45.47 45227, 11-02 45.06 26432,
  11-03 45.28 32424, 11-04 46.17 14741, 11-05 49.47 40755, 11-08 49.94 60661,
  11-09 49.87 27929, 11-10 52.08 48468, 11-11 54.5 116533, 11-12 70.94 412670,
  11-15 70.66 134953, 11-16 75.68 159343, 11-17 79.91 85482, 11-18 71.47 127145,
  11-19 71.34 106297`,
);
const CAL_2021 = tradingDays("2021-09-01", "2021-11-30", ["2021-09-06", "2021-11-25"], ["2021-11-26"]);

// CROX Q1 2019: 8-K "date of report" Sunday 2019-05-05, accepted Tue 05-07 07:07 EDT (a normal pre-open release).
const CROX_BARS = bars(
  2019,
  `03-20 25.64 1375544, 03-21 25.83 1222703, 03-22 25.1 1086224, 03-25 25.42 1278697,
  03-26 25.43 785697, 03-27 25.54 3128425, 03-28 26.12 732041, 03-29 25.75 1822549,
  04-01 26.81 1190960, 04-02 26.39 1823761, 04-03 26.45 562201, 04-04 26.52 753147,
  04-05 26.57 1700611, 04-08 25.94 1538610, 04-09 25.91 947505, 04-10 26.17 1951871,
  04-11 26.12 740290, 04-12 26.54 1421548, 04-15 26.43 797968, 04-16 26.91 934898,
  04-17 27.51 859040, 04-18 27.4 748936, 04-22 27.26 1140564, 04-23 26.57 1673046,
  04-24 27.67 1261092, 04-25 27.26 1383696, 04-26 27.54 784383, 04-29 28.05 882594,
  04-30 27.85 1197673, 05-01 28 1285172, 05-02 28.19 1067052, 05-03 29.18 1123616,
  05-06 28.34 2351707, 05-07 26.94 3704545, 05-08 24.39 6006114, 05-09 23.82 3733104,
  05-10 23.23 4996200`,
);
const CAL_2019 = tradingDays("2019-03-01", "2019-05-31", ["2019-04-19", "2019-05-27"]);

// GOOGL Q2 2023: 8-K "date of report" 2023-07-20 (an unrelated earlier event), release Tue 07-25 16:01 EDT.
const GOOGL_BARS = bars(
  2023,
  `06-12 123.64 32420659, 06-13 123.83 22279562, 06-14 123.67 30584062, 06-15 125.09 35237932,
  06-16 123.53 45534669, 06-20 123.1 26107183, 06-21 120.55 30310276, 06-22 123.15 26960997,
  06-23 122.34 35806914, 06-26 118.34 33999676, 06-27 118.33 39545130, 06-28 120.18 27094454,
  06-29 119.1 24090902, 06-30 119.7 28614491, 07-03 119.9 14407579, 07-05 121.75 27592126,
  07-06 120.11 24783978, 07-07 119.48 21709550, 07-10 116.45 35321570, 07-11 117.14 23081505,
  07-12 118.93 30418830, 07-13 124.54 44315823, 07-14 125.42 33283077, 07-17 124.65 25717307,
  07-18 123.76 26229737, 07-19 122.03 37241584, 07-20 119.2 37925424, 07-21 120.02 72866901,
  07-24 121.53 29726497, 07-25 122.21 52731094, 07-26 129.27 61698757, 07-27 129.4 44954684,
  07-28 132.58 36591160`,
);

// BRK.B Q2 2026: released Saturday 2026-08-08, 8-K accepted Tue 08-11 15:52 EDT (during trading).
const BRK_BARS = bars(
  2026,
  `06-22 488.69 6092260, 06-23 492.81 4438898, 06-24 494.81 4724127, 06-25 487.81 7075480,
  06-26 498.66 7262729, 06-29 496 5214539, 06-30 500.39 5921309, 07-01 499.74 4113099,
  07-02 507.78 4401807, 07-06 506.58 4142106, 07-07 504 3771768, 07-08 494.79 4440037,
  07-09 495.45 3403093, 07-10 493.71 2748054, 07-13 496.85 3241759, 07-14 491.09 4119956,
  07-15 488.35 5145937, 07-16 493.12 4204761, 07-17 490.91 5605106, 07-20 491.25 3438934,
  07-21 489.65 4482838, 07-22 489.39 3188518, 07-23 490.85 2892257, 07-24 494.93 3942302,
  07-27 497.18 3495858, 07-28 512.37 6379105, 07-29 509.16 5070956, 07-30 509.68 4073618,
  07-31 511.54 3949122, 08-03 513.14 4264336, 08-04 517.22 4781449, 08-05 518.85 3766975,
  08-06 524.61 4366742, 08-07 521.8 3655039, 08-10 529.42 6110281, 08-11 516.38 4731068,
  08-12 510 4611014, 08-13 506.93 4725620, 08-14 504.03 3980844`,
);
const CAL_2026_SUMMER = tradingDays("2026-06-01", "2026-08-31", ["2026-06-19", "2026-07-03"]);

describe("median", () => {
  it("handles odd and even lengths without mutating the input", () => {
    const xs = [3, 1, 2];
    expect(median(xs)).toBe(2);
    expect(xs).toEqual([3, 1, 2]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe("historicalReactions", () => {
  it("HELE 2023-07: moves to the report date when the 8-K came two days after the release", () => {
    const reactions = historicalReactions(
      [release("0000916789-23-000035", "2023-07-12T20:40:14.000Z", "2023-07-10")],
      HELE_BARS,
      CAL_2023,
    );
    expect(reactions).toEqual([
      { session: "2023-07-10", movePct: 18.49, timing: "bmo", mapping: "report-date", accession: "0000916789-23-000035" },
    ]);
  });

  it("HELE 2023-05: keeps the acceptance session when there is no 20-session volume baseline", () => {
    const reactions = historicalReactions(
      [release("0000916789-23-000019", "2023-05-01T20:10:40.000Z", "2023-04-26")],
      HELE_BARS,
      CAL_2023,
    );
    expect(reactions).toEqual([
      { session: "2023-05-02", movePct: -5.07, timing: "amc", mapping: "accepted", accession: "0000916789-23-000019" },
    ]);
  });

  it("KRUS 2021-11-12: picks the day after the report date (after-close release)", () => {
    const reactions = historicalReactions(
      [release("0001564590-21-056710", "2021-11-12T21:15:47.000Z", "2021-11-11")],
      KRUS_BARS,
      CAL_2021,
    );
    expect(reactions).toEqual([
      { session: "2021-11-12", movePct: 30.17, timing: "amc", mapping: "report-date", accession: "0001564590-21-056710" },
    ]);
  });

  it("GOOGL 2023-07: an earlier report date without a dominant volume spike leaves the acceptance mapping alone", () => {
    const reactions = historicalReactions(
      [release("0001652044-23-000067", "2023-07-25T20:01:21.000Z", "2023-07-20")],
      GOOGL_BARS,
      CAL_2023,
    );
    expect(reactions).toEqual([
      { session: "2023-07-26", movePct: 5.78, timing: "amc", mapping: "accepted", accession: "0001652044-23-000067" },
    ]);
  });

  it("CROX 2019-05-07: a Sunday report date does not override an 8-K filed before the open", () => {
    const reactions = historicalReactions(
      [release("0001334036-19-000018", "2019-05-07T11:07:42.000Z", "2019-05-05")],
      CROX_BARS,
      CAL_2019,
    );
    expect(reactions).toEqual([
      { session: "2019-05-07", movePct: -4.94, timing: "bmo", mapping: "accepted", accession: "0001334036-19-000018" },
    ]);
  });

  it("BRK.B 2026-08: a Saturday release reacts on Monday, not on the Tuesday the 8-K was accepted", () => {
    const reactions = historicalReactions(
      [release("0001193125-26-344495", "2026-08-11T19:52:27.000Z", "2026-08-08")],
      BRK_BARS,
      CAL_2026_SUMMER,
    );
    expect(reactions).toEqual([
      { session: "2026-08-10", movePct: 1.46, timing: "bmo", mapping: "report-date", accession: "0001193125-26-344495" },
    ]);
  });

  it("weekend report date: an after-close 8-K two days later still maps to the Monday", () => {
    // BRK.B bars; acceptance moved to Tue 17:30 EDT, so the acceptance session would be Wed 08-12.
    const reactions = historicalReactions([release("x", "2026-08-11T21:30:00.000Z", "2026-08-08")], BRK_BARS, CAL_2026_SUMMER);
    expect(reactions.map((r) => [r.session, r.mapping, r.timing])).toEqual([["2026-08-10", "report-date", "bmo"]]);
  });

  it("weekend report date: a clear volume spike in the acceptance session wins it back", () => {
    // KRUS bars with a Saturday event date: 11-12 trades ~9× its baseline against ~1.5× on Monday 11-08.
    const reactions = historicalReactions([release("x", "2021-11-11T21:15:00.000Z", "2021-11-06")], KRUS_BARS, CAL_2021);
    expect(reactions.map((r) => [r.session, r.mapping, r.timing])).toEqual([["2021-11-12", "accepted", "amc"]]);
  });

  it("ignores a report date on or after the acceptance date", () => {
    const reactions = historicalReactions(
      [release("x", "2023-07-25T20:01:21.000Z", "2023-07-25")],
      GOOGL_BARS,
      CAL_2023,
    );
    expect(reactions.map((r) => [r.session, r.mapping])).toEqual([["2023-07-26", "accepted"]]);
  });

  it("keeps an intraday acceptance as a 'during' reaction", () => {
    const reactions = historicalReactions([release("x", "2023-07-13T15:00:00.000Z", "2023-07-13")], HELE_BARS, CAL_2023);
    expect(reactions).toEqual([{ session: "2023-07-13", movePct: -0.26, timing: "during", mapping: "accepted", accession: "x" }]);
  });

  it("deduplicates two filings that land in the same session and returns oldest first", () => {
    // PENG filed two 2.02 8-Ks seven minutes apart; here the pattern is replayed on HELE bars.
    const reactions = historicalReactions(
      [
        release("later", "2023-07-12T20:47:00.000Z", "2023-07-10"),
        release("earlier", "2023-07-12T20:40:14.000Z", "2023-07-10"),
        release("may", "2023-05-01T20:10:40.000Z", "2023-04-26"),
      ],
      HELE_BARS,
      CAL_2023,
    );
    expect(reactions.map((r) => [r.session, r.accession])).toEqual([
      ["2023-05-02", "may"],
      ["2023-07-10", "earlier"],
    ]);
  });

  it("skips a release whose session or prior bar is missing", () => {
    const withoutResultBar = HELE_BARS.filter((bar) => bar.date !== "2023-07-10" && bar.date !== "2023-07-13");
    expect(
      historicalReactions([release("x", "2023-07-12T20:40:14.000Z", "2023-07-10")], withoutResultBar, CAL_2023),
    ).toEqual([]);
    expect(historicalReactions([release("x", "2023-07-21T20:00:00.000Z", "2023-07-21")], HELE_BARS, CAL_2023)).toEqual([]);
  });

  it("skips a release outside the calendar", () => {
    expect(historicalReactions([release("x", "2024-01-10T21:00:00.000Z", "2024-01-10")], HELE_BARS, CAL_2023)).toEqual([]);
  });
});

function reactionsFromMoves(moves: number[]): Reaction[] {
  return moves.map((movePct, i) => ({
    session: `2024-01-${String(i + 1).padStart(2, "0")}`,
    movePct,
    timing: "amc",
    mapping: "accepted",
    accession: String(i),
  }));
}

describe("computeLine", () => {
  it("AAPL: median |move| of the last 8 reactions is 2.2 (research table: 2.20)", () => {
    // Oldest first: 2024-02-02 … 2026-11-03.
    const moves = [-0.54, 5.98, 0.69, -1.33, -0.67, -3.74, -2.5, -0.38, 0.46, 3.24, -7.35, -1.9];
    const line = computeLine(reactionsFromMoves(moves));
    expect(line.value).toBe(2.2);
    expect(line.reactions.map((r) => r.movePct)).toEqual(moves.slice(-8));
  });

  it("rounds the median half away from zero: WMT 5.475 → 5.5, PENG 13.225 → 13.2", () => {
    expect(computeLine(reactionsFromMoves([-6.53, -0.5, -4.49, 6.46, -1.38, -7.27, -9.15, 3.0])).value).toBe(5.5);
    expect(computeLine(reactionsFromMoves([7.95, -10.3, 10.57, -16.02, -13.78, 13.37, 25.13, 13.08])).value).toBe(13.2);
  });

  it("needs at least 4 reactions", () => {
    expect(computeLine(reactionsFromMoves([1, -2, 3])).value).toBeNull();
    expect(computeLine(reactionsFromMoves([1, -2, 3])).reactions).toHaveLength(3);
    expect(computeLine(reactionsFromMoves([1, -2, 3, -4])).value).toBe(2.5);
    expect(computeLine([]).value).toBeNull();
  });
});
