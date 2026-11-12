import { describe, expect, it } from "vitest";
import { firstResultsHeadline, isAboutCompany, isResultsHeadline } from "./headlines";

// Real Alpaca news headlines pulled on 2026-11-11.
const RESULTS = [
  "Corteva Reports Third-Quarter 2026 Results and Updates Full-Year Outlook",
  "Firefly Neuroscience Reports Third Quarter 2026 Financial Results",
  "Applied Aerospace & Defense, Inc. Reports Q3 2026 Financial Results",
  "AEVEX Corp. Announces Financial Results for Third Quarter 2026",
  "Anteris Technologies Reports Financial Results for the Third Quarter of 2026",
  "CAE Inc. Reports Second Quarter Fiscal 2027 Results and Raises Full-Year Outlook",
  "ODDITY Tech Reports Third Quarter 2026 Financial Results and Raises Full-Year Outlook",
  "EnerSys Reports Fiscal Second Quarter 2027 Financial Results",
  "EZCORP, Inc. Reports Fourth Quarter and Full Year 2026 Financial Results",
  "Tetra Tech Reports Strong Fourth Quarter and Fiscal Year 2026 Results",
  "Autodesk Reports Results for the Third Quarter of Fiscal Year 2027",
  "iBio, Inc. Reports Financial Results for First Quarter of Fiscal Year 2027",
  "Decisive Dividend Corporation Reports Financial Results for the Three and Nine Months Ended September 30, 2026",
  "d'Amico International Shipping Reports Nine-Month 2026 Financial Results",
  "Riskified Reports Strong Third Quarter of 2026 with Accelerating Revenue and Gross Profit Growth",
  "Teekay Tankers Reports Third Quarter 2026 Results and Declares Dividend",
  "Costco Wholesale Reports Strong Q4: Revenue, Earnings Beat Estimates",
  "Crude Oil Gains 2%; CoreWeave Posts Upbeat Q3 Results",
  "Gold Down 2%; TransDigm Group Posts Upbeat Earnings",
  "Corteva Q3 Adj. EPS $0.06 Misses $0.10 Estimate, Sales $1.590B Miss $1.764B Estimate",
  "Alvotech Q3 EPS $(0.23) Misses $(0.07) Estimate, Sales $111.600M Miss $119.037M Estimate",
  "A2Z Smart Techs Q3 Sales $10.932M Beat $7.868M Estimate",
  "Agi Q3 Net Income R$276.0mn, Up 31% YoY; Credit Portfolio R$38.8bn, Up 12%",
  "Caesarstone Q3 Adj EPS $(0.05) vs $(0.40) YoY; Rev $96.3mn vs $102.1mn YoY",
  "Reported Earlier, CitroTech Inc. Common Stock Q3 EPS $(0.10) Beats $(0.18) Estimate",
  "CORRECTION: Teekay Q3 EPS $0.68 Up From $0.34 YoY, Sales $368.925M Up From $228.485M YoY",
];

