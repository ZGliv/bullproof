import { getFallbackSnapshot } from "@/lib/fallback-data";
import type {
  MarketPeriod,
  MarketSnapshot,
  ResearchIdea,
  SignalFactor,
  StockMover,
} from "@/lib/types";

const ALPHA_URL =
  "https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=demo";
const MASSIVE_BASE_URL = "https://api.massive.com";
const MIN_PRICE = 2;
const MIN_VOLUME = 100_000;
const MIN_DOLLAR_VOLUME = 1_000_000;
const MAX_MOVERS = 10;

interface AlphaMover {
  ticker: string;
  price: string;
  change_amount: string;
  change_percentage: string;
  volume: string;
}

interface AlphaResponse {
  metadata?: string;
  last_updated?: string;
  top_gainers?: AlphaMover[];
  top_losers?: AlphaMover[];
  most_actively_traded?: AlphaMover[];
  Information?: string;
  Note?: string;
}

interface MassiveAggregate {
  T: string;
  c: number;
  h?: number;
  l?: number;
  o?: number;
  t?: number;
  v: number;
  vw?: number;
  n?: number;
}

interface MassiveResponse {
  status?: string;
  queryCount?: number;
  resultsCount?: number;
  results?: MassiveAggregate[];
  error?: string;
}

interface MassiveSession {
  date: string;
  rows: MassiveAggregate[];
}

export function parsePercent(value: string): number {
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function looksLikeOperatingShare(symbol: string): boolean {
  if (/[+^=\/]/.test(symbol)) return false;
  if (symbol.length >= 5 && /(?:WS|WT|W|RT|R|U)$/.test(symbol)) return false;
  return true;
}

function passesLiquidityScreen(stock: Pick<StockMover, "symbol" | "price" | "volume">) {
  return (
    looksLikeOperatingShare(stock.symbol) &&
    stock.price >= MIN_PRICE &&
    stock.volume >= MIN_VOLUME &&
    stock.price * stock.volume >= MIN_DOLLAR_VOLUME
  );
}

export function normalizeAlphaMover(row: AlphaMover): StockMover {
  const price = parseNumber(row.price);
  const changeAmount = parseNumber(row.change_amount);
  const baselinePrice = Math.max(0, price - changeAmount);

  return {
    symbol: row.ticker.trim().toUpperCase(),
    name: row.ticker.trim().toUpperCase(),
    exchange: "U.S.",
    sector: null,
    price,
    baselinePrice,
    changeAmount,
    changePercent: parsePercent(row.change_percentage),
    volume: Math.round(parseNumber(row.volume)),
    relativeVolume: null,
    marketCap: null,
    rank: 0,
  };
}

function rankSide(rows: StockMover[], direction: "winners" | "losers") {
  const sorted = [...rows].sort((a, b) =>
    direction === "winners"
      ? b.changePercent - a.changePercent
      : a.changePercent - b.changePercent,
  );

  return sorted.slice(0, MAX_MOVERS).map((stock, index) => ({
    ...stock,
    rank: index + 1,
  }));
}

function factorValue(stock: StockMover): SignalFactor[] {
  const momentum = clamp((Math.abs(stock.changePercent) / 30) * 100);
  const turnover = clamp((Math.log10(Math.max(stock.price * stock.volume, 1)) - 6) * 34);
  const liquidity = clamp((Math.log10(Math.max(stock.volume, 1)) - 5) * 42 + 25);

  return [
    { label: "Momentum", value: Math.round(momentum) },
    { label: "Turnover", value: Math.round(turnover) },
    { label: "Liquidity", value: Math.round(liquidity) },
  ];
}

function compactVolume(volume: number): string {
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(1)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(0)}K`;
  return String(volume);
}

export function rankResearchIdeas(winners: StockMover[], period: MarketPeriod): ResearchIdea[] {
  return winners.slice(0, 4).map((stock) => {
    const factors = factorValue(stock);
    const score = Math.round(
      factors[0].value * 0.5 + factors[1].value * 0.3 + factors[2].value * 0.2,
    );
    const volatilityRisk = Math.abs(stock.changePercent) >= 20;

    return {
      stock,
      score,
      label: score >= 82 ? "Strong signal" : score >= 68 ? "Positive signal" : "Watch closely",
      horizon: period === "1D" ? "Short-term momentum" : "Momentum watch",
      factors,
      thesis: [
        `Ranks #${stock.rank} among eligible gainers in this screen.`,
        `${stock.changePercent.toFixed(1)}% price move with ${compactVolume(stock.volume)} shares traded.`,
        `Cleared the $${(MIN_DOLLAR_VOLUME / 1_000_000).toFixed(0)}M turnover floor used to reduce thinly traded noise.`,
      ],
      risks: [
        volatilityRisk
          ? "An unusually sharp move can reverse quickly; investigate the catalyst before acting."
          : "Momentum can fade; confirm the move holds beyond one observation window.",
        stock.marketCap === null
          ? "This feed does not include fundamentals or market cap; complete that research separately."
          : "The score does not include valuation, earnings quality, or portfolio fit.",
      ],
    };
  });
}

