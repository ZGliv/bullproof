import {describe,it,expect} from 'vitest';
import {marketDay,dailyResearchComplete,publishAllowed,clockIsFresh} from './schedule';
import {newLedger} from './engine';
import type {Decision} from './engine';
describe('automatic paper run policy',()=>{
 it('uses New York dates across UTC midnight and DST',()=>{expect(marketDay(new Date('2026-10-29T02:00:00Z'))).toBe('2026-10-28');expect(marketDay(new Date('2026-11-02T04:30:00Z'))).toBe('2026-11-01');});
 it('requires all five current-day decisions, never yesterday\'s proposal',()=>{const l=newLedger();expect(dailyResearchComplete(l,'2026-10-29')).toBe(false);l.decisions=['growth','quality','turnaround','rules','spy'].map(strategy=>({strategy,day:'2026-10-29',version:'v2'} as Decision));expect(dailyResearchComplete(l,'2026-10-29')).toBe(true);expect(dailyResearchComplete(l,'2026-10-30')).toBe(false);l.decisions.pop();expect(dailyResearchComplete(l,'2026-10-29')).toBe(false);});
 it('enforces publication cooldown and hard daily cap',()=>{const now=200000000;expect(publishAllowed(now,0,0)).toBe(true);expect(publishAllowed(now,now-28*60000,1)).toBe(false);expect(publishAllowed(now,now-30*60000,14)).toBe(true);expect(publishAllowed(now,0,15)).toBe(false);});
 it('refuses stale, invalid, and future market clocks',()=>{const now=Date.parse('2026-10-29T14:00:00Z');expect(clockIsFresh('2026-10-29T13:59:50Z',now)).toBe(true);expect(clockIsFresh('2026-10-29T13:58:00Z',now)).toBe(false);expect(clockIsFresh('2026-10-29T14:02:00Z',now)).toBe(false);expect(clockIsFresh('invalid',now)).toBe(false);});
});
