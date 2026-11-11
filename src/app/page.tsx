import { ResearchApp } from "@/components/research-app";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string | string[]; view?: string }> ;
}) {
  const { ticker, view } = await searchParams;
  const initialTicker =
    typeof ticker === "string" && /^[A-Z][A-Z0-9.\-]{0,11}$/i.test(ticker)
      ? ticker.toUpperCase()
      : undefined;
  return <ResearchApp initialTicker={initialTicker} initialWatchlist={view === "watchlist"} />;
}