export function buildSnapshotFromAlpha(payload: AlphaResponse): MarketSnapshot {
  if (!Array.isArray(payload.top_gainers) || !Array.isArray(payload.top_losers)) {
    throw new Error(payload.Information || payload.Note || "Alpha Vantage movers are unavailable");
  }

  const pool = [
    ...payload.top_gainers,
    ...payload.top_losers,
    ...(Array.isArray(payload.most_actively_traded) ? payload.most_actively_traded : []),
  ];
  const unique = new Map<string, StockMover>();

  for (const row of pool) {
    const stock = normalizeAlphaMover(row);
    if (!unique.has(stock.symbol)) unique.set(stock.symbol, stock);
  }

  const eligible = [...unique.values()].filter(passesLiquidityScreen);
  const winners = rankSide(
    eligible.filter((stock) => stock.changePercent > 0),
    "winners",
  );
  const losers = rankSide(
    eligible.filter((stock) => stock.changePercent < 0),
    "losers",
  );
  const unchanged = eligible.filter((stock) => stock.changePercent === 0).length;

  return {
    period: "1D",
    fetchedAt: new Date().toISOString(),
    marketDate: (payload.last_updated || "Latest completed U.S. session").replace(
      " US/Eastern",
      " ET",
    ),
    sourceName: "Alpha Vantage U.S. market movers",
    sourceUrl: "https://www.alphavantage.co/documentation/",
    sourceKind: "alpha-vantage",
    coverage: "headline",
    universeCount: unique.size,
    eligibleCount: eligible.length,
    advancers: eligible.filter((stock) => stock.changePercent > 0).length,
    decliners: eligible.filter((stock) => stock.changePercent < 0).length,
    unchanged,
    medianMove: median(eligible.map((stock) => Math.abs(stock.changePercent))),
    strongestSector: null,
    winners,
    losers,
    ideas: rankResearchIdeas(winners, "1D"),
    isFallback: false,
    supportsWeekly: false,
    notice:
      "Preview coverage: headline movers and most-active U.S. tickers, filtered for price and liquidity. It is not the full market.",
  };
}

async function fetchAlphaSnapshot(): Promise<MarketSnapshot> {
  const response = await fetch(ALPHA_URL, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });

  if (!response.ok) throw new Error(`Alpha Vantage returned ${response.status}`);
  return buildSnapshotFromAlpha((await response.json()) as AlphaResponse);
}

function easternDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function recentBusinessDates(): string[] {
  const now = new Date();
  const eastern = easternDateParts(now);
  const isWeekday = !["Sat", "Sun"].includes(eastern.weekday);
  const afterCloseBuffer = Number(eastern.hour) >= 18;
  const offsetStart = isWeekday && afterCloseBuffer ? 0 : 1;
  const dates: string[] = [];

  for (let offset = offsetStart; dates.length < 8 && offset < 16; offset += 1) {
    const candidate = new Date(now);
    candidate.setUTCDate(candidate.getUTCDate() - offset);
    const parts = easternDateParts(candidate);
    if (["Sat", "Sun"].includes(parts.weekday)) continue;
    dates.push(`${parts.year}-${parts.month}-${parts.day}`);
  }

  return dates;
}

