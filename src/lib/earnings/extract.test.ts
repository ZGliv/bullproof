import { describe, expect, it } from "vitest";
import {
  earningsReleaseScore,
  htmlToText,
  isNumericLine,
  mdnaText,
  parseFilingIndex,
  pressReleaseExhibit,
  pressReleaseText,
  wordCount,
} from "./extract";

// Excerpts of real EDGAR documents (LSTR, AAPL, PENG, KRMD, GXO filings from 2026).

const LSTR_EXHIBIT = `<DOCUMENT>
<TYPE>EX-99.1
<SEQUENCE>2
<FILENAME>d176512dex991.htm
<DESCRIPTION>EX-99.1
<TEXT>
<HTML><HEAD>
<TITLE>EX-99.1</TITLE>
</HEAD>
 <BODY BGCOLOR="WHITE" STYLE="line-height:Normal">
<Center><DIV STYLE="width:8.5in" align="left">
 <P STYLE="margin-top:0pt; margin-bottom:0pt; font-size:10pt" ALIGN="right"><B>Exhibit 99.1 </B></P> <P STYLE="font-size:12pt;margin-top:0pt;margin-bottom:0pt">&nbsp;</P>
<TABLE CELLSPACING="0" CELLPADDING="0" WIDTH="100%" BORDER="0">
<TR STYLE="page-break-inside:avoid ; font-family:Times New Roman; font-size:10pt">
<TD VALIGN="top"><U>For Immediate Release</U></TD>
<TD VALIGN="bottom">&nbsp;&nbsp;</TD>
<TD VALIGN="top" ALIGN="right">October&nbsp;27, 2026</TD></TR>
</TABLE> <P STYLE="margin-top:24pt; margin-bottom:0pt; font-size:10pt" ALIGN="center"><B>LANDSTAR SYSTEM REPORTS THIRD QUARTER </B></P>
<P STYLE="margin-top:12pt; margin-bottom:0pt; font-size:10pt" ALIGN="center"><B>REVENUE OF $1.512B AND EARNINGS PER SHARE OF $1.42 </B></P>
<P STYLE="margin-top:12pt; margin-bottom:0pt; font-size:10pt">Jacksonville, FL - Landstar System, Inc. (NASDAQ: LSTR) (&#8220;Landstar&#8221; or the &#8220;Company&#8221;) today reported its financial results for the
2026 third quarter. The Company reported total revenue of $1.512&nbsp;billion in the 2026 third quarter, an increase of 25% as compared to revenue of $1.205&nbsp;billion in the 2025 third quarter.</P>
<TABLE CELLSPACING="0" CELLPADDING="0" WIDTH="100%" BORDER="0">
<TR><TD VALIGN="bottom" COLSPAN="2" ALIGN="center"><B>3Q 2026</B></TD><TD VALIGN="bottom" COLSPAN="2" ALIGN="center"><B>3Q 2025</B></TD><TD><B>Change&nbsp;($)</B></TD><TD><B>Change&nbsp;(%)</B></TD></TR>
<TR><TD VALIGN="top"><P>Revenue</P></TD><TD NOWRAP>$</TD><TD NOWRAP ALIGN="right">1,511,787</TD><TD NOWRAP>$</TD><TD NOWRAP ALIGN="right">1,205,406</TD><TD NOWRAP>$</TD><TD NOWRAP ALIGN="right">306,381</TD><TD NOWRAP ALIGN="right">25.4</TD><TD NOWRAP>%&nbsp;</TD></TR>
</TABLE>
<P STYLE="margin-top:12pt" ALIGN="center">LANDSTAR SYSTEM/2</P>
</DIV></Center>
</BODY></HTML>
</TEXT>
</DOCUMENT>`;

const AAPL_INLINE_XBRL = `<html><head><title>aapl-20260926</title></head><body>
<div style="display:none"><ix:header><ix:hidden><ix:nonNumeric contextRef="c-1" name="dei:AmendmentFlag" id="f-51">false</ix:nonNumeric><ix:nonNumeric contextRef="c-1" name="dei:DocumentFiscalYearFocus" id="f-52">2026</ix:nonNumeric><ix:nonNumeric contextRef="c-1" name="dei:DocumentFiscalPeriodFocus" id="f-53">FY</ix:nonNumeric><ix:nonNumeric contextRef="c-1" name="dei:EntityCentralIndexKey" id="f-54">0000320193</ix:nonNumeric></ix:hidden><ix:resources><xbrli:context id="c-1"><xbrli:period><xbrli:startDate>2025-09-28</xbrli:startDate><xbrli:endDate>2026-09-26</xbrli:endDate></xbrli:period></xbrli:context></ix:resources></ix:header></div>
<div style="text-align:justify"><span style="font-weight:700">Item 7. Management&#8217;s Discussion and Analysis of Financial Condition and Results of Operations</span></div>
<div><span>The Company&#8217;s total net sales were <ix:nonFraction unitRef="usd" contextRef="c-1" decimals="-6" name="us-gaap:Revenues" scale="6" id="f-60">416,161</ix:nonFraction> million.</span></div>
</body></html>`;

