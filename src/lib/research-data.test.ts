import { describe, expect, it } from 'vitest';
import { researchData } from './research-data';

describe('reported research comparisons', () => {
  it('keeps GAAP margins consistent with reported revenue and operating income', () => {
    for (const data of Object.values(researchData)) {
      const revenue = data.metrics.find(m => m.id === 'revenue')!;
      const income = data.metrics.find(m => m.id === 'operating-income')!;
      const margin = data.metrics.find(m => m.id === 'operating-margin')!;
      for (const period of ['prior','current'] as const) {
        expect(Math.abs(income[period] / revenue[period] * 100 - margin[period])).toBeLessThan(.06);
      }
    }
  });
  it('preserves cash period overrides instead of presenting YTD cash as quarterly', () => {
    for (const slug of ['brunswick','mueller-water']) {
      const data = researchData[slug];
      for (const id of ['operating-cash-flow','free-cash-flow']) {
        const row = data.metrics.find(m => m.id === id)!;
        expect(row.period).toBeTruthy();
        expect(row.priorPeriod).toBeTruthy();
        expect(row.period).not.toBe(data.period);
      }
    }
    expect(researchData.gxo.metrics.find(m=>m.id==='free-cash-flow')!.prior).toBe(-43);
  });
  it('reconciles segment sales with consolidated sales, including Brunswick eliminations', () => {
    for (const [slug, eliminations] of [['brunswick',[-96.9,-94.3]],['mueller-water',[0,0]]] as const) {
      const d=researchData[slug];
      const revenue=d.metrics.find(m=>m.id==='revenue')!;
      for (const [i,period] of (['prior','current'] as const).entries()) {
        expect(d.segments.reduce((sum,m)=>sum+m[period],0)+eliminations[i]).toBeCloseTo(revenue[period],1);
      }
    }
  });
  it('gives every plotted measure a resolvable primary source and finite values', () => {
    for (const d of Object.values(researchData)) for (const m of [...d.metrics,...d.segments]) {
      expect(Number.isFinite(m.prior)&&Number.isFinite(m.current)).toBe(true);
      expect(d.sources[m.source].url).toMatch(/^https:\/\//);
      if(m.priorSource!==undefined) expect(d.sources[m.priorSource].url).toMatch(/^https:\/\//);
    }
  });
});