async function fetchMassiveSession(date: string, apiKey: string): Promise<MassiveSession | null> {
  const url = `${MASSIVE_BASE_URL}/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&include_otc=false`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    next: { revalidate: 3600 },
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Massive returned ${response.status}`);

  const payload = (await response.json()) as MassiveResponse;
  if (!Array.isArray(payload.results) || payload.results.length === 0) return null;
  return { date, rows: payload.results };
}

function buildMassiveMover(
  latest: MassiveAggregate,
  baseline: MassiveAggregate,
): StockMover | null {
  if (!latest.T || !Number.isFinite(latest.c) || !Number.isFinite(baseline.c) || baseline.c <= 0) {
    return null;
  }

  const changeAmount = latest.c - baseline.c;
  return {
    symbol: latest.T,
    name: latest.T,
    exchange: "U.S.",
    sector: null,
    price: latest.c,
    baselinePrice: baseline.c,
    changeAmount,
    changePercent: (changeAmount / baseline.c) * 100,
    volume: Math.round(latest.v || 0),
    relativeVolume: null,
    marketCap: null,
    rank: 0,
  };
}

async function fetchMassiveSnapshot(
  period: MarketPeriod,
  apiKey: string,
): Promise<MarketSnapshot> {
  const candidates = recentBusinessDates();
  const targetIndexes = [0, 1, 5, 2, 6].filter((index) => index < candidates.length);
  const settled = await Promise.all(
    targetIndexes.map((index) => fetchMassiveSession(candidates[index], apiKey)),
  );
  const sessions = settled
    .filter((session): session is MassiveSession => session !== null)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (sessions.length < 2) throw new Error("Not enough completed Massive sessions");
  const latest = sessions[0];
  const previous = sessions[1];
  const weekly = sessions.find((session) => {
    const delta = Date.parse(`${latest.date}T12:00:00Z`) - Date.parse(`${session.date}T12:00:00Z`);
    return delta >= 6 * 24 * 60 * 60 * 1000;
  });
  const baseline = period === "1W" ? weekly : previous;

  if (!baseline) throw new Error("Weekly baseline is not available");

  const baselineMap = new Map(baseline.rows.map((row) => [row.T, row]));
  const movers = latest.rows
    .map((row) => {
      const base = baselineMap.get(row.T);
      return base ? buildMassiveMover(row, base) : null;
    })
    .filter((stock): stock is StockMover => stock !== null)
    .filter(passesLiquidityScreen);
  const winners = rankSide(
    movers.filter((stock) => stock.changePercent > 0),
    "winners",
  );
  const losers = rankSide(
    movers.filter((stock) => stock.changePercent < 0),
    "losers",
  );
  const unchanged = movers.filter((stock) => stock.changePercent === 0).length;

  return {
    period,
    fetchedAt: new Date().toISOString(),
    marketDate: latest.date,
    sourceName: "Massive adjusted U.S. daily aggregates",
    sourceUrl: "https://massive.com/docs/rest/stocks/aggregates/daily-market-summary",
    sourceKind: "massive",
    coverage: "full",
    universeCount: latest.rows.length,
    eligibleCount: movers.length,
    advancers: movers.filter((stock) => stock.changePercent > 0).length,
    decliners: movers.filter((stock) => stock.changePercent < 0).length,
    unchanged,
    medianMove: median(movers.map((stock) => Math.abs(stock.changePercent))),
    strongestSector: null,
    winners,
    losers,
    ideas: rankResearchIdeas(winners, period),
    isFallback: false,
    supportsWeekly: true,
    notice:
      "Full-universe mode uses adjusted daily price aggregates, then applies a $2 price, 100K-share volume, and $1M turnover screen.",
  };
}

export async function getMarketSnapshot(period: MarketPeriod = "1D"): Promise<MarketSnapshot> {
  const massiveApiKey = process.env.MASSIVE_API_KEY?.trim();

  try {
    if (massiveApiKey) return await fetchMassiveSnapshot(period, massiveApiKey);
    if (period === "1W") throw new Error("Weekly coverage requires a full-universe feed");
    return await fetchAlphaSnapshot();
  } catch (error) {
    console.error("Market data provider error", error);

    if (period === "1D" && massiveApiKey) {
      try {
        return await fetchAlphaSnapshot();
      } catch (fallbackError) {
        console.error("Headline feed fallback error", fallbackError);
      }
    }

    return getFallbackSnapshot(period);
  }
}

export const screeningThresholds = {
  minPrice: MIN_PRICE,
  minVolume: MIN_VOLUME,
  minDollarVolume: MIN_DOLLAR_VOLUME,
};
