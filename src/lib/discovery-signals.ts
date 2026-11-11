import type {CompanyResearchLive} from './live-research-types';
import type {CompanyCatalysts} from './catalysts';
import type {Ledger} from './paper/engine';
const DAY=86400000;
export const strategyNames:Record<string,string>={growth:'Growth',quality:'Quality & value',turnaround:'Recovery'};
export function researchDay(at=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);}
export function discoverySignal(company:CompanyResearchLive,events?:CompanyCatalysts,now=Date.now()){
 const recent=events?.news.filter(n=>{const age=now-Date.parse(n.publishedAt);return age>=0&&age<=7*DAY;}).sort((a,b)=>a.priority-b.priority||b.publishedAt.localeCompare(a.publishedAt))[0];
 if(recent)return {label:recent.kind,title:recent.headline,date:recent.publishedAt,url:recent.url,source:recent.source,recent:true};
 const age=now-Date.parse(company.latestFilingDate+'T00:00:00Z');
 const signal=company.signals[0];
 return {label:age>=0&&age<=7*DAY?'New filing':'Financial screen',title:signal?.explanation||'Reported financials available for review',date:company.latestFilingDate,url:company.sourceUrl,source:'SEC EDGAR',recent:age>=0&&age<=7*DAY};
}
/** Actual fills only. A proposal, baseline purchase, or sold-out holding is never called an AI holding. */
export function aiPurchases(ledger:Ledger){
 const groups=new Map<string,{ticker:string;strategy:string;shares:number;lastBuy:Ledger['fills'][number]}>();
 for(const fill of [...ledger.fills].sort((a,b)=>a.at.localeCompare(b.at))){
  if(!strategyNames[fill.strategy])continue;
  const key=fill.strategy+':'+fill.ticker,old=groups.get(key);
  if(fill.side==='buy')groups.set(key,{ticker:fill.ticker,strategy:fill.strategy,shares:(old?.shares??0)+fill.shares,lastBuy:fill});
  else if(old)old.shares-=fill.shares;
 }
 return [...groups.values()].map(p=>({...p,shares:Math.max(0,p.shares),decision:ledger.decisions.find(d=>d.id===p.lastBuy.decision)})).sort((a,b)=>b.lastBuy.at.localeCompare(a.lastBuy.at));
}
export function decisionLink(strategy:string,decision:string,ticker:string){return `/arena?${new URLSearchParams({strategy,decision,ticker})}#portfolio-research`;}
