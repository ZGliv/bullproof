'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight,Bookmark,X,Check} from 'lucide-react';
import {interestMatch,researchCase,featureLabel} from '@/lib/research-interests';
import type {useResearchInterests} from './use-research-interests';
import type {Ledger} from '@/lib/paper/engine';
import type {CompanyResearchLive,ListedCompany} from '@/lib/live-research-types';
import type {CompanyCatalysts} from '@/lib/catalysts';
import {aiPurchases,decisionLink,discoverySignal,strategyNames} from '@/lib/discovery-signals';
export function useDiscoveryLedger(){
 const [data,setData]=useState<(Ledger&{updatedAt:string})|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();let busy=false;async function load(){if(busy||document.visibilityState==='hidden')return;busy=true;try{const r=await fetch('/api/arena',{cache:'no-store',signal:controller.signal});if(!r.ok)throw new Error();const next=await r.json();if(!Array.isArray(next.fills)||!Array.isArray(next.decisions))throw new Error();if(!controller.signal.aborted){setData(next);setError('');}}catch{if(!controller.signal.aborted)setError('Portfolio feed unavailable');}finally{busy=false;}}void load();const timer=setInterval(load,60000);document.addEventListener('visibilitychange',load);return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',load);};},[revision]);
 return {data,error,refresh:()=>setRevision(v=>v+1)};
}
const date=(s:string)=>new Date(s.length===10?s+'T12:00:00Z':s).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'America/New_York'});
const pct=(n:number|null|undefined)=>n==null?'—':`${n>0?'+':''}${n.toFixed(1)}%`;
type Feed=ReturnType<typeof useDiscoveryLedger>;
export function DiscoveryCompanies({companies,events,portfolio,selected,onSelect,busy,newsLoading,saved,interests,watchlist,seen,onSave}:{companies:CompanyResearchLive[];events:Record<string,CompanyCatalysts>;portfolio:Feed;selected?:string;onSelect:(c:ListedCompany)=>void;busy:boolean;newsLoading:boolean;saved:boolean;interests:ReturnType<typeof useResearchInterests>;watchlist:string[];seen:string[];onSave:(c:CompanyResearchLive)=>void}){
 const [lastFeedback,setLastFeedback]=useState<string|null>(null);
 const [mode,setMode]=useState<'daily'|'events'|'buys'>('daily');
 const purchases=portfolio.data?aiPurchases(portfolio.data):[];
 const held=purchases.filter(p=>p.shares>0);
 const bought=[...new Set(held.map(p=>p.ticker))];
 const ordered=companies.map(c=>({c,signal:discoverySignal(c,events[c.ticker])}));
 const shown=mode==='events'?ordered.filter(r=>r.signal.recent):ordered;
 return <div className="daily-discovery">
 <div className="daily-tabs" aria-label="Discovery views"><button aria-pressed={mode==='daily'} onClick={()=>setMode('daily')}>{saved?'Saved scan':'For you'} <span>{companies.length}</span></button><button aria-pressed={mode==='events'} onClick={()=>setMode('events')}>New evidence</button><button aria-pressed={mode==='buys'} onClick={()=>setMode('buys')}>AI holdings <span>{portfolio.data?bought.length:'—'}</span></button></div>
 <details className="interest-controls"><summary>Preferences · {watchlist.length} saved</summary><p>Your research preferences. Saves favor shared industries and financial traits. Dismissals reduce similar ideas; familiar names are excluded without changing your interests. Matching uses explicit financial traits, not a predictive AI model. One in four places can explore outside your positive matches. “Not opened here” does not mean an objectively unknown company.</p><div>{Object.entries(interests.profile).map(([t,f])=><div className="interest-setting" key={t}><span><b>{t}</b> · {f.action==='save'?'Saved interest':f.action==='known'?'Already known':'Dismissed'}{f.action==='save'&&!watchlist.includes(t)?' · inactive':''}<small>{f.features.map(featureLabel).join(' · ')||'No measured traits available'}</small></span>{f.action!=='save'&&<button onClick={()=>interests.restore(t)}>Restore {t}</button>}</div>)}</div><button onClick={()=>{for(const [t,f] of Object.entries(interests.profile))if(f.action!=='save')interests.restore(t);}}>Reset exclusions</button><p>Saved interests stop affecting ranking when removed from your watchlist. Financial traits reflect the evidence available when saved; feedback is not sent to the portfolio strategies.</p></details>
 {interests.error&&<p role="alert" className="daily-status">{interests.error}</p>}
 {lastFeedback&&<div className="interest-undo" role="status">{lastFeedback} removed from discovery <button onClick={()=>{interests.restore(lastFeedback);setLastFeedback(null);}}>Undo</button></div>}
 {portfolio.error&&<p className="daily-status" role="status">{portfolio.error}{portfolio.data?` · last snapshot ${date(portfolio.data.updatedAt)}`:''} <button onClick={portfolio.refresh}>Retry</button></p>}
 <div className="daily-company-list">
 {mode==='buys'?<>{!portfolio.data?<p className="daily-status">{portfolio.error||'Loading recorded trades…'}</p>:!bought.length?<p className="daily-status">No executed AI holdings</p>:bought.map(t=>{const rows=held.filter(p=>p.ticker===t),e=rows[0].decision?.evidence.find(e=>e.ticker===t);return <article key={t} className="daily-company" data-selected={selected===t}><button className="daily-select" onClick={()=>onSelect(companies.find(c=>c.ticker===t)??{ticker:t,name:e?.name??t,cik:'',exchange:''})}><strong>{t}</strong><span>{e?.name??t}</span><ArrowUpRight size={16}/></button>{rows.map(p=><Link className="daily-buy" href={decisionLink(p.strategy,p.lastBuy.decision,t)} key={p.strategy}>{strategyNames[p.strategy]} · {p.shares} shares held <span>Last buy {date(p.lastBuy.at)} · ${p.lastBuy.price.toFixed(2)} ↗</span></Link>)}</article>;})}</>:shown.map(({c,signal})=><article className="daily-company" key={c.cik} data-selected={selected===c.ticker}>
 <button className="daily-select" aria-label={`Select ${c.ticker}`} onClick={()=>onSelect(c)}><strong>{c.ticker}</strong><span>{c.name}</span><ArrowUpRight size={16}/></button>
 <details className="terminal-lead-detail"><summary>Research signal <span>{pct(c.signals[0]?.revenueGrowth)} sales</span></summary><div className="interest-match">{(()=>{const match=interestMatch(c,interests.profile,watchlist);return match.matches[0]?`Like your save ${match.matches[0].ticker} · ${featureLabel(match.matches[0].feature)}`:seen.includes(c.ticker)?'Previously opened here':'Explore · not opened here';})()}</div>
 <a className="daily-reason interest-case" href={c.sourceUrl} target="_blank" rel="noreferrer">{researchCase(c).case} <ArrowUpRight size={12}/></a><div className="interest-risk">{researchCase(c).caution}</div>
 <div className="daily-label">{signal.label} · {signal.source} <time>{date(signal.date)}</time></div>{signal.source!=='SEC EDGAR'&&<a className="daily-reason daily-headline" href={signal.url} target="_blank" rel="noreferrer">{signal.title} <ArrowUpRight size={12}/></a>}
 <div className="daily-numbers"><span>Sales YoY <b>{pct(c.signals[0]?.revenueGrowth)}</b></span><span>Op. margin <b>{pct(c.quarters.at(-1)?.operatingMargin)}</b></span><span>P/E TTM <b>{c.valuation?.pe==null?'—':`${c.valuation.pe.toFixed(1)}×`}</b></span></div>
 <div className="daily-source">SEC financials · period {c.periodEnd}{c.valuation?.market?` · IEX price ${date(c.valuation.market.at)}`:" · valuation unavailable"}{c.stale?' · cached financials':''}{events[c.ticker]?.newsStatus==='unavailable'?' · news unavailable':!events[c.ticker]?(newsLoading?' · checking news':' · news not loaded'):''}</div>
 <div className="interest-actions"><button aria-label={`${watchlist.includes(c.ticker)?'Unsave':'Save'} ${c.ticker}`} onClick={()=>onSave(c)}><Bookmark size={13}/>{watchlist.includes(c.ticker)?'Saved':'Save'}</button><button aria-label={`Dismiss ${c.ticker}`} onClick={()=>{interests.feedback(c,'dismiss');setLastFeedback(c.ticker);}}><X size={13}/>Dismiss</button><button aria-label={`Already know ${c.ticker}`} onClick={()=>{interests.feedback(c,'known');setLastFeedback(c.ticker);}}><Check size={13}/>Already know</button></div>
 <div className="daily-buyers">{portfolio.data&&!held.some(p=>p.ticker===c.ticker)&&<span>No AI holding</span>}{held.filter(p=>p.ticker===c.ticker).map(p=><Link key={p.strategy} href={decisionLink(p.strategy,p.lastBuy.decision,c.ticker)}>{strategyNames[p.strategy]} holds {p.shares} · bought {date(p.lastBuy.at)} ↗</Link>)}</div>
 </details></article>)}
 {mode!=='buys'&&!shown.length&&<p className="daily-status">{busy?'Scanning SEC filings…':mode==='events'?(newsLoading?'Checking recent evidence…':'No verified news or filings in the last 7 days in this scan.'):'No matching companies in this scan.'}</p>}
 </div></div>;
}
export function CompanyPurchases({ticker,portfolio}:{ticker:string;portfolio:Feed}){
 const rows=portfolio.data?aiPurchases(portfolio.data).filter(p=>p.ticker===ticker):[];
 return <section className="daily-trades" aria-label={`${ticker} AI purchases`}><h3>AI paper trades</h3>{portfolio.error&&<p role="status">{portfolio.error} · shown history may be outdated</p>}{!rows.length?<p>{portfolio.data?'No recorded AI purchases':portfolio.error?'Purchase history unavailable':'Checking executed trades…'}</p>:rows.map(p=><Link key={p.strategy} href={decisionLink(p.strategy,p.lastBuy.decision,ticker)}><strong>{strategyNames[p.strategy]}</strong><span>{p.shares>0?`${p.shares} shares held`:'Position closed'}</span><span>Last buy {date(p.lastBuy.at)} · {p.lastBuy.shares} shares at ${p.lastBuy.price.toFixed(2)}</span><b>Why bought ↗</b></Link>)}</section>;
}
