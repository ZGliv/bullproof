import { getMarketSnapshot } from "@/lib/market-data";
import type { MarketPeriod } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedPeriod = searchParams.get("period")?.toUpperCase();

  if (requestedPeriod !== "1D" && requestedPeriod !== "1W") {
    return Response.json(
      { error: "period must be 1D or 1W" },
      { status: 400 },
    );
  }

  const snapshot = await getMarketSnapshot(requestedPeriod as MarketPeriod);
  return Response.json(snapshot, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
