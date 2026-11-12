import type { NextRequest } from "next/server";
import { ResearchError } from "@/lib/live-research";
import { getPacket } from "@/lib/earnings/sec";

export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;
/** The worker asks for "now"; any other asOf would only let callers step around the already-reported guard. */
const MAX_ASOF_SKEW_MS = 86_400_000;

/**
 * Refusals (unknown ticker, already reported, ...) are HTTP 200 with `ok: false`.
 * SEC failures are 503 so the caller treats them as transient.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ticker = params.get("ticker") ?? "";
  const rawAsOf = params.get("asOf") ?? "";
  if (!/^[A-Z]{1,5}$/.test(ticker))
    return Response.json({ error: "ticker must be 1-5 capital letters." }, { status: 400, headers: NO_STORE });
  const asOf = new Date(rawAsOf);
  if (!ISO_INSTANT.test(rawAsOf) || Number.isNaN(asOf.getTime()))
    return Response.json({ error: "asOf must be a UTC ISO-8601 instant." }, { status: 400, headers: NO_STORE });
  if (Math.abs(asOf.getTime() - Date.now()) > MAX_ASOF_SKEW_MS)
    return Response.json({ error: "asOf must be within a day of now." }, { status: 400, headers: NO_STORE });
  try {
    return Response.json(await getPacket(ticker, asOf.toISOString()), { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof ResearchError ? error.message : "SEC EDGAR is unavailable.";
    return Response.json({ error: message }, { status: 503, headers: NO_STORE });
  }
}