const NOT_RESULTS = [
  // Scheduling notices.
  "Applied Materials to Report Fourth Quarter and Fiscal 2026 Results on Nov. 12, 2026",
  "Intuit to Announce First-Quarter Fiscal Year 2027 Results on Nov. 19",
  "Alibaba Group Announces Date for September Quarter 2026 Financial Results",
  "Cisco Schedules First Quarter Fiscal Year 2027 Earnings Call",
  "Medtronic Schedules Second Quarter Fiscal Year 2027 Financial Results Announcement",
  "Duos Technologies Group Sets Third Quarter 2026 Earnings Call",
  "Ross Stores, Inc. Announces Third Quarter 2026 Earnings Release and Conference Call",
  "Solana Company Announces Third Quarter 2026 Earnings Release Date",
  "Dell Technologies to Hold Conference Call Nov. 24 to Discuss Third Quarter Fiscal 2027 Financial Results",
  "Lowe's Companies, Inc. to Host Third Quarter 2026 Earnings Conference Call on Nov. 18",
  "IZEA Announces Q3 2026 Earnings Results Conference Call",
  "Lument Finance Trust Announces Quarter-End Earnings Release and Investor Call Dates",
  // Transcripts, previews and analyst notes.
  "AGI Q3 2026 Earnings Call Transcript",
  "Applied Materials Earnings Due Thursday: What Investors Need to Know",
  "Corteva Earnings Are Imminent; These Most Accurate Analysts Revise Forecasts Ahead Of Earnings Call",
  "Digi International Likely To Report Higher Q4 Earnings; These Most Accurate Analysts Revise Forecasts Ahead Of Earnings Call",
  "Riskified Gears Up For Q3 Print; Here Are The Recent Forecast Changes From Wall Street's Most Accurate Analysts",
  "CoreWeave Earnings Prediction Market Preview: Can Michael Intrator Steady the Ship?",
  "Cisco Systems Has Suffered $145 Billion Wipeout. Will Earnings Change This?",
  "BofA Securities Raises Walmart Price Target to $139",
  "Gossamer Bio Analysts Slash Their Forecasts Following Q3 Results",
  "Traders Are Pricing a 13% Swing In RUM Group Ahead of Earnings",
  // Guidance-only lines, pre-announcements and other "results".
  "Corteva Sees FY2026 Adj EPS $0.76-$0.80 vs $1.07 Est",
  "CI&T Sees Q4 Sales $142.300M-$152.000M vs $148.763M Est",
  "AEVEX Raises FY2026 Sales Guidance from $700.000M-$720.000M to $820.000M-$840.000M vs $743.050M Est",
  "Bally's Corporation Announces Preliminary Third Quarter 2026 Financial Results",
  "China Automotive Systems Reports Preliminary Q3 EPS Sales Of 567,314 Units, Up 40.1% YoY; Announces $5M Stock Buyback",
  "Medtronic Reports Positive SPYRAL AFFIRM Study Results and FDA Labeling Update",
  "PepGen Reports Positive Early-Stage Trial Results for Myotonic Dystrophy Type 1 Treatment",
  "Collective Mining Announces New Drilling Results at Apollo Deposit",
  "OR Royalties Declares Fourth Quarter 2026 Dividend",
  "Disney Reaffirms Fiscal 2027 Adjusted EPS Growth Target",
  "Palo Alto Networks Reports AI Security Product Growth and Financial Outlook",
  "Anteris Technologies Global Corp. Files 10-Q/A Quarterly Report Amendment",
  // Market wraps that name other tickers.
  "Pinterest Posts Downbeat Q3 Results, Joins Intel, Roblox, Twilio And Other Big Stocks Moving Lower In Friday’s Pre-Market Session",
  "Vylor, Franco-Nevada On Deck Wednesday As New Coverage, Gold Prices Face Test",
  "Tech Stocks Add Over $500 Billion as CoreWeave's Blockbuster Results Rescue AI Rally",
];

describe("isResultsHeadline", () => {
  it.each(RESULTS)("recognises results: %s", (headline) => {
    expect(isResultsHeadline(headline)).toBe(true);
  });

  it.each(NOT_RESULTS)("rejects: %s", (headline) => {
    expect(isResultsHeadline(headline)).toBe(false);
  });

  it("rejects empty text", () => {
    expect(isResultsHeadline("   ")).toBe(false);
  });
});

describe("firstResultsHeadline", () => {
  // Real CTVA items around its 2026-11-11 after-close release.
  const ctva = [
    { createdAt: "2026-11-11T23:02:15Z", headline: "Corteva Reports Third-Quarter 2026 Results and Updates Full-Year Outlook" },
    { createdAt: "2026-11-11T21:34:25Z", headline: "Corteva Q3 Adj. EPS $0.06 Misses $0.10 Estimate, Sales $1.590B Miss $1.764B Estimate" },
    { createdAt: "2026-11-11T21:33:27Z", headline: "Corteva Sees FY2026 Adj EPS $0.76-$0.80 vs $1.07 Est" },
    {
      createdAt: "2026-11-11T11:53:38Z",
      headline: "Corteva Earnings Are Imminent; These Most Accurate Analysts Revise Forecasts Ahead Of Earnings Call",
    },
    { createdAt: "2026-11-10T20:30:30Z", headline: "Vylor, Franco-Nevada On Deck Wednesday As New Coverage, Gold Prices Face Test" },
  ];

  it("returns the earliest results headline after the cut-off, ignoring guidance and previews", () => {
    expect(firstResultsHeadline(ctva, "2026-11-10T21:00:00Z")).toEqual({
      at: "2026-11-11T21:34:25Z",
      headline: "Corteva Q3 Adj. EPS $0.06 Misses $0.10 Estimate, Sales $1.590B Miss $1.764B Estimate",
    });
  });

  it("only counts items strictly after the cut-off", () => {
    expect(firstResultsHeadline(ctva, "2026-11-11T21:34:25Z")?.at).toBe("2026-11-11T23:02:15Z");
    expect(firstResultsHeadline(ctva, "2026-11-11T23:02:15Z")).toBeNull();
  });

  it("returns null when nothing qualifies", () => {
    expect(firstResultsHeadline([], "2026-11-10T21:00:00Z")).toBeNull();
    expect(firstResultsHeadline([{ createdAt: "bad", headline: ctva[1].headline }], "2026-11-10T21:00:00Z")).toBeNull();
  });
});

