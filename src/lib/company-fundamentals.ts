import type { SecCompanyFacts, SecFact } from './live-research';
import type { FactSource } from './live-research-types';
export type SourcedMetric = { value: number; start?: string; end: string; method: string; sources: FactSource[] };
export type Fundamentals = { revenue: SourcedMetric|null; earnings: SourcedMetric|null; operatingCash: SourcedMetric|null; capex: SourcedMetric|null; freeCashFlow: SourcedMetric|null; shares: SourcedMetric|null };
export type MarketObservation = { price: number; at: string; source: 'Alpaca IEX'; previousClose: number|null; dayChange: number|null };
export type Valuation = { market: MarketObservation|null; marketCap: number|null; pe: number|null; ps: number|null; fcfYield: number|null; warnings: string[] };
const day = (a:string,b:string) => (Date.parse(a)-Date.parse(b))/86400000;
const source = (cik:number,tag:string,f:SecFact):FactSource => ({tag,accession:f.accn,filed:f.filed,form:f.form,sourceUrl:`https://www.sec.gov/Archives/edgar/data/${cik}/${f.accn.replaceAll('-','')}/${f.accn}-index.html`});
function valid(f:SecFact,asOf:string){return Number.isFinite(f.val)&&Number.isFinite(Date.parse(f.end))&&Number.isFinite(Date.parse(f.filed))&&f.filed<=asOf&&f.end<=f.filed&&/^10-[QK](\/A)?$/.test(f.form)&&/^\d{10}-\d{2}-\d{6}$/.test(f.accn);}
function series(data:SecCompanyFacts,tag:string,unit:string,asOf:string){const all=data.facts['us-gaap']?.[tag]?.units[unit]??data.facts.dei?.[tag]?.units[unit]??[];const periods=new Map<string,SecFact>();for(const f of all.filter(f=>valid(f,asOf)).sort((a,b)=>a.filed.localeCompare(b.filed)||a.accn.localeCompare(b.accn))){periods.set(`${f.start??''}:${f.end}`,f);}return [...periods.values()];}
/** Full-year + current YTD - matching prior YTD. Never add four reported quarters across a missing Q4. */
export function trailingMetric(data:SecCompanyFacts,tags:string[],end:string,asOf:string):SourcedMetric|null {
 for(const tag of tags){const facts=series(data,tag,'USD',asOf).filter(f=>f.start&&f.end<=end);const annual=facts.filter(f=>day(f.end,f.start!)+1>=350&&day(f.end,f.start!)+1<=380).sort((a,b)=>b.end.localeCompare(a.end))[0];if(!annual)continue;
  if(annual.end===end)return {value:annual.val,start:annual.start,end,method:'Reported full fiscal year',sources:[source(data.cik,tag,annual)]};
  if(day(end,annual.end)>310)continue;
  const ytd=facts.filter(f=>f.end===end&&Math.abs(day(f.start!,annual.end)-1)<=7&&day(f.end,f.start!)+1>=75&&day(f.end,f.start!)+1<=300).sort((a,b)=>a.start!.localeCompare(b.start!))[0];if(!ytd)continue;
  const prior=facts.find(f=>f.start===annual.start&&Math.abs(day(ytd.end,f.end)-365)<=14&&Math.abs(day(ytd.start!,f.start!)-day(ytd.end,f.end))<=7);if(!prior)continue;
  return {value:annual.val+ytd.val-prior.val,start:new Date(Date.parse(prior.end)+86400000).toISOString().slice(0,10),end,method:'Full year + current YTD − prior YTD',sources:[annual,ytd,prior].map(f=>source(data.cik,tag,f))};
 }
 return null;
}
export function extractFundamentals(data:SecCompanyFacts,end:string,asOf=new Date().toISOString().slice(0,10)):Fundamentals {
 const revenue=trailingMetric(data,['Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','RevenueFromContractWithCustomerIncludingAssessedTax','SalesRevenueNet'],end,asOf);
 const earnings=trailingMetric(data,['NetIncomeLossAvailableToCommonStockholdersBasic','NetIncomeLoss','ProfitLoss'],end,asOf);
 const operatingCash=trailingMetric(data,['NetCashProvidedByUsedInOperatingActivities'],end,asOf),capex=trailingMetric(data,['PaymentsToAcquirePropertyPlantAndEquipment'],end,asOf);
 const freeCashFlow=operatingCash&&capex&&capex.value>=0&&operatingCash.start===capex.start?{...operatingCash,value:operatingCash.value-capex.value,method:'Operating cash flow − purchases of property, plant and equipment',sources:[...operatingCash.sources,...capex.sources]}:null;
 const candidates=series(data,'EntityCommonStockSharesOutstanding','shares',asOf).filter(f=>!f.start&&f.val>0&&day(asOf,f.end)<=180).sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed));const share=candidates[0];
 const shares=share?{value:share.val,end:share.end,method:'Reported common shares outstanding',sources:[source(data.cik,'EntityCommonStockSharesOutstanding',share)]}:null;
 return {revenue,earnings,operatingCash,capex,freeCashFlow,shares};
}
export function deriveValuation(f:Fundamentals,market:MarketObservation|null,ambiguousListing=false,now=Date.now()):Valuation {
 const warnings:string[]=[];if(market&&(!Number.isFinite(market.price)||market.price<=0||!Number.isFinite(Date.parse(market.at))||now-Date.parse(market.at)>7*86400000||Date.parse(market.at)>now+60000)){market=null;warnings.push('The market observation is stale or invalid. Valuation withheld.');}
 if(!market)warnings.push('No recent IEX trade available. Valuation is unavailable.');
 if(!f.shares)warnings.push('Recent common shares outstanding unavailable.');
 if(ambiguousListing)warnings.push('Multiple common listings for this issuer: share-class valuation withheld.');
 const marketCap=market&&f.shares&&!ambiguousListing?market.price*f.shares.value:null;
 if(marketCap)warnings.push(`Indicative market cap uses shares reported at ${f.shares!.end}; subsequent share changes, splits and class differences can affect multiples. IEX is one exchange, not the consolidated market.`);
 return {market,marketCap,pe:marketCap&&f.earnings&&f.earnings.value>0?marketCap/f.earnings.value:null,ps:marketCap&&f.revenue&&f.revenue.value>0?marketCap/f.revenue.value:null,fcfYield:marketCap&&f.freeCashFlow?f.freeCashFlow.value/marketCap*100:null,warnings};
}
