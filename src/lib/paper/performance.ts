import {account,START_CASH,type Ledger,type Mark,type Evidence} from './engine';
export const returnPct=(equity:number)=>(equity/START_CASH-1)*100;
export function commonComparison(ledger:Ledger,strategy:string){
 const spy=new Map(ledger.marks.filter(m=>m.strategy==='spy').map(m=>[m.at,m]));
 const own=ledger.marks.filter(m=>m.strategy===strategy&&spy.has(m.at)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).at(-1);
 return own?{at:own.at,excess:returnPct(own.equity)-returnPct(spy.get(own.at)!.equity)}:null;
}
export function positions(ledger:Ledger,strategy:string){
 const a=account(ledger,strategy);
 const fills=ledger.fills.filter(f=>f.strategy===strategy).slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const mark=ledger.marks.filter(m=>m.strategy===strategy).slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).at(-1);
 const priced=mark&&(!fills.length||Date.parse(mark.at)>=Date.parse(fills.at(-1)!.at));
 const basis:Record<string,{shares:number;cost:number}>={};
 for(const f of fills){const b=basis[f.ticker]??={shares:0,cost:0};if(f.side==='buy'){b.cost+=f.shares*f.price+f.fee;b.shares+=f.shares;}else{b.cost-=b.shares?b.cost/b.shares*f.shares:0;b.shares-=f.shares;}}
 return Object.entries(a.positions).map(([ticker,shares])=>{
  const buy=fills.filter(f=>f.ticker===ticker&&f.side==='buy').at(-1)!;
  const decision=ledger.decisions.find(d=>d.id===buy.decision);
  const cost=basis[ticker]?.cost??0,price=priced?mark.prices[ticker]:undefined;
  return {ticker,shares,cost,average:cost/shares,price,value:price==null?null:price*shares,pnl:price==null?null:price*shares-cost,at:priced?mark.at:null,buy,decision,evidence:decision?.evidence.find(e=>e.ticker===ticker)};
 });
}
export function evidenceMetrics(e:Evidence|undefined,strategy:string){
 if(!e||strategy==='spy')return [];
 if(strategy==='rules')return [['Sales YoY',e.revenueGrowth==null?'—':`${e.revenueGrowth.toFixed(1)}%`],['Operating profit',e.operatingIncome==null?'—':e.operatingIncome>0?'Positive':'Nonpositive']];
 const n=(v:number|null|undefined,suffix:string)=>v==null?'—':`${v.toFixed(1)}${suffix}`;
 if(strategy==='growth')return [['Sales YoY',n(e.revenueGrowth,'%')],['Op. margin',n(e.margin,'%')],['P/E TTM',n(e.pe,'×')]];
 if(strategy==='quality')return [['Profitable quarters',String(e.profitableQuarters??'—')],['FCF yield',n(e.fcfYield,'%')],['P/E TTM',n(e.pe,'×')]];
 return [['Margin before',n(e.priorMargin,'%')],['Margin now',n(e.margin,'%')],['P/S TTM',n(e.ps,'×')]];
}
export function orderedMarks(marks:Mark[],strategy:string){return marks.filter(m=>m.strategy===strategy).slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));}
