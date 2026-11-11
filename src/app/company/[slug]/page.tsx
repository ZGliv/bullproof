import { notFound } from "next/navigation";
import { DiscoveryApp } from "@/components/discovery-app";
import { discoveries, getDiscovery } from "@/lib/discovery";
export function generateStaticParams() { return discoveries.map(({slug}) => ({slug})); }
export async function generateMetadata({params}: {params: Promise<{slug:string}>}) {
  const company = getDiscovery((await params).slug);
  return {title: company ? `${company.name} (${company.ticker}) — Research brief` : "Company not found"};
}
export default async function CompanyPage({params}: {params: Promise<{slug:string}>}) {
  const company = getDiscovery((await params).slug);
  if (!company) notFound();
  return <DiscoveryApp key={company.slug} company={company}/>;
}
