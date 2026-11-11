import {describe,it,expect} from 'vitest';
import {recoverCalendar} from './earnings-calendar';
import type {CompanyCatalysts} from './catalysts';
const company:CompanyCatalysts={ticker:'ABC',checkedAt:'2026-10-29T12:00:00Z',news:[],earnings:null,newsStatus:'ok',calendarStatus:'unavailable',calendarUpdatedAt:null,warnings:['Earnings calendar is temporarily unavailable. No date is inferred.']};
const now=Date.parse('2026-10-29T12:00:00Z');
describe('calendar fallback',()=>{
 it('recovers an estimate without upgrading it to an announced date',()=>{const result=recoverCalendar(company,{data:{ticker:'ABC',next:{date:'2026-11-05',status:'estimated'}},updatedAt:'2026-10-28'},now);expect(result.earnings?.status).toBe('estimated');expect(result.calendarStatus).toBe('ok');expect(result.warnings).toEqual([]);});
 it('does not restore a date withdrawn by a reported schedule change',()=>{const result=recoverCalendar({...company,warnings:['A reported earnings schedule change needs verification. The earlier date is withheld.']},{data:{ticker:'ABC',next:{date:'2026-11-05',status:'estimated'}}},now);expect(result.earnings).toBeNull();});
 it('rejects a mismatched ticker',()=>{expect(()=>recoverCalendar(company,{data:{ticker:'XYZ'}},now)).toThrow('Calendar symbol mismatch');});
});
