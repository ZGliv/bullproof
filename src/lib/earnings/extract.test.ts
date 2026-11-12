import { describe, expect, it } from "vitest";
import {
  earningsReleaseScore,
  htmlToText,
  isPreliminaryRelease,
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

  it("drops cover noise, footnotes, unlabelled figure residue and everything from the call details on", () => {
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

// Real lines from 2026 filings: CSCO 10-K MD&A, WFC 10-K, and the HPQ, ROST, CSCO, TJX press releases.
const CSCO_MDNA = [
  "Item 7. Management’s Discussion and Analysis of Financial Condition and Results of Operations",
  "Forward-Looking Statements",
  "This Annual Report on Form 10-K, including this Management’s Discussion and Analysis of Financial Condition and Results of Operations, contains forward-looking statements regarding future events and our future results that are subject to the safe harbors created under the Securities Act of 1933, as amended (the “Securities Act”), and the Securities Exchange Act of 1934, as amended (the “Exchange Act”). All statements other than statements of historical facts are statements that could be deemed forward-looking statements. These statements are based on current expectations, estimates, forecasts, and projections about the industries in which we operate and the beliefs and assumptions of our management. Words such as “expects,” “anticipates,” “targets,” “goals,” “projects,” “intends,” “plans,” “believes,” “momentum,” “seeks,” “estimates,” “continues,” “endeavors,” “strives,” “may,” variations of such words, and similar expressions are intended to identify such forward-looking statements. In addition, any statements that refer to projections of our future financial performance, our anticipated growth and trends in our businesses, and other characterizations of future events or circumstances are forward-looking statements. Readers are cautioned that these forward-looking statements are only predictions and are subject to risks, uncertainties, and assumptions that are difficult to predict, including those under “Part I, Item 1A. Risk Factors,” and elsewhere herein. Therefore, actual results may differ materially and adversely from those expressed in any forward-looking statements. We undertake no obligation to revise or update any forward-looking statements for any reason.",
  "OVERVIEW",
  "Cisco designs and sells a broad range of technologies including hardware, software, and artificial intelligence (AI) powered digital infrastructure to power, help secure, and draw insights from the Internet. We are incorporating AI into our product portfolios across networking, security, collaboration and observability, as well as integrating our products more tightly together into a platform. We are simplifying how our technology is delivered, managed and optimized and helping customers maximize the business value of their technology investments.",
  "A summary of our results is as follows (in millions, except percentages and per-share amounts):",
  "MANAGEMENT’S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS (Continued)",
  "RESULTS OF OPERATIONS",
  "A discussion regarding our financial condition and results of operations for fiscal 2026 compared to fiscal 2025 is presented below. A discussion regarding our financial condition and results of operations for fiscal 2025 compared to fiscal 2024 can be found under Item 7 in our Annual Report on Form 10-K for the fiscal year ended July 26, 2025, filed with the SEC on September 3, 2025.",
  "Revenue",
  "The following table presents the breakdown of revenue between product and services (in millions, except percentages):",
  "Amounts may not sum and percentages may not recalculate due to rounding.",
  "We manage our business primarily on a geographic basis, organized into three geographic segments. Our revenue, which includes product and services for each segment, is summarized in the following table (in millions, except percentages):",
  "Amounts may not sum and percentages may not recalculate due to rounding.",
  "Total revenue in fiscal 2026 increased by 12% compared with fiscal 2025. Product revenue increased by 16% and services revenue was flat. Our total revenue reflected growth across each of our geographic segments.",
  "In addition to the impact of macroeconomic factors, including the IT spending environment and the level of spending by government entities, revenue by segment in a particular period may be significantly impacted by the timing of revenue recognition for complex transactions with multiple performance obligations. In addition, certain customers tend to make large and sporadic purchases, and the revenue related to these transactions may also be affected by the timing of revenue recognition, which in turn would impact the revenue of the relevant segment.",
  "CISCO SYSTEMS, INC.",
  "MANAGEMENT’S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS (Continued)",
  "Product Revenue by Segment",
  "The following table presents the breakdown of product revenue by segment (in millions, except percentages):",
  "Amounts may not sum and percentages may not recalculate due to rounding.",
  "Americas",
  "Product revenue in the Americas segment increased by 17%, with growth across each of our customer markets, led by the Service Provider and Cloud customer market which was largely driven by revenue from our AI Infrastructure solutions. From a country perspective, product revenue increased in the United States, Canada and Mexico by 18%, 8% and 25%, respectively, partially offset by a decline in Brazil of 10%.",
  "EMEA",
  "Product revenue in the EMEA segment increased by 15%, driven by growth across each of our customer markets. From a country perspective, product revenue increased in the United Kingdom, Germany, and France by 31%, 16% and 11%, respectively.",
  "CISCO SYSTEMS, INC.",
  "MANAGEMENT’S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS (Continued)",
  "LIQUIDITY AND CAPITAL RESOURCES",
  "The following sections discuss the effects of changes in our balance sheet, our capital allocation strategy including stock repurchase program and dividends, our contractual obligations, and certain other commitments and activities on our liquidity and capital resources.",
].join("\n");
const WFC_MDNA = [
  "ITEM 7. MANAGEMENT’S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS",
  "Information in response to this Item 7 can be found in the 2025 Annual Report to Shareholders under “Financial Review.” That information is incorporated into this item by reference.",
].join("\n");
const HPQ_TAIL = [
  "For fiscal 2026, HP is also raising its estimate of free cash flow to be in the range of $3.0 to $3.2 billion.",
  "More information on HP's earnings, including additional financial analysis and an earnings overview presentation, is available on HP's Investor Relations website at https://investor.hp.com.",
  "HP's FY26 Q3 earnings conference call is accessible via audio webcast at www.hp.com/investor/2026Q3Webcast.",
  "About HP Inc.",
  "HP Inc. (NYSE: HPQ) is a global technology leader redefining the Future of Work. Operating in more than 180 countries, HP delivers innovative and AI-powered devices, software, services and subscriptions that drive business growth and professional fulfillment. For more information, please visit https://www.hp.com.",
  "",
].join("\n");
const ROST_TAIL = [
  "Mr. Conroy commented, “Looking ahead, we exited the second quarter with building momentum and are excited for the plans we have in place entering the Fall season. Despite facing significantly more challenging year-over-year comparisons in the back half, we are raising our outlook for both the third and fourth quarters. Comparable store sales are now expected to increase 6% to 7% in the third quarter and 4% to 5% in the fourth quarter. If the second half of 2026 performs in line with these sales projections, our earnings per share ranges for the third and fourth quarters are projected to be $1.75 to $1.83 and $2.17 to $2.26, respectively.”",
  "Mr. Conroy continued, “Based on our strong first half results and our updated second half guidance, we are increasing our 2026 fiscal year earnings per share projections to be in the range of $8.61 to $8.77, which again includes an approximate $0.60 earnings per share benefit from IEEPA tariff refunds recognized in the second quarter. From a store growth perspective, we continue to be encouraged by the success of our expansion strategy across both new and existing markets. As a result, we are increasing our 2026 new store opening plan to 115 locations, consisting of approximately 90 Ross Dress for Less and 25 dd’s DISCOUNTS stores.”",
  "Mr. Conroy concluded, “The year is off to a very strong start with the entire organization executing at a high level. As our efforts to improve topline growth continue, we remain focused on disciplined, consistent execution across the business. Moving forward, we believe we are well positioned to capture additional market share and drive profitable growth over the long term.”",
  "The Company will host a conference call on Thursday, August 20, 2026 at 4:15 p.m. Eastern time to provide additional details concerning its second quarter results and management’s outlook for the second half and fiscal year 2026. A real-time audio webcast of the conference call will be available in the Investors section of the Company’s website, located at www.rossstores.com. An audio playback will be available at 201-612-7415, PIN #13762049 until 8:00 p.m. Eastern time on August 27, 2026, as well as on the Company’s website.",
  "Forward-Looking Statements: This press release and the related conference call remarks contain forward-looking statements regarding, without limitation, projected sales, costs and earnings, planned new store growth, capital expenditures, liquidity and other matters. These forward-looking statements reflect our then-current beliefs, plans, and estimates with respect to future events and our projected financial performance, operations, and competitive position, and they are subject to risks and uncertainties which could cause our actual results to differ materially from management’s current expectations. The words “plan,” “expect,” “target,” “anticipate,” “estimate,” “believe,” “forecast,” “projected,” “guidance,” “outlook,” “looking ahead,” and similar expressions identify forward-looking statements. Risk factors for Ross Dress for Less® (“Ross”) and dd’s DISCOUNTS® include without limitation, risk from adverse changes in the macroeconomic environment, government regulations and policies, geopolitical conditions and conflicts, and financial and credit markets; increased costs of fuel and other consumer necessities, continuing inflation and other external economic trends and events may have significant negative effects on consumer confidence, shopping behavior, and spending, and also on our costs; tariff increases (or threats of increases) and other changes and uncertainty in U.S. trade or tax policy regarding apparel, home-related merchandise, shoes, and other goods we sell that are produced in other countries; competitive pressures and the pace of change in the retailing industry; unexpected changes in the level of consumer spending or preferences; adverse or unseasonable weather may affect shopping patterns and consumer demand for seasonal apparel and other merchandise, and may result in temporary store closures and disruptions in deliveries of merchandise to our stores; our dependence on the market availability, quantity, and quality of attractive brand name merchandise at desirable discounts, and on the ability of our buyers to source and purchase merchandise to enable us to offer customers a wide assortment of merchandise at competitive prices; our need to expand in existing markets and enter new geographic markets in order to achieve growth; our need to obtain acceptable new store sites with favorable consumer demographics in order to achieve growth; our need to continually attract, train, and retain associates with the retail talent necessary to execute our off-price retail strategies, as well as labor shortages, increased turnover, or increased labor costs; our need to effectively manage our inventories, markdowns, and inventory shortage in order to achieve our planned gross margins; information or data security breaches, including cyberattacks on our transaction processing and computer information systems, including malware intrusion, data exfiltration, identity theft, and other types of cybersecurity threats, could disrupt our operations, result in theft or unauthorized disclosure of our confidential and valuable business information or credit card and other customer information, and could disrupt our operations, damage our reputation, increase our costs, and create significant legal exposure; disruptions in our supply chain or in our information systems could impact our ability to process sales and to deliver product to our stores in a timely and cost-effective manner; risks associated with importing and selling merchandise produced in other countries; damage to our corporate reputation or brands; a natural or man-made disaster in a region where we have a concentration of stores, offices, or a distribution center; consumer problems or legal issues involving the quality, safety, or authenticity of products we sell could harm our reputation, result in lost sales, and/or increase our costs; an adverse outcome in various legal, regulatory, or tax matters, could damage our reputation or brand and increase our costs. Other risk factors are set forth in our SEC filings including the Form 10-K for fiscal 2025 and fiscal 2026 Form 8-Ks and 10-Q on file with the SEC. The factors underlying our forecasts and plans are dynamic and subject to change. As a result, any forecasts or forward-looking statements speak only as of",
  "About Ross Stores, Inc.",
  "Ross Stores, Inc. is an S&P 500, Fortune 500, and Nasdaq 100 (ROST) company headquartered in Dublin, California, with fiscal 2025 revenues of $22.8 billion. Currently, the Company operates Ross Dress for Less® (\"Ross\"), the largest off-price apparel and home fashion chain in the United States with 1,952 locations in 44 states, the District of Columbia, Guam, and Puerto Rico. Ross offers first-quality, in-season, brand name and designer apparel, accessories, footwear, and home fashions for the entire family at savings of 20% to 60% off department and specialty store regular prices every day. The Company also operates 376 dd's DISCOUNTS® stores in 23 states that feature a more moderately-priced assortment of first-quality, in-season apparel, accessories, footwear, and home fashions for the entire family at savings of 20% to 70% off moderate department and discount store regular prices every day. Additional information is available at www.rossstores.com.",
  "Forward-Looking Statements: This press release and the related conference call remarks contain forward-looking statements regarding, without limitation, projected sales, costs and earnings, planned new store growth, capital expenditures, liquidity and other matters. These forward-looking statements reflect our then-current beliefs, plans, and estimates with respect to future events and our projected financial performance, operations, and competitive position, and they are subject to risks and uncertainties which could cause our actual results to differ materially from management’s current expectations. The words “plan,” “expect,” “target,” “anticipate,” “estimate,” “believe,” “forecast,” “projected,” “guidance,” “outlook,” “looking ahead,” and similar expressions identify forward-looking statements. Risk factors for Ross Dress for Less® (“Ross”) and dd’s DISCOUNTS® include without limitation, risk from adverse changes in the macroeconomic environment, government regulations and policies, geopolitical conditions and conflicts, and financial and credit markets; increased costs of fuel and other consumer necessities, continuing inflation and other external economic trends and events may have significant negative effects on consumer confidence, shopping behavior, and spending, and also on our costs; tariff increases (or threats of increases) and other changes and uncertainty in U.S. trade or tax policy regarding apparel, home-related merchandise, shoes, and other goods we sell that are produced in other countries; competitive pressures and the pace of change in the retailing industry; unexpected changes in the level of consumer spending or preferences; adverse or unseasonable weather may affect shopping patterns and consumer demand for seasonal apparel and other merchandise, and may result in temporary store closures and disruptions in deliveries of merchandise to",
  "",
].join("\n");
const CSCO_TOP = [
  "Robyn Blum Sami Badri",
  "Cisco Cisco",
  "CISCO REPORTS FOURTH QUARTER AND FISCAL YEAR 2026 EARNINGS",
  "News Summary:",
  "•Record top and bottom-line performance with double-digit growth in Q4 and FY 2026, exceeding the high end of guidance ranges",
  "•Exceptional FY 2026 operating margin results, demonstrating strong execution and operating efficiency",
  "•Broad-based, record high demand for Cisco technology with a networking supercycle underway",
].join("\n");
const TJX_TOP = [
  "Debra McConnell FOR IMMEDIATE RELEASE",
  "Global Communications Wednesday, August 19, 2026",
  "TJX REPORTS Q2 FY27 RESULTS; ABOVE-PLAN COMP SALES GROWTH OF 4%; PRETAX PROFIT MARGIN AND DILUTED EPS BOTH WELL ABOVE PLAN; INCREASES FULL YEAR FY27 PRETAX PROFIT MARGIN AND EPS GUIDANCE",
  "Adjusted results throughout this press release exclude a benefit from International Emergency Economic Powers Act (“IEEPA”) tariff refunds that are partially offset by related incremental compensation expense accruals (see below)",
].join("\n");
// ISRG's 2026-01-14 Exhibit 99.1: headline and first paragraph.
const ISRG_PRELIMINARY = "<div style=\"margin-top:9pt;text-align:center\"><font style=\"color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:700;line-height:120%\">INTUITIVE&#160;ANNOUNCES&#160;PRELIMINARY</font></div><div style=\"margin-bottom:6pt;text-align:center\"><font style=\"color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:700;line-height:120%\">FOURTH QUARTER&#160;AND FULL YEAR 2025&#160;RESULTS</font></div><div style=\"text-align:justify\"><font style=\"color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:120%\">SUNNYVALE, CALIF. January&#160;14, 2026 &#8211; Intuitive (the &#8220;Company&#8221;) (Nasdaq&#58; ISRG), a global technology leader in minimally invasive care and the pioneer of robotic-assisted surgery, today announced certain unaudited preliminary fourth quarter and full year 2025 financial results ahead of its presentation at the 44</font><font style=\"color:#000000;font-family:'Times New Roman',serif;font-size:6.5pt;font-weight:400;line-height:120%;position:relative;top:-3.5pt;vertical-align:baseline\">th</font><font style=\"color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:120%\"> Annual J.P. Morgan Healthcare Conference on January 14, 2026.</font></div>";

describe("mdnaText on real 10-Ks", () => {
  it("reads past the running page header to Liquidity and Capital Resources", () => {
    const text = mdnaText(CSCO_MDNA, "10-K");
    expect(text).toContain("Product revenue in the EMEA segment increased by 15%");
    expect(text).not.toMatch(/\(Continued\)|following sections discuss the effects/);
  });

  it("returns empty text when Item 7 only points to the annual report", () => {
    expect(mdnaText(WFC_MDNA, "10-K")).toBe("");
  });
});

describe("pressReleaseText on real releases", () => {
  it("starts at the headline, not at contact names above it", () => {
    expect(pressReleaseText(CSCO_TOP).text.split("\n")[0]).toBe("CISCO REPORTS FOURTH QUARTER AND FISCAL YEAR 2026 EARNINGS");
    expect(pressReleaseText(TJX_TOP).text.split("\n")[0]).toMatch(/^TJX REPORTS Q2 FY27 RESULTS/);
  });

  it("stops at an About heading that ends in Inc.", () => {
    const text = pressReleaseText(`HP Inc. Reports Fiscal 2026 Third Quarter Results\n${HPQ_TAIL}`).text;
    expect(text).toContain("raising its estimate of free cash flow");
    expect(text).not.toMatch(/About HP|global technology leader/);
  });

  it("keeps safe-harbor text out of both the narrative and the guidance lines", () => {
    const text = pressReleaseText(`Ross Stores Reports Strong Second Quarter Sales and Earnings Results\n${ROST_TAIL}`).text;
    expect(text).toContain("increasing our 2026 fiscal year earnings per share projections");
    expect(text).not.toMatch(/forward-looking|About Ross|S&P 500/);
  });
});

// AMAT 8-K EX-99.1 (2026-08-13), font and style noise stripped; colspans and a hidden column kept.
// The results table is cut to three of its rows, so its lead-in, not its size, must exclude it.
const AMAT_OUTLOOK_HTML = `<div>Applied Materials Announces Third Quarter 2026 Results</div>
<div>&#8220;We expect continued strong revenue growth in the second half of the calendar year, particularly in DRAM as well as leading-edge foundry-logic and advanced packaging.&#8221;</div>
<div>Results Summary</div><div><table><tr><td colspan="3"></td><td colspan="3">Q3 FY2026</td><td colspan="3"></td><td colspan="3">Q3 FY2025</td><td colspan="3"></td><td colspan="3">Change</td></tr><tr><td colspan="3"></td><td colspan="15">(In millions, except per share amounts and percentages)</td></tr><tr><td colspan="3">Revenue</td><td>$</td><td>9,115&#160;</td><td></td><td colspan="3"></td><td>$</td><td>7,302&#160;</td><td></td><td colspan="3"></td><td colspan="3">25%</td></tr><tr><td colspan="3">Gross margin</td><td colspan="2">50.3&#160;</td><td>%</td><td colspan="3"></td><td colspan="2">48.8&#160;</td><td>%</td><td colspan="3"></td><td colspan="3">1.5 points</td></tr><tr><td colspan="3">Net income</td><td>$</td><td>2,538&#160;</td><td></td><td colspan="3"></td><td>$</td><td>1,779&#160;</td><td></td><td colspan="3"></td><td colspan="3">43%</td></tr></table></div>
<div>Business Outlook</div><div>Applied&#8217;s total revenue and non-GAAP diluted EPS for the fourth quarter of fiscal 2026 are expected to be as follows&#58;</div><div><table><tr><td colspan="3"></td><td colspan="3"></td><td colspan="3"></td><td colspan="9">Q4 FY2026</td><td colspan="3" style="display:none"></td></tr><tr><td colspan="9">(In millions, except per share amounts)</td><td colspan="9"></td><td colspan="3" style="display:none"></td></tr><tr><td colspan="3">Total revenue</td><td colspan="3"></td><td colspan="3"></td><td>$</td><td>10,250&#160;</td><td></td><td colspan="3">+&#47;-</td><td>$</td><td>500&#160;</td><td></td><td colspan="3" style="display:none"></td></tr><tr><td colspan="3" style="display:none"></td></tr><tr><td colspan="3">Non-GAAP diluted EPS</td><td colspan="3"></td><td colspan="3"></td><td>$</td><td>4.02&#160;</td><td></td><td colspan="3">+&#47;-</td><td>$</td><td>0.20&#160;</td><td></td><td colspan="3" style="display:none"></td></tr></table></div>
<div>This outlook for non-GAAP diluted EPS excludes known charges related to completed acquisitions of $0.01 per share, includes the normalized tax benefit of share-based compensation of $0.01 per share and includes a net income tax benefit related to intra-entity intangible asset transfers of $0.05 per share.</div>`;

// CSCO 8-K EX-99.1 (2026-08-12) guidance reconciliation: real figures, simplified markup.
const CSCO_GUIDANCE_HTML = `<p>GAAP TO NON-GAAP GUIDANCE</p><table>
<tr><td colspan="2">Q1 FY 2027</td><td>Gross Margin</td><td>Operating Margin</td><td>Earnings per Share (1)</td></tr>
<tr><td colspan="2">GAAP</td><td>63% - 64%</td><td>28% - 29%</td><td>$1.08 - $1.10</td></tr>
<tr><td colspan="2">Share-based compensation expense</td><td>1.0%</td><td>4.5%</td><td>0.14</td></tr>
<tr><td colspan="2">Non-GAAP</td><td>65% - 66%</td><td>35.5% - 36.5%</td><td>$1.32 - $1.34</td></tr>
</table>`;

// WMT (2026-08-20) and INTU (2026-08-25) EX-99.1 guidance tables: real figures, simplified markup.
const WMT_GUIDANCE_HTML = `<p>Guidance</p><table>
<tr><td colspan="6">Third quarter</td></tr>
<tr><td colspan="3">Consolidated metric</td><td colspan="3">Q3 FY27</td></tr>
<tr><td colspan="3">Net sales (cc)</td><td colspan="3">Increase 3.0% to 3.75%</td></tr>
<tr><td colspan="3">Adjusted EPS</td><td colspan="3">$0.62 to $0.64</td></tr>
</table>`;
const INTU_GUIDANCE_HTML = `<p>Full Year Fiscal 2027 Guidance</p><table>
<tr><td colspan="3"></td><td colspan="6">GAAP</td><td colspan="6">Non-GAAP</td></tr>
<tr><td colspan="3"></td><td colspan="3">FY27</td><td colspan="3">Change</td><td colspan="3">FY27</td><td colspan="3">Change</td></tr>
<tr><td colspan="3">Total Revenue</td><td colspan="3">$23,279 to $23,512</td><td colspan="3">9% to 10%</td></tr>
<tr><td colspan="3">Diluted Earnings Per Share</td><td colspan="3">$20.12 to $20.36</td><td colspan="3">22% to 24%</td><td colspan="3">$22.88 to $23.12</td><td colspan="3">23% to 24%</td></tr>
</table>`;

describe("outlook tables", () => {
  it("keeps the company's outlook figures as label: value lines and drops the results table", () => {
    const lines = htmlToText(AMAT_OUTLOOK_HTML).split("\n");
    const at = lines.indexOf("Business Outlook");
    expect(lines.slice(at + 2, at + 5)).toEqual([
      "Q4 FY2026 (In millions, except per share amounts)",
      "Total revenue: $10,250 +/- $500",
      "Non-GAAP diluted EPS: $4.02 +/- $0.20",
    ]);
    expect(lines.join("\n")).not.toMatch(/9,115|7,302|2,538|Gross margin|Net income/);
  });

  it("carries the outlook figures into the press-release text and its outlook budget", () => {
    const { text } = pressReleaseText(htmlToText(AMAT_OUTLOOK_HTML));
    expect(text).toContain("Total revenue: $10,250 +/- $500\nNon-GAAP diluted EPS: $4.02 +/- $0.20\nThis outlook");
    // Past the narrative budget the rows come in through the outlook section instead.
    const late = pressReleaseText(htmlToText(AMAT_OUTLOOK_HTML), 20, 400);
    expect(late.text).toContain("Non-GAAP diluted EPS: $4.02 +/- $0.20");
    expect(late.outlookWords).toBeGreaterThan(0);
    expect(late.words).toBeLessThanOrEqual(20 + 400);
  });

  it("labels each value with its column when the outlook table has several", () => {
    expect(htmlToText(CSCO_GUIDANCE_HTML).split("\n")).toEqual([
      "GAAP TO NON-GAAP GUIDANCE",
      "Q1 FY 2027",
      "GAAP: Gross Margin 63% - 64%; Operating Margin 28% - 29%; Earnings per Share (1) $1.08 - $1.10",
      "Share-based compensation expense: Gross Margin 1.0%; Operating Margin 4.5%; Earnings per Share (1) 0.14",
      "Non-GAAP: Gross Margin 65% - 66%; Operating Margin 35.5% - 36.5%; Earnings per Share (1) $1.32 - $1.34",
    ]);
  });

  it("reads a labelled header row, values that open with a word, and stacked column headers", () => {
    expect(htmlToText(WMT_GUIDANCE_HTML).split("\n")).toEqual([
      "Guidance",
      "Third quarter",
      "Consolidated metric",
      "Q3 FY27",
      "Net sales (cc): Increase 3.0% to 3.75%",
      "Adjusted EPS: $0.62 to $0.64",
    ]);
    expect(htmlToText(INTU_GUIDANCE_HTML).split("\n")).toEqual([
      "Full Year Fiscal 2027 Guidance",
      "Total Revenue: GAAP FY27 $23,279 to $23,512; GAAP Change 9% to 10%",
      "Diluted Earnings Per Share: GAAP FY27 $20.12 to $20.36; GAAP Change 22% to 24%; " +
        "Non-GAAP FY27 $22.88 to $23.12; Non-GAAP Change 23% to 24%",
    ]);
  });
});

describe("isPreliminaryRelease", () => {
  it("flags a pre-announcement and not a results release", () => {
    expect(isPreliminaryRelease(ISRG_PRELIMINARY)).toBe(true);
    expect(isPreliminaryRelease(`<p>${CSCO_TOP.replace(/\n/g, "</p><p>")}</p>`)).toBe(false);
  });
});