describe("htmlToText", () => {
  it("strips the SGML wrapper, drops numeric tables and keeps narrative as whole paragraphs", () => {
    const text = htmlToText(LSTR_EXHIBIT);
    expect(text).not.toMatch(/<TYPE>|d176512dex991|EX-99\.1\n/);
    expect(text).toContain("LANDSTAR SYSTEM REPORTS THIRD QUARTER");
    // The source wraps "for the\n2026 third quarter" inside one <P>; it must stay one line.
    expect(text).toContain("today reported its financial results for the 2026 third quarter. The Company reported");
    expect(text).toContain("$1.512 billion");
    expect(text).not.toContain("1,511,787");
    expect(text).not.toContain("LANDSTAR SYSTEM/2");
    expect(text).toContain("“Landstar”");
  });

  it("drops the hidden inline-XBRL header but keeps visible tagged values", () => {
    const text = htmlToText(AAPL_INLINE_XBRL);
    expect(text).not.toMatch(/AmendmentFlag|0000320193|2025-09-28|false/);
    expect(text).not.toContain("aapl-20260926");
    expect(text.split("\n")).toEqual([
      "Item 7. Management’s Discussion and Analysis of Financial Condition and Results of Operations",
      "The Company’s total net sales were 416,161 million.",
    ]);
  });
});

describe("isNumericLine", () => {
  it("flags table rows that lost their markup", () => {
    expect(isNumericLine("Revenue $ 1,511,787 $ 1,205,406 $ 306,381 25.4 %")).toBe(true);
    expect(isNumericLine("Net income (loss) $ (2,992) $ 824 $ (3,816) N.M.")).toBe(true);
    expect(isNumericLine("Depletion of full cost proved oil and natural gas properties 5,339 5,560 (221) (4.0) %")).toBe(true);
  });

  it("keeps sentences with figures", () => {
    expect(
      isNumericLine("Diluted earnings per share was $2.10, up 14 percent year over year, and included a favorable impact of $0.05."),
    ).toBe(false);
  });
});

const AAPL_RELEASE_TEXT = [
  "Exhibit 99.1",
  "Apple reports fourth quarter results",
  "September quarter records for total company revenue, iPhone revenue, and EPS",
  "Services revenue reaches new all-time high",
  "CUPERTINO, CALIFORNIA — Apple® today announced financial results for its fiscal 2026 fourth quarter ended September 26, 2026. The Company posted quarterly revenue of $114.5 billion, up 12 percent year over year.",
  "Apple will provide live streaming of its Q4 2026 financial results conference call beginning at 2:00 p.m. PT on November 2, 2026, at apple.com/investor/earnings-call.",
  "This press release contains forward-looking statements, within the meaning of the Private Securities Litigation Reform Act of 1995. These forward-looking statements include without limitation those about payment of the Company’s quarterly dividend and future business plans.",
  "Apple revolutionized personal technology with the introduction of the Macintosh in 1984.",
  "Press Contact:",
  "Nick Leahy",
].join("\n");

