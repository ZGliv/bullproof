"use client";

import { useId } from "react";
import { ExternalLink } from "lucide-react";
import { discoveries, type Discovery } from "@/lib/discovery";
import { researchData, type ResearchCompany, type ResearchMetric } from "@/lib/research-data";

export function metric(data: ResearchCompany, id: string) {
  const value = data.metrics.find(item => item.id === id);
  if (!value) throw new Error(`Missing research metric: ${id}`);
  return value;
}
export function growth(m: ResearchMetric) { return (m.current / m.prior - 1) * 100; }
export function signed(n: number, suffix = "%") { return `${n > 0 ? "+" : ""}${n.toFixed(1)}${suffix}`; }
export function amount(n: number, unit: ResearchMetric["unit"] = "USDm") {
  if (unit === "percent") return `${n.toFixed(1)}%`;
  return `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 1 })}m`;
}
export function MetricSource({ data, item }: { data: ResearchCompany; item: ResearchMetric }) {
  return <div className="r-source"><a href={data.sources[item.source].url} target="_blank" rel="noopener noreferrer">Company filing <ExternalLink size={11}/></a><span>{item.basis}{item.priorSource !== undefined ? <> · <a href={data.sources[item.priorSource].url} target="_blank" rel="noopener noreferrer">Prior-year source <ExternalLink size={11}/></a></> : null}</span></div>;
}
export function DataTable({ data, rows }: { data: ResearchCompany; rows: ResearchMetric[] }) {
  return <details className="r-data"><summary>Inspect the numbers</summary><div className="r-table-scroll"><table><caption>Reported values · USD millions unless marked %</caption><thead><tr><th scope="col">Measure</th><th scope="col">Prior</th><th scope="col">Current</th></tr></thead><tbody>{rows.map(m => <tr key={m.id}><th scope="row">{m.label}<small>{m.basis}</small></th><td>{amount(m.prior, m.unit)}<small>{m.priorPeriod ?? data.priorPeriod}</small></td><td>{amount(m.current, m.unit)}<small>{m.period ?? data.period}</small></td></tr>)}</tbody></table></div>{rows.map(m => m.note ? <p key={m.id}><b>{m.label}:</b> {m.note}</p> : null)}</details>;
}

export function PairBars({ data, rows, compact = false }: { data: ResearchCompany; rows: ResearchMetric[]; compact?: boolean }) {
  const id = useId();
  const rawMax = Math.max(...rows.flatMap(m => [m.prior, m.current]), 1) * 1.18;
  const scale = 10 ** Math.floor(Math.log10(rawMax));
  const max = ([1, 2, 5, 10].find(step => step * scale >= rawMax) ?? 10) * scale;
  const min = Math.min(...rows.flatMap(m => [m.prior, m.current]), 0) * 1.3;
  const height = compact ? 170 : 210;
  const top = 25, bottom = height - 40;
  const y = (v: number) => bottom - (v - min) / (max - min) * (bottom - top);
  const ticks = [0, max / 2, max];
  const first = rows[0];
  return <div className={`r-pair ${compact ? 'r-compact' : ''}`}><div className="r-legend"><span><i className="r-prior"/>{(first.priorPeriod ?? data.priorPeriod).split(' · ')[0]}</span><span><i className="r-current"/>{(first.period ?? data.period).split(' · ')[0]}</span><small>USD m</small></div><svg viewBox={`0 0 420 ${height}`} role="img" aria-labelledby={id}><title id={id}>{rows.map(m => `${m.label}: ${amount(m.prior)} in ${m.priorPeriod ?? data.priorPeriod}, ${amount(m.current)} in ${m.period ?? data.period}`).join('. ')}</title>{ticks.map(t => <g key={t}><line x1="40" x2="412" y1={y(t)} y2={y(t)} className="r-gridline"/><text x="32" y={y(t)+4} textAnchor="end" className="r-axis">{Math.round(t)}</text></g>)}{rows.map((m, i) => {
    const center = 40 + (i + .5) * 372 / rows.length;
    const width = rows.length === 1 ? 67 : 44;
    return <g key={m.id}>{([m.prior,m.current] as const).map((v,j) => <g key={j}><rect x={center + (j === 0 ? -width-5 : 5)} y={Math.min(y(v),y(0))} width={width} height={Math.max(Math.abs(y(v)-y(0)),1)} rx="3" className={j === 0 ? 'r-bar-prior' : 'r-bar-current'}/><text x={center + (j === 0 ? -width/2-5 : width/2+5)} y={v >= 0 ? y(v)-8 : y(v)+16} textAnchor="middle" className="r-value">{v.toLocaleString('en-US',{maximumFractionDigits:1})}</text></g>)}<text x={center} y={height-8} textAnchor="middle" className="r-axis">{rows.length === 1 ? m.label : m.id === 'operating-cash-flow' ? 'Operating cash' : 'Free cash flow*'}</text></g>;
  })}</svg></div>;
}

