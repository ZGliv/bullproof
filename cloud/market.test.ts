import {it,expect} from 'vitest';
import {parseObservation} from './market';
it('validates a real-trade timestamp and positive price; never uses an empty after-hours quote',()=>{const now=Date.parse('2026-10-29T04:00:00Z');expect(parseObservation({latestTrade:{p:12,t:'2026-10-28T19:59:00Z'},prevDailyBar:{c:10,t:'2026-10-27T04:00:00Z'}},now)?.dayChange).toBeCloseTo(20);expect(parseObservation({latestTrade:{p:0,t:'2026-10-28T19:00:00Z'}},now)).toBeNull();expect(parseObservation({latestTrade:{p:12,t:'2020-01-01'}},now)).toBeNull();expect(parseObservation({},now)).toBeNull();});
