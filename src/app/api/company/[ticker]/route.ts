import { getCompanyResearch, ResearchError } from "@/lib/live-research";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(
  _request: Request,
  context: { params: Promise<{ ticker: string }> },
) {
  try {
    const { ticker } = await context.params;
    return Response.json(await getCompanyResearch(ticker), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ResearchError
            ? error.message
            : "Company research is temporarily unavailable.",
      },
      { status: error instanceof ResearchError ? error.status : 503 },
    );
  }
}
