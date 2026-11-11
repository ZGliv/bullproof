import {describe,it,expect} from 'vitest';
import {aiPurchases,discoverySignal,researchDay,decisionLink} from './discovery-signals';
import {newLedger,type Fill} from './paper/engine';
import type {CompanyResearchLive} from './live-research-types';
import type {CompanyCatalysts,NewsCatalyst} from './catalysts';
const fill=(overrides:Partial<Fill>={}):Fill=>({id:'f',decision:'d',strategy:'growth',ticker:'XYZ',side:'buy',shares:10,price:15,at:'2026-10-29T14:05:00Z',quoteAt:'2026-10-29T14:04:59Z',fee:0,...overrides});
describe('discovery execution evidence',()=>{
 it('never counts proposals or baseline fills as AI purchases',()=>{const l=newLedger();l.fills=[fill({strategy:'spy'}),fill({strategy:'rules'})];expect(aiPurchases(l)).toEqual([]);});
 it('reconciles partial sales and preserves the actual buy decision',()=>{const l=newLedger();l.fills=[fill({side:'sell',shares:3,at:'2026-10-30T14:05:00Z'}),fill()];const [p]=aiPurchases(l);expect(p.shares).toBe(7);expect(p.lastBuy.decision).toBe('d');});
 it('labels closed positions with zero holdings instead of current ownership',()=>{const l=newLedger();l.fills=[fill(),fill({side:'sell',at:'2026-10-30T14:05:00Z'})];expect(aiPurchases(l)[0].shares).toBe(0);});
 it('keeps each strategy separate for the same ticker',()=>{const l=newLedger();l.fills=[fill(),fill({strategy:'turnaround'})];expect(aiPurchases(l)).toHaveLength(2);});
 it('uses the New York research day across UTC midnight',()=>{expect(researchDay(Date.parse('2026-10-30T01:00:00Z'))).toBe('2026-10-29');expect(researchDay(Date.parse('2026-10-30T12:00:00Z'))).toBe('2026-10-30');});
 it('encodes the actual decision identity in the evidence link',()=>{expect(decisionLink('growth','2026:cloud-v2','ABC')).toContain('decision=2026%3Acloud-v2');});
});
const c={latestFilingDate:'2026-10-10',sourceUrl:'https://www.sec.gov/filing',signals:[{explanation:'Sales declined 4% year over year.'}]} as CompanyResearchLive;
const n=(date:string):NewsCatalyst=>({id:date,publishedAt:date,priority:0,kind:'Guidance',headline:'Company updates outlook',source:'Publisher',url:'https://example.com/story',question:''});
describe('dated discovery evidence',()=>{
 const now=Date.parse('2026-10-30T14:00:00Z');
 it('uses recent attributed news',()=>{const r=discoverySignal(c,{news:[n('2026-10-29T14:00:00Z')]} as CompanyCatalysts,now);expect(r.label).toBe('Guidance');expect(r.source).toBe('Publisher');});
 it('never presents stale or future news as a current catalyst',()=>{const r=discoverySignal(c,{news:[n('2026-10-31T14:00:00Z'),n('2026-10-01T14:00:00Z')]} as CompanyCatalysts,now);expect(r.label).toBe('Financial screen');expect(r.recent).toBe(false);expect(r.title).toContain('declined');});
 it('identifies a recent filing even without news coverage',()=>{expect(discoverySignal({...c,latestFilingDate:'2026-10-29'},undefined,now).label).toBe('New filing');});
});
