/** Deterministic paper ledger. Model text never controls cash or execution prices. */
import {strategyRules} from './selection';
export type Policy = { id: string; name: string; mandate: string; color: string };
export const policies: Policy[] = [
  { id: 'growth', name: 'Growth', mandate: strategyRules.growth.description, color: '#20d99a' },
  { id: 'quality', name: 'Quality & value', mandate: strategyRules.quality.description, color: '#6aa9ff' },
  { id: 'turnaround', name: 'Recovery', mandate: strategyRules.turnaround.description, color: '#c899ff' },
];
export type Evidence = { ticker: string; name: string; sourceUrl: string; filed: string; period: string; revenue: number | null; operatingIncome: number | null; margin: number | null; revenueGrowth: number | null; marginChange: number | null; caveats: string[]; previousGrowth?:number|null; priorOperatingIncome?:number|null; priorMargin?:number|null; profitableQuarters?:number; ttmRevenue?:number|null; ttmEarnings?:number|null; freeCashFlow?:number|null; pe?:number|null; ps?:number|null; fcfYield?:number|null; marketCap?:number|null; price?:number|null; priceAt?:string|null; financialSources?:string[]; valuationWarnings?:string[] };
export type Pick = { ticker: string; weight: number; thesis: string; countercase: string; invalidate: string; horizon: '1–3 months' | '3–12 months' | '1–3 years'; evidence: string[] };
export type Decision = { id: string; day: string; strategy: string; at: string; model: string; version: string; selection?:{screened:number;eligible:string[];rules:string;rejected:{ticker:string;reasons:string[]}[]}; summary: string; picks: Pick[]; evidence: Evidence[] };
export type Quote = { bid: number; ask: number; at: string; bidSize: number; askSize: number };
export type Fill = { id: string; decision: string; strategy: string; ticker: string; side: 'buy'|'sell'; shares: number; price: number; at: string; quoteAt: string; fee: number };
export type Mark = { id: string; strategy: string; at: string; equity: number; cash: number; prices: Record<string,number> };
export type Attempt = { id: string; at: string; decision: string; status: 'executed' | 'blocked'; reason: string };
export type Ledger = { version: 1; startedAt: string; decisions: Decision[]; fills: Fill[]; marks: Mark[]; attempts: Attempt[] };
export const START_CASH = 100000;
export function newLedger(at = new Date().toISOString()): Ledger { return {version:1,startedAt:at,decisions:[],fills:[],marks:[],attempts:[]}; }
export function validateProposal(input: unknown, evidence: Evidence[]): {summary:string;picks:Pick[]} {
  if (!input || typeof input !== 'object') throw new Error('Model returned no proposal');
  const x=input as {summary:unknown;picks:unknown};
  if (typeof x.summary !== 'string' || !x.summary.trim() || x.summary.length>1500 || !Array.isArray(x.picks) || x.picks.length>5) throw new Error('Invalid proposal structure');
  const seen=new Set<string>(); let total=0;
  const picks=x.picks.map((raw: unknown) => {
    if (!raw || typeof raw!=='object') throw new Error('Invalid pick');
    const p=raw as Pick;
    if (!evidence.some(e=>e.ticker===p.ticker) || seen.has(p.ticker)) throw new Error('Unknown or duplicate ticker');
    seen.add(p.ticker);
    if (!Number.isFinite(p.weight) || p.weight<=0 || p.weight>20) throw new Error('Position must be between 0 and 20 percent');
    total+=p.weight;
    for (const key of ['thesis','countercase','invalidate'] as const) if (typeof p[key]!=='string' || !p[key].trim() || p[key].length>1800) throw new Error(`Missing or invalid ${key}`);
    if (!['1–3 months','3–12 months','1–3 years'].includes(p.horizon)) throw new Error('Invalid horizon');
    if (!Array.isArray(p.evidence) || !p.evidence.length || p.evidence.some(id=>id!==p.ticker)) throw new Error('Citation is not in this company evidence packet');
    return {ticker:p.ticker,weight:p.weight,thesis:p.thesis,countercase:p.countercase,invalidate:p.invalidate,horizon:p.horizon,evidence:p.evidence};
  });
  if (total>100) throw new Error('Target weights exceed capital');
  return {summary:x.summary,picks};
}
export function account(ledger: Ledger,strategy: string) {
  let cash=START_CASH; const positions:Record<string,number>={};
  for(const f of ledger.fills.filter(f=>f.strategy===strategy)) { const sign=f.side==='buy'?1:-1; cash-=sign*f.price*f.shares+f.fee; positions[f.ticker]=(positions[f.ticker]||0)+sign*f.shares; }
  return {cash,positions:Object.fromEntries(Object.entries(positions).filter(([,n])=>n>0))};
}
export function checkQuote(q: Quote|undefined,now: number,after?:number) {
  if(!q || ![q.bid,q.ask,q.bidSize,q.askSize].every(Number.isFinite) || q.bid<=0 || q.ask<q.bid || q.bidSize<=0 || q.askSize<=0) throw new Error('Missing or invalid IEX quote');
  const time=Date.parse(q.at);
  if(!Number.isFinite(time)||now-time>60000||time>now+1000) throw new Error('Quote is stale or future dated');
  if(after!==undefined && time<=after) throw new Error('Quote predates decision; waiting for a new quote');
  if((q.ask-q.bid)/q.ask>0.02) throw new Error('Spread exceeds 2%');
  return q;
}
export function execute(ledger: Ledger, decision: Decision, quotes:Record<string,Quote>, at:string, marketOpen:boolean): Ledger {
  if(ledger.attempts.some(a=>a.decision===decision.id&&a.status==='executed')) return ledger;
  const next=structuredClone(ledger); const attempt={id:`${decision.id}:${at}`,at,decision:decision.id};
  try {
    if(!marketOpen) throw new Error('US regular session is closed');
    if(Date.parse(at)-Date.parse(decision.at)>36*60*60*1000) throw new Error('Decision expired; run fresh research');
    const current=account(ledger,decision.strategy);
    const symbols=[...new Set([...Object.keys(current.positions),...decision.picks.map(p=>p.ticker)])];
    const validated=Object.fromEntries(symbols.map(t=>[t,checkQuote(quotes[t],Date.parse(at),Date.parse(decision.at))]));
    // Corporate actions are not ingested yet. Stop on a suspicious price jump rather than corrupt the ledger.
    const prior=ledger.marks.filter(m=>m.strategy===decision.strategy).at(-1);
    for(const t of Object.keys(current.positions)) if(prior?.prices[t] && Math.abs(validated[t].bid/prior.prices[t]-1)>0.25) throw new Error(`${t}: price discontinuity needs corporate-action review`);
    const equity=current.cash+Object.entries(current.positions).reduce((s,[t,n])=>s+n*validated[t].bid,0);
    const targets=Object.fromEntries(symbols.map(t=>{const w=decision.picks.find(p=>p.ticker===t)?.weight||0;return[t,Math.floor(equity*w/100/(validated[t].ask*1.0005))];}));
    const changes=symbols.map(t=>({ticker:t,delta:targets[t]-(current.positions[t]||0)})).filter(x=>x.delta!==0).sort((a,b)=>a.delta-b.delta);
    let cash=current.cash;
    const fills:Fill[]=[];
    for(const c of changes){ const q=validated[c.ticker];const buy=c.delta>0;const shares=Math.abs(c.delta); const price=(buy?q.ask*1.0005:q.bid*0.9995); if(shares>(buy?q.askSize:q.bidSize)*100) throw new Error(`${c.ticker}: order exceeds displayed IEX size`); cash-=c.delta*price; if(cash< -0.001) throw new Error('Insufficient cash'); fills.push({id:`${decision.id}:${c.ticker}`,decision:decision.id,strategy:decision.strategy,ticker:c.ticker,side:buy?'buy':'sell',shares,price,at,quoteAt:q.at,fee:0}); }
    next.fills.push(...fills); next.attempts.push({...attempt,status:'executed',reason:`${fills.length} fills. IEX bid/ask + 5 bps adverse slippage, zero commissions.`});
  } catch(e) { next.attempts.push({...attempt,status:'blocked',reason:e instanceof Error?e.message:'Execution blocked'}); }
  return next;
}
export function mark(ledger:Ledger,strategy:string,quotes:Record<string,Quote>,at:string):Ledger {
  const a=account(ledger,strategy);const prices:Record<string,number>={};
  const prior=ledger.marks.filter(m=>m.strategy===strategy).at(-1);
  for(const t of Object.keys(a.positions)) {prices[t]=checkQuote(quotes[t],Date.parse(at)).bid;if(prior?.prices[t]&&Math.abs(prices[t]/prior.prices[t]-1)>0.25)throw new Error(`${t}: valuation paused for corporate-action review`);}
  const equity=a.cash+Object.entries(a.positions).reduce((s,[t,n])=>s+n*prices[t],0);
  const id=`${strategy}:${at}`;
  if(ledger.marks.some(m=>m.id===id)) return ledger;
  return {...ledger,marks:[...ledger.marks,{id,strategy,at,equity,cash:a.cash,prices}]};
}
