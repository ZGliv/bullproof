import {describe,it,expect} from 'vitest';
import {eligibility,selectCandidates} from './selection';
import type {Evidence} from './engine';
const now=Date.parse('2026-10-29T04:00:00Z');
const e:Evidence={ticker:'TEST',name:'Fixture',sourceUrl:'https://www.sec.gov',filed:'2026-10-20',period:'2026-09-30',revenue:100,operatingIncome:15,margin:15,revenueGrowth:20,marginChange:1,caveats:[],previousGrowth:15,priorOperatingIncome:10,priorMargin:14,profitableQuarters:4,ttmEarnings:40,freeCashFlow:30,pe:20,ps:3,fcfYield:4,priceAt:'2026-10-28T19:00:00Z'};
describe('distinct enforceable mandates',()=>{
 it('growth can qualify while expensive quality and non-recovery fail',()=>{const growth={...e,pe:45,fcfYield:1};expect(eligibility(growth,'growth',now).eligible).toBe(true);expect(eligibility(growth,'quality',now).eligible).toBe(false);expect(eligibility(growth,'turnaround',now).eligible).toBe(false);});
 it('a steady cash generator can qualify for quality without growth',()=>{const value={...e,revenueGrowth:2,previousGrowth:1};expect(eligibility(value,'quality',now).eligible).toBe(true);expect(eligibility(value,'growth',now).eligible).toBe(false);});
 it('recovery requires actual weakness and does not confuse any margin improvement with a turnaround',()=>{expect(eligibility({...e,marginChange:3,priorMargin:15},'turnaround',now).eligible).toBe(false);expect(eligibility({...e,marginChange:3,priorMargin:2,revenueGrowth:-4,pe:null},'turnaround',now).eligible).toBe(true);});
 it('missing valuation and stale evidence cannot enter any candidate packet',()=>{for(const id of ['growth','quality','turnaround'] as const){expect(selectCandidates([{...e,priceAt:null}],id,now)).toEqual([]);expect(eligibility({...e,period:'2024-09-30'},id,now).eligible).toBe(false);}expect(eligibility({...e,pe:null},'growth',now).eligible).toBe(false);});
 it('rejects outside tickers through the existing proposal validator after screening',async()=>{const {validateProposal}=await import('./engine');expect(()=>validateProposal({summary:'test',picks:[{ticker:'OUTSIDE',weight:20}]},selectCandidates([e],'growth',now))).toThrow('Unknown');});
});

it('explains recorded inputs with correct percentage-point units and source limitations',async()=>{
 const {measuredCase}=await import('./selection');const recovery=measuredCase({...e,priorMargin:2,margin:4.5,marginChange:2.5,freeCashFlow:null},'turnaround');expect(recovery.thesis).toContain('2.5 pp');expect(recovery.thesis).toContain('prior period');expect(recovery.countercase).toContain('unavailable');expect(measuredCase(e,'growth').thesis).toContain('20.0×');
});