describe("isResultsHeadline: dated flashes", () => {
  it("accepts a flash that names the year, but not guidance that does", () => {
    expect(isResultsHeadline("Acme Q3 2026 EPS $1.10 Beats $1.00 Estimate")).toBe(true);
    expect(isResultsHeadline("Acme Q3 FY26 Adj. EPS $1.10 Beats $1.00 Estimate")).toBe(true);
    expect(isResultsHeadline("Acme Sees Q4 2026 EPS $1.10-$1.20")).toBe(false);
  });
});

describe("isAboutCompany", () => {
  // Real headlines (Alpaca, 2026-11-11) with the issuer's Alpha Vantage ticker and name.
  const OWN: [string, string, string][] = [
    ["Corteva Reports Third-Quarter 2026 Results and Updates Full-Year Outlook", "CTVA", "CORTEVA INCORPORATED"],
    ["Firefly Neuroscience Reports Third Quarter 2026 Financial Results", "AIFF", "FIREFLY NEUROSCIENCE INCORPORATED"],
    [
      "Applied Aerospace & Defense, Inc. Reports Q3 2026 Financial Results",
      "AADX",
      "APPLIED AEROSPACE & DEFENSE INCORPORATED",
    ],
    ["AEVEX Corp. Announces Financial Results for Third Quarter 2026", "AVEX", "AEVEX CORPORATION"],
    [
      "Anteris Technologies Reports Financial Results for the Third Quarter of 2026",
      "AVR",
      "ANTERIS TECHNOLOGIES GLOBAL CORPORATION",
    ],
    ["CAE Inc. Reports Second Quarter Fiscal 2027 Results and Raises Full-Year Outlook", "CAE", "CAE INCORPORATED"],
    ["EZCORP, Inc. Reports Fourth Quarter and Full Year 2026 Financial Results", "EZPW", "EZCORP INCORPORATED"],
    ["iBio, Inc. Reports Financial Results for First Quarter of Fiscal Year 2027", "IBIO", "IBIO INCORPORATED"],
    ["Costco Wholesale Reports Strong Q4: Revenue, Earnings Beat Estimates", "COST", "COSTCO WHOLESALE CORPORATION"],
    ["Corteva Q3 Adj. EPS $0.06 Misses $0.10 Estimate, Sales $1.590B Miss $1.764B Estimate", "CTVA", "CORTEVA INCORPORATED"],
    ["Alvotech Q3 EPS $(0.23) Misses $(0.07) Estimate, Sales $111.600M Miss $119.037M Estimate", "ALVO", "ALVOTECH"],
    [
      "Reported Earlier, CitroTech Inc. Common Stock Q3 EPS $(0.10) Beats $(0.18) Estimate",
      "CITR",
      "CITROTECH INCORPORATED",
    ],
    ["CORRECTION: Teekay Q3 EPS $0.68 Up From $0.34 YoY, Sales $368.925M Up From $228.485M YoY", "TK", "TEEKAY CORPORATION LIMITED"],
    [
      "Cisco Systems Q4 Adj. EPS $1.22 Beats $1.17 Estimate, Sales $17.252B Beat $16.823B Estimate",
      "CSCO",
      "CISCO SYSTEMS INCORPORATED",
    ],
  ];
  it.each(OWN)("%s is about %s", (headline, ticker, name) => {
    expect(isAboutCompany(headline, ticker, name)).toBe(true);
  });

  it("finds the subject after a market-wrap clause", () => {
    expect(isAboutCompany("Gold Down 2%; TransDigm Group Posts Upbeat Earnings", "TDG", "TRANSDIGM GROUP INCORPORATED")).toBe(true);
    expect(isAboutCompany("Gold Down 2%; TransDigm Group Posts Upbeat Earnings", "GLD", "SPDR GOLD TRUST")).toBe(false);
  });

  it("rejects other companies' results that mention this company", () => {
    const cisco = (headline: string) => isAboutCompany(headline, "CSCO", "CISCO SYSTEMS INCORPORATED");
    expect(cisco("Cisco Rival Arista Networks Reports Second Quarter 2026 Results")).toBe(false);
    expect(cisco("Arista Networks Posts Upbeat Q2 Results, Cisco Shares Slip")).toBe(false);
    expect(cisco("San Francisco-Based Fastly Reports Third Quarter 2026 Results")).toBe(false);
    expect(isAboutCompany("Nvidia Supplier TSMC Reports Third Quarter 2026 Results", "NVDA", "NVIDIA CORPORATION")).toBe(false);
    // "eli" inside "delivers" is not Eli Lilly.
    expect(isAboutCompany("Novo Nordisk Delivers Q3 Results", "LLY", "ELI LILLY AND COMPANY")).toBe(false);
  });
});
