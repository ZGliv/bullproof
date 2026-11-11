import { describe, expect, it } from 'vitest';
import { chartPoint, csvCell, headline, numericDomain, priorQuarter, symbol } from './research-view';
import type { CompanyResearchLive, FinancialQuarter } from './live-research-types';
const q = (year: number, income = 10): FinancialQuarter => ({ start: `${year}-07-01`, end: `${year}-09-30`, revenue: 100, operatingIncome: income, netIncome: null, operatingMargin: income, filed: `${year}-10-28`, accession: 'test', sourceUrl: 'https://www.sec.gov/', sources: {} });
const company = (growth: number | null, margin: number | null, income = 10): CompanyResearchLive => ({ ticker:'TEST', name:'Test', cik:'1', exchange:'NYSE', fetchedAt:'2026-10-28T12:00:00Z', latestFilingDate:'2026-10-28', latestFilingForm:'10-Q', periodEnd:'2026-09-30', quarters:[q(2025),q(2026,income)], signals:[{ id:'margin', title:'Margin improved', explanation:'', tone:'mixed', revenueGrowth:growth, operatingIncomeGrowth:null, marginChangePp:margin }], caveats:[], sourceUrl:'https://www.sec.gov/', stale:false, warnings:[] });
describe('research visualization safeguards', () => {
 it('does not turn missing or nonfinite comparisons into zero coordinates', () => { expect(chartPoint(company(null,2))).toBeNull(); expect(chartPoint(company(3,NaN))).toBeNull(); expect(chartPoint(company(0,0))).toMatchObject({x:0,y:0}); });
 it('keeps extreme losses and gains inside zero-inclusive domains', () => { const [low,high]=numericDomain([-3248.3,238.8,null]); expect(low).toBeLessThanOrEqual(-3248.3); expect(high).toBeGreaterThanOrEqual(238.8); expect(numericDomain([null,NaN])).toEqual([-0.6,0.6]); });
 it('compares matching fiscal periods, not the previous available quarter', () => { expect(priorQuarter([q(2025),q(2026)])?.end).toBe('2025-09-30'); expect(priorQuarter([{...q(2025),start:'2025-01-01'},q(2026)])).toBeUndefined(); });
 it('does not label an improved negative margin as profit', () => { expect(headline(company(-20,16,-82))).toBe('The operating loss margin improved.'); });
 it('preserves numeric negatives and neutralizes spreadsheet formulas', () => { expect(csvCell(-3)).toBe('"-3"'); expect(csvCell('=1+1')).toBe('"\'=1+1"'); });
 it('does not invent an exchange for a lookup without listing metadata', () => { expect(symbol({...company(1,1),exchange:''})).toBe('TEST'); expect(symbol(company(1,1))).toBe('NYSE:TEST'); });
});
