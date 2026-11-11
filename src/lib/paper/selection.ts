import type { CompanyResearchLive } from '../live-research-types';
import type { Evidence } from './engine';
export const strategyRules = {
 growth: {name:'Growth',horizon:'1–3 years',description:'Sales growth ≥12% in the latest comparison and >0% in the previous comparison; operating profit >0; margin decline no worse than 2pp; P/E ≤60 and P/S ≤10.'},
 quality: {name:'Quality & value',horizon:'1–3 years',description:'Four reported profitable quarters, operating margin ≥12%, positive trailing earnings and free cash flow; P/E ≤25 and free-cash-flow yield ≥3%.'},
 turnaround: {name:'Recovery',horizon:'3–12 months',description:'A prior-year operating loss turns profitable, or margin rises ≥2pp from below 8%; sales decline no worse than 10%; P/S ≤4.'},
} as const;
export type StrategyId=keyof typeof strategyRules;
export function companyEvidence(c:CompanyResearchLive):Evidence {
 const q=c.quarters.at(-1),previous=c.quarters.at(-2),signal=c.signals[0];
 const prior=(end:string)=>c.quarters.find(p=>{const days=(Date.parse(end)-Date.parse(p.end))/86400000;return days>=350&&days<=380;});
 const lastYear=q?prior(q.end):undefined,prevYear=previous?prior(previous.end):undefined;
 const f=c.fundamentals,v=c.valuation;
 return {ticker:c.ticker,name:c.name,sourceUrl:c.sourceUrl,filed:c.latestFilingDate,period:c.periodEnd,revenue:q?.revenue??null,operatingIncome:q?.operatingIncome??null,margin:q?.operatingMargin??null,revenueGrowth:signal?.revenueGrowth??null,marginChange:signal?.marginChangePp??null,caveats:c.caveats,
  previousGrowth:previous&&q&&(Date.parse(q.end)-Date.parse(previous.end))/86400000<=120&&previous.revenue!==null&&prevYear?.revenue&&prevYear.revenue>0?(previous.revenue/prevYear.revenue-1)*100:null,
  priorOperatingIncome:lastYear?.operatingIncome??null,priorMargin:lastYear?.operatingMargin??null,
  profitableQuarters:c.quarters.slice(-4).filter(q=>q.operatingIncome!==null&&q.operatingIncome>0).length,
  ttmRevenue:f?.revenue?.value??null,ttmEarnings:f?.earnings?.value??null,freeCashFlow:f?.freeCashFlow?.value??null,
  pe:v?.pe??null,ps:v?.ps??null,fcfYield:v?.fcfYield??null,marketCap:v?.marketCap??null,price:v?.market?.price??null,priceAt:v?.market?.at??null,
  financialSources:[...new Set([f?.revenue,f?.earnings,f?.freeCashFlow,f?.shares].flatMap(m=>m?.sources.map(s=>s.sourceUrl)??[]))],valuationWarnings:v?.warnings??[],
 };
}
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export function eligibility(e:Evidence,strategy:StrategyId,now=Date.now()):{eligible:boolean;failures:string[];score:number} {
 const failures:string[]=[];const require=(ok:boolean,why:string)=>{if(!ok)failures.push(why);};
 require(Number.isFinite(Date.parse(e.period))&&now-Date.parse(e.period)<=180*86400000&&Date.parse(e.period)<=now,'Latest supported quarter must be within 180 days');
 require(!!e.priceAt&&Number.isFinite(Date.parse(e.priceAt))&&now-Date.parse(e.priceAt)<=7*86400000&&Date.parse(e.priceAt)<=now+60000,'Recent price required for valuation');
 require(number(e.margin)&&Math.abs(e.margin)<=100,'Extreme or missing operating margin needs accounting review');
 let score=0;
 if(strategy==='growth'){
  require(number(e.revenueGrowth)&&e.revenueGrowth>=12,'Latest sales growth below 12% or missing');require(number(e.previousGrowth)&&e.previousGrowth>0,'Previous comparable sales growth must be positive');require(number(e.operatingIncome)&&e.operatingIncome>0,'Operating profit must be positive');require(number(e.marginChange)&&e.marginChange>=-2,'Margin decline exceeds 2pp or comparison missing');require(number(e.pe)&&e.pe>0&&e.pe<=60,'Positive P/E at most 60 required');require(number(e.ps)&&e.ps>0&&e.ps<=10,'P/S at most 10 required');score=(e.revenueGrowth??0)-(e.pe??60)/5;
 }else if(strategy==='quality'){
  require((e.profitableQuarters??0)>=4,'Four reported profitable quarters required');require(number(e.margin)&&e.margin>=12,'Operating margin below 12% or missing');require(number(e.ttmEarnings)&&e.ttmEarnings>0,'Positive trailing earnings required');require(number(e.freeCashFlow)&&e.freeCashFlow>0,'Positive trailing free cash flow required');require(number(e.pe)&&e.pe>0&&e.pe<=25,'Positive P/E at most 25 required');require(number(e.fcfYield)&&e.fcfYield>=3,'FCF yield below 3% or missing');score=(e.fcfYield??0)*2+(e.margin??0)/5;
 }else{
  require(number(e.operatingIncome)&&e.operatingIncome>0&&number(e.priorOperatingIncome)&&e.priorOperatingIncome<=0||number(e.marginChange)&&e.marginChange>=2&&number(e.priorMargin)&&e.priorMargin<8,'No qualifying profit crossover or recovery from a low margin');require(number(e.revenueGrowth)&&e.revenueGrowth>=-10,'Sales decline worse than 10% or missing');require(number(e.ps)&&e.ps>0&&e.ps<=4,'P/S at most 4 required');score=(e.marginChange??0)*2-(e.ps??4);
 }
 return {eligible:failures.length===0,failures,score};
}
export function selectCandidates(evidence:Evidence[],strategy:StrategyId,now=Date.now()){return evidence.map(e=>({e,test:eligibility(e,strategy,now)})).filter(x=>x.test.eligible).sort((a,b)=>b.test.score-a.test.score||a.e.ticker.localeCompare(b.e.ticker)).slice(0,8).map(x=>x.e);}

