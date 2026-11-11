import { ResearchError, searchCompanies } from "@/lib/live-research";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return Response.json(
      await searchCompanies(new URL(request.url).searchParams.get("q") ?? ""),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ResearchError
            ? error.message
            : "Ticker search is temporarily unavailable.",
      },
      { status: error instanceof ResearchError ? error.status : 503 },
    );
  }
}
