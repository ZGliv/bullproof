import { MarketDashboard } from "@/components/market-dashboard";
import { getMarketSnapshot } from "@/lib/market-data";
export const revalidate = 900;
export default async function Desk() { return <MarketDashboard initialSnapshot={await getMarketSnapshot("1D")}/>; }