/** Reader-facing reasoning is calculated from recorded inputs; the model's prose stays separately inspectable. */
export function measuredCase(e:Evidence,id:StrategyId){
 const n=(v:number|null|undefined,suffix='')=>number(v)?`${v.toFixed(1)}${suffix}`:'unavailable';
 const usd=(v:number|null|undefined)=>number(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:1}).format(v):'unavailable';
 const cashRisk=e.freeCashFlow==null?'Free cash flow is unavailable, so earnings cannot be checked against cash generation.':e.freeCashFlow<=0?`Trailing free cash flow is ${usd(e.freeCashFlow)}; accounting earnings are not converting into positive free cash flow.`:`Trailing free cash flow is ${usd(e.freeCashFlow)}. Check whether working-capital movements or unusually low capital spending inflated it.`;
 if(id==='growth')return {thesis:`Sales grew ${n(e.revenueGrowth,'%')} in the latest year-over-year comparison and ${n(e.previousGrowth,'%')} in the preceding comparison. Operating margin is ${n(e.margin,'%')}. Indicative P/E ${n(e.pe,'×')} and P/S ${n(e.ps,'×')} fit the growth price limits.`,countercase:cashRisk+' Reported sales growth may include acquisitions or currency; it is not proof of organic demand.',invalidate:'Recheck after the next filing: sales growth below 12%, a nonpositive previous comparison, an operating loss, or margin deterioration beyond 2 percentage points fails entry. P/E above 60× or P/S above 10× also fails. These are screen thresholds, not forecasts.'};
 if(id==='quality')return {thesis:`${e.profitableQuarters??0} reported profitable quarters, ${n(e.margin,'%')} operating margin and ${usd(e.ttmEarnings)} trailing net earnings. Free cash flow of ${usd(e.freeCashFlow)} implies a ${n(e.fcfYield,'%')} yield at an indicative ${n(e.pe,'×')} P/E.`,countercase:cashRisk+' A low multiple can reflect a business in decline; inspect the revenue trend and management discussion.',invalidate:'Recheck after the next filing: any loss in the last four reported quarters, margin below 12%, nonpositive trailing earnings or free cash flow, P/E above 25×, or FCF yield below 3% fails entry. Corporate actions require separate review.'};
 return {thesis:`Operating margin moved from ${n(e.priorMargin,'%')} to ${n(e.margin,'%')} (${n(e.marginChange,' pp')}). ${e.priorOperatingIncome!=null&&e.priorOperatingIncome<=0&&e.operatingIncome!=null&&e.operatingIncome>0?'Operating profit crossed above zero.':''} Sales changed ${n(e.revenueGrowth,'%')}; indicative P/S is ${n(e.ps,'×')}. The rule tests weakness in the prior period, not whether today's margin is below 8%.`,countercase:cashRisk+' Recovery can be temporary or driven by a one-off item; inspect the filing before treating it as durable.',invalidate:'Recheck after the next filing: no profit crossover and no ≥2pp margin recovery from a prior margin below 8%, sales decline worse than 10%, or P/S above 4× fails entry. This is a review trigger, not a price target.'};
}