const PENG_RELEASE_TEXT = [
  "Exhibit 99.1",
  "Press Release",
  "FOR IMMEDIATE RELEASE",
  "Penguin Solutions Announces",
  "Fourth-Quarter and Full-Year Fiscal 2026 Results",
  "Fremont, Calif. – October 6, 2026 – Penguin Solutions, Inc. (“Penguin Solutions,” “Penguin,” “we,” “us,” “our,” or the “Company”) (Nasdaq: PENG), the AI Factory Platform Company, today announced financial results for its fiscal fourth quarter and full year 2026 ended August 28, 2026.",
  "Fourth Quarter Financial Highlights",
  "•Record Non-GAAP operating income of $90 million, up 129% year over year",
  "(2)Non-GAAP represents GAAP excluding the impact of certain activities. Further information regarding the Company’s use of non-GAAP measures and reconciliations between GAAP and non-GAAP measures are included within this press release.",
  "Business Outlook",
  "As of October 6, 2026, Penguin Solutions is providing the following financial outlook for fiscal year 2027:",
  "Gross margin 27% +/- 2% 1% (A) 28% +/- 2%",
  "Fourth Quarter and Full-Year Fiscal 2026 Earnings Conference Call and Webcast Details",
  "made available on the Quarterly Results page after the call concludes. An archived version of the webcast will be available on the Penguin Solutions investor relations website for approximately one year after the webcast date.",
  "Use of Forward-Looking Statements",
  "These statements can be identified by the fact that they do not relate strictly to historical or current facts. Forward-looking statements often use words such as “anticipate,” “target,” “expect,” “estimate,” “intend,” “plan,” “goal,” “believe,” “could,” and other similar expressions.",
  "About Penguin Solutions",
].join("\n");

describe("pressReleaseText", () => {
  it("keeps the headline and narrative and stops before the safe harbor and company profile", () => {
    const { text } = pressReleaseText(AAPL_RELEASE_TEXT);
    expect(text.startsWith("Apple reports fourth quarter results\n")).toBe(true);
    expect(text).toContain("posted quarterly revenue of $114.5 billion");
    expect(text).toContain("conference call beginning at 2:00 p.m. PT");
    expect(text).not.toMatch(/Exhibit 99|Private Securities|Macintosh|Press Contact|Leahy/);
  });

  it("drops cover noise, footnotes, outlook-table rows and everything from the call details on", () => {
    const { text } = pressReleaseText(PENG_RELEASE_TEXT);
    expect(text.split("\n").slice(0, 2)).toEqual(["Penguin Solutions Announces", "Fourth-Quarter and Full-Year Fiscal 2026 Results"]);
    expect(text).toContain("Record Non-GAAP operating income of $90 million");
    expect(text).toContain("providing the following financial outlook for fiscal year 2027");
    expect(text).not.toMatch(/Exhibit 99|FOR IMMEDIATE|\(2\)Non-GAAP|Gross margin 27%|archived version|anticipate|About Penguin/);
  });

  it("appends outlook paragraphs that fall outside the narrative budget", () => {
    const narrative = PENG_RELEASE_TEXT.split("\n").slice(0, 8).join("\n");
    const outlook = [
      "Raising Fiscal 2027 Outlook",
      "Penguin Solutions now expects fiscal 2027 net sales of approximately $2.43 billion at the midpoint, representing growth of approximately 40%, plus or minus 10 percentage points. The Company also expects diluted EPS of $3.50 and non-GAAP diluted EPS of $4.45.",
    ].join("\n");
    const { text, words, outlookWords } = pressReleaseText(`${narrative}\n${outlook}`, 30, 400);
    expect(text).toContain("now expects fiscal 2027 net sales of approximately $2.43 billion");
    expect(outlookWords).toBeGreaterThan(30);
    expect(words).toBeLessThanOrEqual(30 + 400);
  });
  it("drops page-one contact lines and keeps sections whose headings mention the balance sheet", () => {
    const jpm = [
      "JPMORGANCHASE REPORTS THIRD-QUARTER 2026 NET INCOME OF $15.3 BILLION ($5.57 PER SHARE), NET INCOME OF $15.8 BILLION ($5.75 PER SHARE) EXCLUDING A SIGNIFICANT ITEM",
      "n Average loans up 10% YoY and 2% QoQ; average deposits up 8% YoY and 2% QoQ",
      "Investor Contact: Mikael Grubb (212) 270-2479 Media Contact: Joseph Evangelisti (212) 270-7438",
      "Note: Totals may not sum due to rounding. 1 Percentage comparisons are for the third quarter of 2026 versus the prior-year third quarter, unless otherwise specified.",
      "Discussion of Results:",
      "Net revenue was $50.9 billion, up 8%. Net interest income was $27.1 billion, up 13%. Noninterest revenue was $23.8 billion, up 3%.",
      "Balance Sheet and Liquidity",
      "• Operating cash flow of $19.7 billion, an increase of $1.4 billion",
      "Walmart Inc. Condensed Consolidated Statements of Income (Unaudited)",
      "NM: Not Meaningful",
    ].join("\n");
    const { text } = pressReleaseText(jpm);
    expect(text).toContain("Net revenue was $50.9 billion, up 8%.");
    expect(text).toContain("Operating cash flow of $19.7 billion");
    expect(text).not.toMatch(/Mikael Grubb|Totals may not sum|Statements of Income|Not Meaningful/);
  });
});

