export const EDITION = "2026-10-27";
export const RELEASE = "Discovery 01 · Oct 27, 2026";
export type Horizon = "weeks" | "quarters" | "years";
export type Source = { title: string; date: string; url: string; section: string };
export type Fact = { label: string; value: string; period: string; detail: string; source: number };
export type Discovery = {
  slug: string; ticker: string; name: string; sector: string; horizon: Horizon; period: string;
  title: string; hook: string; business: string; catch: string; why: string; thesis: string;
  risk: string; valuation: string; nextDate: string; nextLabel: string; nextSource: number;
  questions: string[]; facts: Fact[]; sources: Source[];
};
export const discoveries: Discovery[] = [
  {
    slug: "gxo", ticker: "GXO", name: "GXO Logistics", sector: "Contract logistics", horizon: "weeks", period: "Next 2–6 weeks",
    title: "Winning work is one thing. Making it pay is another.",
    hook: "New contract wins are growing faster than reported profit. The next earnings release gives you a concrete place to test the gap.",
    business: "GXO operates warehouses and fulfillment services for other businesses. Its exposure is to outsourced logistics, rather than selling products itself.",
    catch: "Contract wins are a leading indicator, not cash already earned.",
    why: "Selected for a measurable gap between commercial momentum and earnings, with a confirmed reporting date. This is an editorial selection, not an algorithmic ranking.",
    thesis: "Research hypothesis: if new work becomes profitable operating activity, the commercial momentum should eventually appear in earnings and cash. A larger pipeline by itself would not establish that.",
    risk: "The countercase is a business adding activity without improving economics. Check implementation costs and cash requirements before interpreting contract wins as shareholder value.",
    valuation: "Before judging the shares: establish a dated enterprise value and compare it with sustainable cash flow after capital spending. Include debt; a growing business can still be an expensive stock. This brief has no verified current quote or valuation multiple.",
    nextDate: "2026-11-03", nextLabel: "Q3 results · after US market close", nextSource: 1,
    questions: ["Do new wins turn into organic revenue growth?", "Does profit improve alongside revenue?", "Does cash generation hold up when new contracts start?"],
    facts: [
      { label: "New business wins", value: "$410m", period: "Q2 2026 · +34% year over year", detail: "Management reports signed new business. It is not reported quarterly revenue or cash receipts.", source: 0 },
      { label: "Revenue", value: "$3.4bn", period: "Q2 2026 · +4.3% year over year", detail: "Organic revenue growth was 3.4%, a non-GAAP measure. The company includes its reconciliation in the release.", source: 0 },
      { label: "GAAP net income", value: "$27m", period: "Q2 2026 · $28m a year earlier", detail: "A useful check against the faster growth in new business wins. These measures describe different things and should not be treated as a direct conversion rate.", source: 0 },
    ],
    sources: [
      { title: "Q2 2026 earnings release", date: "2026-08-04", url: "https://investors.gxo.com/news-releases/news-release-details/gxo-reports-second-quarter-2026-results", section: "Highlights; Second Quarter 2026 Results; non-GAAP reconciliations" },
      { title: "Q3 reporting date announcement", date: "2026-10-08", url: "https://gxo.com/news_article/third-quarter-2026-earnings-conference-call/", section: "Results November 3; earnings call November 4 at 8:30 a.m. ET" },
    ],
  },
  {
    slug: "brunswick", ticker: "BC", name: "Brunswick", sector: "Marine recreation", horizon: "quarters", period: "Next 2–4 quarters",
    title: "Can the boating business improve before the boat market does?",
    hook: "Look beyond new boat sales: parts, engines and aftermarket demand could tell a different story. The question is how much improvement can last.",
    business: "Brunswick owns Mercury Marine, boat brands including Boston Whaler, and parts, electronics and shared-access businesses such as Freedom Boat Club.",
    catch: "Tariff refunds helped reported performance. Separate repeatable improvement from temporary benefits.",
    why: "Selected as a business-mix question: ownership of familiar boat brands can obscure the rest of the operation. Several quarters are needed to test durability.",
    thesis: "Research hypothesis: demand tied to using and maintaining existing boats may support results even when new purchases are uneven. Test each segment rather than buying the recovery narrative as a whole.",
    risk: "A rebound can disappoint if consumer spending weakens or incentives absorb the benefit of higher sales. Compare margins on a consistent basis and ask how results look without unusual benefits.",
    valuation: "Before judging the shares: compare the share price with earnings across a normal marine cycle, not just one strong quarter. Model a weaker-demand case and account for debt. Current price and normalized earnings have not been verified in this brief.",
    nextDate: "2026-10-29", nextLabel: "Q3 results · before US market open", nextSource: 1,
    questions: ["Do parts and aftermarket sales remain resilient?", "What is margin performance without tariff refunds?", "Are dealers selling through inventory without heavier discounts?"],
    facts: [
      { label: "Net sales", value: "$1.558bn", period: "Q2 2026 · +7.7% year over year", detail: "The source reports $1,557.8 million; displayed here in rounded billions.", source: 0 },
      { label: "GAAP operating margin", value: "8.3%", period: "Q2 2026 · 7.1% a year earlier", detail: "Adjusted margin was 9.6%. Read the reconciliation rather than mixing the GAAP and adjusted figures.", source: 0 },
      { label: "Engine parts & accessories sales", value: "+9%", period: "Q2 2026 · year over year, company-rounded", detail: "The release attributes growth to boating participation and previous pricing actions. This does not isolate unit growth.", source: 0 },
    ],
    sources: [
      { title: "Q2 2026 earnings release", date: "2026-07-30", url: "https://www.brunswick.com/investors/sec-filings/all-sec-filings/content/0000014930-26-000087/q22026exhibit99_1.htm", section: "Financial results; Engine Parts and Accessories; GAAP/non-GAAP reconciliation" },
      { title: "Q3 reporting date announcement", date: "2026-10-08", url: "https://www.brunswick.com/news/press-releases/detail/1011/brunswick-corporation-schedules-2026-third-quarter-earnings", section: "Results October 29; earnings call at 11 a.m. ET" },
    ],
  },
  {
    slug: "mueller-water", ticker: "MWA", name: "Mueller Water Products", sector: "Water infrastructure", horizon: "years", period: "Next 2–4 years",
    title: "The unglamorous hardware a water network needs.",
    hook: "Valves, hydrants and repair equipment make this a way to investigate water infrastructure. The harder question is what its recent margin gains really mean.",
    business: "Mueller supplies water-network equipment, including valves, hydrants, metering and leak-detection products, to the North American market.",
    catch: "Sales rose while overall volumes slipped. Infrastructure demand and pricing power are different claims.",
    why: "Selected as an unfamiliar-business discovery, with a recent capital-return announcement. The long horizon is a research lens, not a forecast of returns.",
    thesis: "Research hypothesis: a business serving essential physical networks could be worth studying across multiple spending cycles. Establish repeat demand and competitive durability rather than assuming the infrastructure label guarantees growth.",
    risk: "The countercase is that pricing and temporary benefits flatter the economics. Test volume, cash generation and reinvestment together before extrapolating margins.",
    valuation: "Before judging the shares: compare enterprise value with normalized operating earnings and cash flow. Remove nonrecurring benefits and test a lower-margin case. A repurchase authorization is not proof that a stock is cheap; this brief has no verified current valuation.",
    nextDate: "2026-11-04", nextLabel: "Fiscal Q4 / FY2026 results · after US market close", nextSource: 2,
    questions: ["Can volumes improve without sacrificing pricing?", "How much margin survives after unusual benefits fade?", "Are buybacks actually executed, and at what prices?"],
    facts: [
      { label: "Net sales", value: "$395.9m", period: "Fiscal Q3 2026 · +4.1% year over year", detail: "Quarter ended June 30. Higher prices offset slightly lower overall volumes.", source: 0 },
      { label: "GAAP operating margin", value: "20.4%", period: "Fiscal Q3 2026 · 19.4% a year earlier", detail: "Adjusted margin was 24.0%. Pricing, tariff refunds and lower SG&A helped results; read the adjustments.", source: 0 },
      { label: "Additional buyback authorization", value: "$300m", period: "Announced October 22, 2026", detail: "Total remaining authorization became $334.5m. Authorization permits repurchases; it does not require them.", source: 1 },
    ],
    sources: [
      { title: "Fiscal Q3 2026 earnings release", date: "2026-08-05", url: "https://ir.muellerwaterproducts.com/press-releases/2026/08-05-2026-211118748", section: "Consolidated Results; GAAP/non-GAAP reconciliations" },
      { title: "Capital return announcement", date: "2026-10-22", url: "https://ir.muellerwaterproducts.com/press-releases/2026/10-22-2026-210903268", section: "$300 Million Stock Repurchase Authorization" },
      { title: "Fiscal Q4 reporting date announcement", date: "2026-10-23", url: "https://ir.muellerwaterproducts.com/press-releases/2026/10-23-2026-211210580", section: "Results November 4; call November 5 at 11 a.m. ET" },
    ],
  },
];
export function getDiscovery(slug: string) { return discoveries.find(company => company.slug === slug); }
export function dateLabel(date: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z")); }
