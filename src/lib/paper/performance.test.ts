import {describe,it,expect} from 'vitest';
import {newLedger,type Fill,type Mark} from './engine';
import {positions,commonComparison} from './performance';
const fill=(side:'buy'|'sell',shares:number,price:number,at:string):Fill=>({id:at,decision:'d',strategy:'growth',ticker:'TEST',side,shares,price,at,quoteAt:at,fee:0});
const mark=(strategy:string,at:string,equity:number):Mark=>({id:strategy+at,strategy,at,equity,cash:0,prices:{TEST:15}});
describe('portfolio display accounting',()=>{
 it('retains average cost through a partial sale, then adds new buys',()=>{const l=newLedger();l.fills=[fill('buy',10,10,'2026-10-29T13:00:00Z'),fill('sell',4,20,'2026-10-29T14:00:00Z'),fill('buy',4,20,'2026-10-29T15:00:00Z')];l.marks=[mark('growth','2026-10-29T15:00:01Z',100000)];const p=positions(l,'growth')[0];expect(p.shares).toBe(10);expect(p.cost).toBe(140);expect(p.average).toBe(14);expect(p.pnl).toBe(10);});
 it('does not apply a valuation predating the newest fill',()=>{const l=newLedger();l.fills=[fill('buy',10,10,'2026-10-29T15:00:00Z')];l.marks=[mark('growth','2026-10-29T14:00:00Z',100000)];expect(positions(l,'growth')[0].pnl).toBeNull();});
 it('compares at the latest shared timestamp, never mismatched observations',()=>{const l=newLedger();l.marks=[mark('growth','2026-10-29T13:35:00Z',101000),mark('spy','2026-10-29T13:35:00Z',100500),mark('growth','2026-10-29T14:05:00Z',103000)];expect(commonComparison(l,'growth')?.excess).toBeCloseTo(.5);expect(commonComparison(l,'growth')?.at).toBe('2026-10-29T13:35:00Z');expect(commonComparison(l,'quality')).toBeNull();});
 it('does not show sold-out positions',()=>{const l=newLedger();l.fills=[fill('buy',10,10,'2026-10-29T13:00:00Z'),fill('sell',10,20,'2026-10-29T14:00:00Z')];expect(positions(l,'growth')).toEqual([]);});
});