describe("earningsReleaseScore", () => {
  it("ranks the results release above a same-day officer-appointment exhibit", () => {
    const cfo = [
      "Exhibit 99.1",
      "Press Release",
      "Penguin Solutions Appoints Stephen Cumming as Senior Vice President and Chief Financial Officer to Support Accelerated Growth",
      "Penguin separately reports fourth quarter and fiscal 2026 results with multiple company records and raises full year fiscal 2027 outlook",
      "FREMONT, Calif. – October 6, 2026 – Penguin Solutions, Inc. (Nasdaq: PENG), the AI Factory Platform Company, today announced the appointment of Stephen Cumming as Senior Vice President and Chief Financial Officer, effective immediately.",
    ].join("\n");
    const results = [
      "Penguin Solutions Announces",
      "Fourth-Quarter and Full-Year Fiscal 2026 Results",
      "Fremont, Calif. – October 6, 2026 – Penguin Solutions, Inc. today announced financial results for its fiscal fourth quarter and full year 2026 ended August 28, 2026.",
      "Fourth Quarter Financial Highlights",
      "•Record net sales of $567 million, up 68% year over year",
      "•Record net income of $93 million, up 888% year over year",
      "Fiscal 2026 Highlights",
    ].join("\n");
    expect(earningsReleaseScore(results)).toBeGreaterThan(earningsReleaseScore(cfo));
    expect(earningsReleaseScore(cfo.split("\n").slice(0, 3).join("\n"))).toBe(0);
  });
});

// Table of contents from EPM's 10-Q, body from KRMD's 10-Q (both real lines).
const TOC = [
  "PART I . FINANCIAL INFORMATION 4",
  "Item 1. Condensed Consolidated Financial Statements (Unaudited) 4",
  "Item 2. Management’s Discussion and Analysis of Financial Condition and Results of Operations 25",
  "Item 3. Quantitative and Qualitative Disclosures about Market Risks 34",
  "Item 4. Controls and Procedures 34",
  "PART II. OTHER INFORMATION 35",
  "Item 1. Legal Proceedings 35",
];
const KRMD_NARRATIVE =
  "Total net revenues increased $1.2 million, or 11.2%, to $11.6 million for the three months ended September 30, 2026, as compared to $10.4 million in the prior year period.";

function krmdQuarterly(resultsParagraphs: number): string {
  return [
    ...TOC,
    "The Company has been and may again become involved in legal proceedings, claims and litigation arising in the ordinary course of business.",
    "- 15 -",
    "PART I — ITEM 2. MANAGEMENT’S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS",
    "This Quarterly Report on Form 10-Q contains, and our officers and representatives may from time to time make, certain “forward-looking” statements (as such term is defined in the Private Securities Litigation Reform Act of 1995).",
    "OVERVIEW",
    "The Company ended the third quarter of 2026 with $11.6 million in net revenues; an 11.2% increase compared to $10.4 million in the same period last year.",
    "RESULTS OF OPERATIONS",
    "Three months ended September 30, 2026, compared to September 30, 2025",
    "Net Revenues",
    "The following table summarizes our net revenues for the three months ended September 30, 2026, and 2025:",
    ...Array.from({ length: resultsParagraphs }, () => KRMD_NARRATIVE),
    "LIQUIDITY AND CAPITAL RESOURCES",
    "Our inventory position was $4.7 million at September 30, 2026, which reflects an increase of $1.0 million from December 31, 2025, due to expected future demand from our customers.",
    "ITEM 3. QUANTITATIVE AND QUALITATIVE DISCLOSURES ABOUT MARKET RISK",
    "Not applicable.",
    "ITEM 4. CONTROLS AND PROCEDURES",
  ].join("\n");
}

