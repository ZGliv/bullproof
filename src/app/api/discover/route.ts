import { discoverCompanies, ResearchError } from "@/lib/live-research";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    return Response.json(
      await discoverCompanies(new URL(request.url).searchParams.get("cursor")),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ResearchError
            ? error.message
            : "Research is temporarily unavailable.",
      },
      { status: error instanceof ResearchError ? error.status : 503 },
    );
  }
}
