import type { NextRequest } from "next/server";
import { getPacket } from "@/lib/earnings/sec";

export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

/** Refusals (unknown ticker, already reported, ...) are HTTP 200 with `ok: false`. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ticker = params.get("ticker") ?? "";
  const asOf = new Date(params.get("asOf") ?? "");
  if (!/^[A-Z]{1,5}$/.test(ticker))
    return Response.json({ error: "ticker must be 1-5 capital letters." }, { status: 400, headers: NO_STORE });
  if (Number.isNaN(asOf.getTime()))
    return Response.json({ error: "asOf must be an ISO-8601 instant." }, { status: 400, headers: NO_STORE });
  return Response.json(await getPacket(ticker, asOf.toISOString()), { headers: NO_STORE });
}
