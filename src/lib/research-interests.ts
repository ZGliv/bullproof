import type {CompanyResearchLive} from './live-research-types';
export const INTEREST_KEY='bullproof:interests:v1';
export type Feedback={action:'save'|'dismiss'|'known';features:string[];at:string;enriched?:boolean};
export type Interests=Record<string,Feedback>;
const labels:Record<string,string>={growth:'sales growth ≥12%',recovery:'margin recovery ≥2pp',profitable:'operating margin ≥12%',value:'positive earnings at ≤25×',cash:'free-cash-flow yield ≥3%',small:'market cap below $2B'};
export const featureLabel=(key:string)=>labels[key]??key.replace(/^industry:/,'');
export function parseInterests(raw:string|null):Interests{
 try{const v=JSON.parse(raw??'{}');if(v.version!==1||!v.items||typeof v.items!=='object')return {};return Object.fromEntries(Object.entries(v.items).slice(0,300).filter(([t,f])=>/^[A-Z][A-Z0-9.-]{0,11}$/.test(t)&&f&&typeof f==='object'&&['save','dismiss','known'].includes((f as Feedback).action)&&Array.isArray((f as Feedback).features)&&typeof (f as Feedback).at==='string').map(([t,f])=>[t,{action:(f as Feedback).action,at:(f as Feedback).at,...((f as Feedback).enriched?{enriched:true}:{}),features:(f as Feedback).features.filter(x=>typeof x==='string'&&(x in labels||x.startsWith('industry:'))).map(x=>x.slice(0,150)).slice(0,10)}]));}catch{return {};}
}
export function features(c:CompanyResearchLive){
 const out:string[]=[];const s=c.signals[0],m=c.quarters.at(-1)?.operatingMargin,v=c.valuation;
 if(c.context?.industry)out.push('industry:'+c.context.industry);
 if(s?.revenueGrowth!=null&&s.revenueGrowth>=12)out.push('growth');
 if(s?.marginChangePp!=null&&s.marginChangePp>=2)out.push('recovery');
 if(m!=null&&m>=12&&m<=100)out.push('profitable');
 if(v?.pe!=null&&v.pe>0&&v.pe<=25)out.push('value');
 if(v?.fcfYield!=null&&v.fcfYield>=3)out.push('cash');
 if(v?.marketCap!=null&&v.marketCap>0&&v.marketCap<2e9)out.push('small');
 return out;
}
export function researchCase(c:CompanyResearchLive){
 const s=c.signals[0],v=c.valuation,m=c.quarters.at(-1)?.operatingMargin;
 const facts:string[]=[];
 if(s?.revenueGrowth!=null)facts.push(`Sales ${s.revenueGrowth>=0?'grew':'fell'} ${Math.abs(s.revenueGrowth).toFixed(1)}% YoY`);
 if(s?.marginChangePp!=null)facts.push(`operating margin ${s.marginChangePp>=0?'expanded':'contracted'} ${Math.abs(s.marginChangePp).toFixed(1)}pp`);
 if(v?.pe!=null&&v.pe>0)facts.push(`${v.pe.toFixed(1)}× trailing earnings`);
 const caution=c.stale?'Financial refresh unavailable; these are cached figures.':s?.revenueGrowth!=null&&s.revenueGrowth<0?'Revenue is shrinking; margin improvement alone does not establish a recovery.':m!=null&&m<0?'Operations remain loss-making.':s?.marginChangePp!=null&&s.marginChangePp<0?'Margins are contracting despite the reported sales trend.':v?.pe!=null&&v.pe>40?'The earnings multiple leaves greater sensitivity to growth expectations.':!v?.market?'No current valuation observation; price attractiveness is unverified.':'No forward earnings estimates in this screen; the multiple uses reported earnings.';
 return {case:facts.length?facts.join(' · ')+'.':'Insufficient comparable financial evidence for a measured research case.',caution,url:c.sourceUrl};
}
export function interestMatch(c:CompanyResearchLive,profile:Interests,saved:string[]){
 const f=features(c);let score=0;const matches:{ticker:string;feature:string}[]=[];
 for(const [ticker,item] of Object.entries(profile)){
  if(item.action==='known'||item.action==='save'&&!saved.includes(ticker))continue;
  const shared=f.filter(k=>item.features.includes(k));
  const weight=Math.min(3,shared.reduce((n,k)=>n+(k.startsWith('industry:')?2:1),0));
  score+=item.action==='save'?weight:-weight*0.6;
  if(item.action==='save'&&shared.length)matches.push({ticker,feature:shared.find(k=>k.startsWith('industry:'))??shared[0]});
 }
 return {score:Math.max(-6,Math.min(8,score)),matches};
}
export function rankForYou(companies:CompanyResearchLive[],profile:Interests,saved:string[],seen:string[]){
 const pool=companies.filter(c=>!saved.includes(c.ticker)&&!['dismiss','known'].includes(profile[c.ticker]?.action)).map(c=>{const match=interestMatch(c,profile,saved);return {c,match,score:match.score+(seen.includes(c.ticker)?-4:2)+(c.stale?-3:0)+Math.min(2,features(c).filter(f=>!f.startsWith('industry:')).length)*0.5};}).sort((a,b)=>b.score-a.score||a.c.ticker.localeCompare(b.c.ticker));
 const out:CompanyResearchLive[]=[];
 while(pool.length){let index=0;if(out.length%4===3){const explorer=pool.findIndex(p=>p.match.score<=0);if(explorer>=0)index=explorer;}out.push(pool.splice(index,1)[0].c);}
 return out;
}
