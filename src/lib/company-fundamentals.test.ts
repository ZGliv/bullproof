import {describe,it,expect} from 'vitest';
import {trailingMetric,extractFundamentals,deriveValuation} from './company-fundamentals';
import type {SecFact,SecCompanyFacts} from './live-research';
const fact=(start:string,end:string,val:number):SecFact=>({start,end,val,filed:'2026-10-20',accn:'0000000001-26-000001',form:'10-Q'});
function data(facts:SecFact[]):SecCompanyFacts{return {cik:1,entityName:'Fixture',facts:{'us-gaap':{Revenues:{units:{USD:facts}}}}};}
const annual=fact('2025-01-01','2025-12-31',400),current=fact('2026-01-01','2026-09-30',390),prior=fact('2025-01-01','2025-09-30',300);
describe('auditable trailing financials',()=>{
 it('bridges the missing fourth quarter without annualizing',()=>{const m=trailingMetric(data([annual,current,prior]),['Revenues'],'2026-09-30','2026-10-29');expect(m?.value).toBe(490);expect(m?.start).toBe('2025-10-01');expect(m?.sources).toHaveLength(3);});
 it('refuses missing comparatives, nonmatching fiscal intervals and future filings',()=>{expect(trailingMetric(data([annual,current]),['Revenues'],'2026-09-30','2026-10-29')).toBeNull();expect(trailingMetric(data([annual,current,{...prior,start:'2025-02-01'}]),['Revenues'],'2026-09-30','2026-10-29')).toBeNull();expect(trailingMetric(data([annual,current,prior]),['Revenues'],'2026-09-30','2026-10-01')).toBeNull();});
 it('keeps a complete annual year with its source',()=>{expect(trailingMetric(data([annual]),['Revenues'],'2025-12-31','2026-10-29')?.value).toBe(400);});
 it('does not manufacture missing cash flow or shares',()=>{const f=extractFundamentals(data([annual,current,prior]),'2026-09-30','2026-10-29');expect(f.freeCashFlow).toBeNull();expect(f.shares).toBeNull();expect(deriveValuation(f,null).marketCap).toBeNull();});
 it('withholds loss-making P/E, stale prices and ambiguous share-class valuation',()=>{const base=extractFundamentals(data([annual,current,prior]),'2026-09-30','2026-10-29');const f={...base,shares:{value:100,end:'2026-09-30',method:'reported',sources:[]},earnings:{value:-10,end:'2026-09-30',method:'reported',sources:[]}};const p={price:10,at:'2026-10-28T19:00:00Z',source:'Alpaca IEX' as const,previousClose:null,dayChange:null};const now=Date.parse('2026-10-29T04:00:00Z');expect(deriveValuation(f,p,false,now).pe).toBeNull();expect(deriveValuation(f,p,false,now).marketCap).toBe(1000);expect(deriveValuation(f,p,true,now).marketCap).toBeNull();expect(deriveValuation(f,{...p,at:'2026-10-01'},false,now).market).toBeNull();});
});