export function GrowthBars({ data }: { data: ResearchCompany }) {
  const rows = [metric(data, 'revenue'), metric(data, 'operating-income')];
  return <div className="r-growth-bars">{rows.map(m => { const change = growth(m); return <div className="r-growth-row" key={m.id}><span>{m.id === 'revenue' ? 'Sales' : 'Operating profit'}</span><div className="r-diverging"><i style={{left: change < 0 ? `${38-Math.abs(change)*1.6}%` : '38%',width:`${Math.min(Math.abs(change)*1.6,60)}%`}} className={change < 0 ? 'r-negative' : 'r-positive'}/></div><strong className={change < 0 ? 'r-down' : ''}>{signed(change)}</strong></div>})}<div className="r-growth-scale"><span>Year-over-year change</span><span>GAAP · {data.period}</span></div></div>;
}

export function MarginChart({ data, adjusted }: { data: ResearchCompany; adjusted: boolean }) {
  const main = metric(data, adjusted ? 'adjusted-operating-margin' : 'operating-margin');
  const ceiling = Math.ceil(Math.max(main.prior,main.current) / 5) * 5 + 5;
  return <div className="r-margin"><div className="r-big-number">{amount(main.current, 'percent')}<span>{signed(main.current-main.prior,' pp')} YoY</span></div><div className="r-margin-field"><div className="r-margin-track"/><div className="r-margin-connector" style={{left:`${Math.min(main.current,main.prior)/ceiling*100}%`,width:`${Math.abs(main.current-main.prior)/ceiling*100}%`}}/>{[main.prior,main.current].map((value,i) => <div key={i} className={`r-margin-point ${i === 1 ? 'r-now' : ''}`} style={{left:`${value/ceiling*100}%`}}><i/><b>{value.toFixed(1)}%</b><small>{i === 0 ? data.priorPeriod : data.period}</small></div>)}</div><div className="r-margin-scale"><span>0%</span><span>{ceiling}%</span></div><p className="r-chart-note">{adjusted ? 'Company-adjusted operating margin. Exclusions are in the reconciliation.' : 'Operating profit as a share of sales. Percentage-point change, not percentage growth.'}</p><MetricSource data={data} item={main}/><DataTable data={data} rows={[main]}/></div>;
}

export function SegmentChart({ data }: { data: ResearchCompany }) {
  const max = Math.max(...data.segments.map(m => Math.abs(growth(m))),1) * 1.12;
  return <div className="r-segments">{data.segments.map(m => {const change=growth(m); return <div key={m.id} className="r-segment-row"><div><b>{m.label}</b><small>{amount(m.current)} sales</small></div><div className="r-segment-track"><i className={change < 0 ? 'r-negative' : 'r-positive'} style={{width:`${Math.abs(change)/max*100}%`}}/></div><strong>{signed(change)}</strong></div>})}<div className="r-growth-scale">Sales change vs same quarter last year · bar length shows magnitude; sign shows direction</div><MetricSource data={data} item={data.segments[0]}/><DataTable data={data} rows={data.segments}/></div>;
}

export function DiscoveryPlot({ selected, onSelect, items }: { selected: string; onSelect: (slug: string) => void; items: Discovery[] }) {
  const labelId=useId();
  return <div className="r-scatter"><div className="r-scatter-heading"><div><span className="r-kicker">THE DISCOVERY MAP</span><h2>Is profit keeping up?</h2></div><span className="r-chart-tag">Year-over-year %</span></div><div className="r-plot-y-label">GAAP operating profit growth</div><div className="r-plot-field" role="group" aria-labelledby={labelId}><span id={labelId} className="r-sr">Select a company to inspect revenue and operating profit growth</span>{[-20,-10,0,10,20,30].map(n => <div key={n} className={`r-h-grid ${n === 0 ? 'r-zero' : ''}`} style={{bottom:`${(n+20)/55*100}%`}}><span>{n > 0 ? '+' : ''}{n}%</span></div>)}{[0,2,4,6,8,10].map(n => <div key={n} className="r-v-grid" style={{left:`${n/10*100}%`}}><span>{n}%</span></div>)}<span className="r-region-label">Profit growing</span><span className="r-region-label r-region-low">Profit shrinking</span>{items.map(c => {const d=researchData[c.slug], rev=growth(metric(d,'revenue')),income=growth(metric(d,'operating-income'));return <button key={c.slug} className={`r-plot-dot r-color-${c.slug}`} aria-label={`${c.name}: revenue ${signed(rev)}, operating profit ${signed(income)}. Select company.`} aria-pressed={selected === c.slug} style={{left:`${rev/10*100}%`,bottom:`${(income+20)/55*100}%`}} onClick={()=>onSelect(c.slug)}><i/><span>{c.ticker}</span></button>})}</div><div className="r-plot-x-label">Revenue growth →</div><div className="r-plot-foot"><span><i/> Tap a company to investigate</span><span>3 selected businesses · not an investment ranking</span></div></div>;
}
export const researchAngles: Record<string,{title:string;question:string;signal:string}> = {
  gxo:{title:'More sales. Less operating profit.',question:'Will contract wins turn into better economics?',signal:'The conversion gap'},
  brunswick:{title:'Profit rebounds. Cash runs behind.',question:'How much of the marine recovery is repeatable?',signal:'The recovery test'},
  'mueller-water':{title:'Higher margins. Uneven demand.',question:'Is this pricing power or a temporary lift?',signal:'The infrastructure question'},
};
export const orderedCompanies = [...discoveries].sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
