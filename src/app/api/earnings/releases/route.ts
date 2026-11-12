import type { NextRequest } from "next/server";
import { ResearchError } from "@/lib/live-research";
import { getReleases } from "@/lib/earnings/sec";

export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker") ?? "";
  if (!/^[A-Z]{1,5}$/.test(ticker))
    return Response.json({ error: "ticker must be 1-5 capital letters." }, { status: 400, headers: NO_STORE });
  try {
    return Response.json(await getReleases(ticker), { headers: NO_STORE });
  } catch (error) {
    const status = error instanceof ResearchError ? error.status : 503;
    const message = error instanceof ResearchError ? error.message : "SEC EDGAR is unavailable.";
    return Response.json({ error: message }, { status, headers: NO_STORE });
  }
}
