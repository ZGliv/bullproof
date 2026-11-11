import {describe,it,expect} from 'vitest';
import {normalizeNews,announcedEarnings,resolveEarnings,estimatedWeek,classifyHeadline,validDay,priorityNews,type RawNews,type EarningsEvent} from './catalysts';
const now=Date.parse('2026-10-29T13:00:00Z');
const article=(headline:string,extra:Partial<RawNews>={}):RawNews=>({id:1,headline,url:'https://example.com/news/one',created_at:'2026-10-28T13:00:00Z',symbols:['TEST'],source:'Test source',...extra});
const estimate:EarningsEvent={date:'2026-11-02',status:'estimated',basis:'2025-11-03',source:'XOOMAR',url:'https://xoomar.com/markets/stocks/test'};
describe('source-backed catalyst boundaries',()=>{
 it('filters wrong tickers, broad roundups, future timestamps, unsafe URLs and duplicates',()=>{const good=article('Company reports results');expect(normalizeNews([good,good,article('Other',{symbols:['OTHER']}),article('Roundup',{symbols:['TEST','B','C']}),article('Future',{created_at:'2027-01-01'}),article('Unsafe',{url:'javascript:alert(1)'})],'TEST',now)).toHaveLength(1);});
 it('prioritizes actual guidance news without assigning a price prediction',()=>{expect(classifyHeadline('Company lowers 2026 guidance').kind).toBe('Guidance');expect(classifyHeadline('Broker lowers price target').kind).toBe('Analyst view');const n=normalizeNews([article('Company buyback announced'),article('Company lowers guidance',{url:'https://example.com/other',id:2})],'TEST',now);expect(priorityNews(n,now)[0].kind).toBe('Guidance');});
 it('only extracts a future schedule with an explicit action and calendar date',()=>{expect(announcedEarnings([article('TEST to Report Third Quarter Earnings on November 5, 2026')],'TEST',now)?.date).toBe('2026-11-05');expect(announcedEarnings([article('TEST Q3 2026 earnings beat estimates')],'TEST',now)).toBeNull();expect(announcedEarnings([article('TEST to Report Earnings on October 10, 2026')],'TEST',now)).toBeNull();});
 it('rejects ambiguous multiple future dates and invalid calendar days',()=>{expect(announcedEarnings([article('TEST to Report Earnings November 5, 2026 or November 7, 2026')],'TEST',now)).toBeNull();expect(validDay('2026-02-30')).toBe(false);});
 it('keeps projections explicitly estimated and suppresses one overtaken by a results release',()=>{expect(resolveEarnings(estimate,[],'TEST',now).earnings?.status).toBe('estimated');const resolved=resolveEarnings(estimate,[article('TEST Reports Third Quarter Financial Results')],'TEST',now);expect(resolved.earnings).toBeNull();expect(resolved.warnings[0]).toContain('conflicts');});
 it('prefers a reported schedule over an estimate, without calling it confirmed',()=>{const result=resolveEarnings(estimate,[article('TEST to Release Earnings November 6, 2026')],'TEST',now);expect(result.earnings?.status).toBe('reported-schedule');expect(result.earnings?.date).toBe('2026-11-06');});
 it('shows the estimate as a week including year rather than false day precision',()=>{expect(estimatedWeek('2026-11-05')).toBe('Nov 2–Nov 8, 2026');});
});

it('withdraws an old date after a newer delay notice and labels a call separately',()=>{
 const schedule=article('TEST to Release Earnings November 5, 2026',{created_at:'2026-10-20T13:00:00Z'});
 const delayed=article('TEST Postpones Earnings Release',{created_at:'2026-10-28T13:00:00Z',url:'https://example.com/news/delayed'});
 expect(resolveEarnings(estimate,[schedule,delayed],'TEST',now).earnings).toBeNull();
 expect(announcedEarnings([article('TEST to Host Earnings Conference Call on November 6, 2026')],'TEST',now)?.event).toBe('call');
});

it('withholds an estimate based on a calendar record that missed the latest results',()=>{
 const result=resolveEarnings({...estimate,date:'2027-02-17'},[article('TEST Reports Third Quarter Financial Results')],'TEST',now,'2026-07-28T00:00:00Z');expect(result.earnings).toBeNull();expect(result.warnings[0]).toContain('predates');
});