describe("mdnaText", () => {
  it("skips the table of contents, accepts a PART I prefix and keeps results of operations only", () => {
    const text = mdnaText(krmdQuarterly(8), "10-Q");
    expect(text.startsWith("Three months ended September 30, 2026, compared to September 30, 2025")).toBe(true);
    expect(text).toContain("The following table summarizes our net revenues");
    expect(text).toContain(KRMD_NARRATIVE);
    expect(text).not.toMatch(/legal proceedings|inventory position|forward-looking|ended the third quarter/);
  });

  it("falls back to the whole MD&A when results of operations is under 200 words", () => {
    const text = mdnaText(krmdQuarterly(1), "10-Q");
    expect(text).toContain("The Company ended the third quarter of 2026 with $11.6 million in net revenues");
    expect(text).toContain(KRMD_NARRATIVE);
    expect(text).toContain("Our inventory position was $4.7 million");
    expect(text).not.toMatch(/Not applicable|forward-looking/);
  });

  it("truncates to the word budget and returns empty text without an MD&A", () => {
    expect(wordCount(mdnaText(krmdQuarterly(20), "10-Q", 100))).toBeLessThanOrEqual(100);
    expect(mdnaText("Item 1. Financial Statements\nSome text", "10-Q")).toBe("");
  });

  it("uses Item 7 for a 10-K and stops at Item 7A", () => {
    const text = mdnaText(
      [
        "Item 7. Management’s Discussion and Analysis of Financial Condition and Results of Operations",
        ...Array.from({ length: 12 }, () => "Europe net sales increased during 2026 compared to 2025 primarily due to higher net sales of iPhone, Services and Mac."),
        "Item 7A. Quantitative and Qualitative Disclosures About Market Risk",
        "The Company is exposed to economic risk from interest rates and foreign exchange rates. The Company uses various strategies to manage these risks; however, they may still impact the Company’s consolidated financial statements.",
      ].join("\n"),
      "10-K",
    );
    expect(text).toContain("Europe net sales increased");
    expect(text).not.toContain("exposed to economic risk");
  });
});

const GXO_INDEX = `<table class="tableFile" summary="Document Format Files">
<tr><th scope="col">Seq</th><th scope="col">Description</th><th scope="col">Document</th><th scope="col">Type</th><th scope="col">Size</th></tr>
<tr><td scope="row">1</td><td scope="row">8-K</td><td scope="row"><a href="/ix?doc=/Archives/edgar/data/1852244/000185224426000051/gxo-20261103.htm">gxo-20261103.htm</a> &nbsp;&nbsp;<span style="color: green">iXBRL</span></td><td scope="row">8-K</td><td scope="row">32561</td></tr>
<tr class="evenRow"><td scope="row">2</td><td scope="row"></td><td scope="row"><a href="/Archives/edgar/data/1852244/000185224426000051/gxo2026q3earningsreleaseex.htm">gxo2026q3earningsreleaseex.htm</a></td><td scope="row">EX-99.1</td><td scope="row">442817</td></tr>
<tr><td scope="row">7</td><td scope="row"></td><td scope="row"><a href="/Archives/edgar/data/1852244/000185224426000051/gxo-20261103_g1.jpg">gxo-20261103_g1.jpg</a></td><td scope="row">GRAPHIC</td><td scope="row">136614</td></tr>
<tr><td scope="row">&nbsp;</td><td scope="row">Complete submission text file</td><td scope="row"><a href="/Archives/edgar/data/1852244/000185224426000051/0001852244-26-000051.txt">0001852244-26-000051.txt</a></td><td scope="row">&nbsp;</td><td scope="row">1171696</td></tr>
</table>`;

describe("filing index", () => {
  it("reads the document table and picks the exhibit by its TYPE column", () => {
    const docs = parseFilingIndex(GXO_INDEX);
    expect(docs.map((d) => d.type)).toEqual(["8-K", "EX-99.1", "GRAPHIC", ""]);
    expect(docs[0].url).toBe("https://www.sec.gov/Archives/edgar/data/1852244/000185224426000051/gxo-20261103.htm");
    expect(pressReleaseExhibit(docs)?.url).toBe(
      "https://www.sec.gov/Archives/edgar/data/1852244/000185224426000051/gxo2026q3earningsreleaseex.htm",
    );
  });

  it("prefers EX-99.1 over EX-99.01 over EX-99 and ignores other exhibits", () => {
    const doc = (type: string) => ({ type, description: "", url: `https://www.sec.gov/${type}` });
    expect(pressReleaseExhibit([doc("EX-99"), doc("EX-99.01")])?.type).toBe("EX-99.01");
    expect(pressReleaseExhibit([doc("EX-99.2"), doc("EX-99"), doc("EX-99.1")])?.type).toBe("EX-99.1");
    expect(pressReleaseExhibit([doc("EX-99.2"), doc("EX-10.1")])).toBeNull();
  });
});
