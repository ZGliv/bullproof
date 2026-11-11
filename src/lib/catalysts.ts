/** Source-linked events; classification is deterministic and never a prediction of price direction. */
export type CatalystKind='Guidance'|'Earnings'|'Deal / contract'|'Regulatory / legal'|'Capital return'|'Financing'|'Analyst view'|'Company news';
export type NewsCatalyst={id:string;headline:string;url:string;publishedAt:string;source:string;kind:CatalystKind;priority:number;question:string};
export type EarningsEvent={date:string;status:'estimated'|'reported-schedule';event?:'results'|'call';basis:string|null;source:string;url:string;publishedAt?:string};
export type CompanyCatalysts={ticker:string;checkedAt:string;news:NewsCatalyst[];earnings:EarningsEvent|null;newsStatus:'ok'|'unavailable';calendarStatus:'ok'|'unavailable';calendarUpdatedAt:string|null;warnings:string[]};
export type CatalystResponse={companies:Record<string,CompanyCatalysts>;fetchedAt:string};
export type RawNews={id?:number|string;headline?:unknown;summary?:unknown;url?:unknown;created_at?:unknown;updated_at?:unknown;source?:unknown;symbols?:unknown};
export function validDay(value:unknown):value is string {return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function safeArticleUrl(value:unknown):string|null{try{if(typeof value!=='string'||value.length>2000)return null;const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname))return null;if(u.pathname==='/'||/\/newsroom\/subject\/|\/(?:category|tag|quote)\//.test(u.pathname))return null;return u.href;}catch{return null;}}
function clean(value:unknown,max:number){return typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';}
export function classifyHeadline(headline:string):Pick<NewsCatalyst,'kind'|'priority'|'question'>{
 if(/\bguidance\b|\boutlook\b|\bsees\b.*\b(?:eps|sales|revenue)\b/i.test(headline))return {kind:'Guidance',priority:0,question:'Did management change the outlook? Compare the new range with the previous range and the financial thesis.'};
 if(/\b(?:merger|acqui(?:re|res|red|sition)|contract|partnership|order backlog)\b/i.test(headline))return {kind:'Deal / contract',priority:1,question:'Is the deal signed, how material is it, and when could it affect revenue or cash flow?'};
 if(/\b(?:fda|approval|approved|recall|regulator|litigation|lawsuit|investigation|securities law)\b/i.test(headline))return {kind:'Regulatory / legal',priority:2,question:'Check the actual regulator or court document. A law-firm announcement is an allegation, not a finding.'};
 if(/\b(?:earnings|financial results|eps)\b/i.test(headline))return {kind:'Earnings',priority:3,question:'Compare the reported result and guidance with expectations. Adjusted EPS and GAAP earnings are different measures.'};
 if(/\b(?:buyback|repurchase|dividend)\b/i.test(headline))return {kind:'Capital return',priority:4,question:'Is this an authorization or cash actually returned? Check funding and the size relative to the company.'};
 if(/\b(?:offering|refinanc|debt|convertible|capital raise)\w*/i.test(headline))return {kind:'Financing',priority:4,question:'What changes in dilution, interest costs, liquidity or refinancing risk?'};
 if(/\b(?:price target|upgrade|downgrade|maintains|reiterates|analyst)\b/i.test(headline))return {kind:'Analyst view',priority:6,question:'This is an outside opinion. Check whether the analyst identifies new business evidence.'};
 return {kind:'Company news',priority:7,question:'Identify a new, company-specific fact before treating this headline as an investment catalyst.'};
}
export function normalizeNews(raw:RawNews[],ticker:string,now=Date.now()):NewsCatalyst[]{
 const seen=new Set<string>();return raw.flatMap(a=>{const headline=clean(a.headline,300),url=safeArticleUrl(a.url),at=typeof a.created_at==='string'?Date.parse(a.created_at):NaN;
 if(!headline||!url||!Array.isArray(a.symbols)||!a.symbols.includes(ticker)||a.symbols.length>2||!Number.isFinite(at)||at>now+60000||now-at>30*86400000||seen.has(url)||seen.has(headline.toLowerCase()))return [];
 seen.add(url);seen.add(headline.toLowerCase());return [{id:String(a.id??url),headline,url,publishedAt:new Date(at).toISOString(),source:clean(a.source,60)||new URL(url).hostname.replace(/^www\./,''),...classifyHeadline(headline)}];
 }).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,12);
}
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
/** Requires an explicit scheduling phrase and a month/day, never interprets a quarter or publication date as a future report. */
export function announcedEarnings(raw:RawNews[],ticker:string,now=Date.now()):EarningsEvent|null {
 const today=new Date(now).toISOString().slice(0,10);const candidates:EarningsEvent[]=[];
 for(const a of raw){if(!Array.isArray(a.symbols)||a.symbols.length!==1||a.symbols[0]!==ticker)continue;const url=safeArticleUrl(a.url),published=typeof a.created_at==='string'?Date.parse(a.created_at):NaN;if(!url||!Number.isFinite(published)||published>now||now-published>60*86400000)continue;
 const text=clean(a.headline,400)+' '+clean(a.summary,1400);
 if(!/(?:\b(?:will|to|plans to|scheduled to)\s+(?:report|release|announce|host)|schedules?\b|sets?\s+(?:the\s+)?date\b)/i.test(text)||!/\b(?:earnings|financial results|quarter.*results)\b/i.test(text))continue;
 // The date must follow the scheduling action; a dateline preceding it cannot become the event.
 const action=text.search(/\b(?:will|to|plans to|scheduled to)\s+(?:report|release|announce|host)|schedules?\b|sets?\s+(?:the\s+)?date\b/i);
 const matches=[...text.slice(action).matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/gi)];
 const dates=[...new Set(matches.map(m=>{const month=months.findIndex(v=>v.startsWith(m[1].toLowerCase().replace('.','').slice(0,3)))+1;let year=m[3]?Number(m[3]):new Date(published).getUTCFullYear();if(!m[3]&&month===1&&new Date(published).getUTCMonth()>=10)year++;return `${year}-${String(month).padStart(2,'0')}-${m[2].padStart(2,'0')}`;}).filter(d=>validDay(d)&&d>=today&&Date.parse(d)-now<=120*86400000&&Date.parse(d)>=published-86400000))];
 if(dates.length===1)candidates.push({date:dates[0],status:'reported-schedule',event:/\b(?:conference|earnings) call\b/i.test(text)&&! /\b(?:report|release)\b.{0,100}\b(?:results|earnings)\b/i.test(text)?'call':'results',basis:null,source:clean(a.source,60)||new URL(url).hostname,url,publishedAt:new Date(published).toISOString()});
 }
 // The latest announcement supersedes an earlier schedule, including a postponement.
 return candidates.sort((a,b)=>(b.publishedAt??'').localeCompare(a.publishedAt??''))[0]??null;
}
export function resolveEarnings(estimate:EarningsEvent|null,raw:RawNews[],ticker:string,now=Date.now(),calendarUpdatedAt?:string|null):{earnings:EarningsEvent|null;warnings:string[]}{
 const announced=announcedEarnings(raw,ticker,now);
 const change=raw.filter(a=>Array.isArray(a.symbols)&&a.symbols.length===1&&a.symbols[0]===ticker&&typeof a.created_at==='string'&&Date.parse(a.created_at)<=now&&now-Date.parse(a.created_at)<30*86400000&&/\b(?:earnings|financial results)\b/i.test(String(a.headline))&&/\b(?:postpones?|postponed|delays?|delayed|cancels?|cancelled|reschedules?|rescheduled)\b/i.test(String(a.headline))).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];
 if(change&&(!announced||Date.parse(String(change.created_at))>Date.parse(announced.publishedAt!)))return {earnings:null,warnings:['A reported earnings schedule change needs verification. The earlier date is withheld.']};
 if(announced)return {earnings:announced,warnings:[]};
 const recentResult=normalizeNews(raw,ticker,now).find(n=>/\b(?:reports?|reported)\b.*\b(?:financial results|earnings)|\bQ[1-4]\b.*\bEPS\b.*\b(?:beats?|misses?|estimat)/i.test(n.headline)&&now-Date.parse(n.publishedAt)<14*86400000);
 if(estimate&&recentResult&&calendarUpdatedAt&&Number.isFinite(Date.parse(calendarUpdatedAt))&&Date.parse(recentResult.publishedAt)-Date.parse(calendarUpdatedAt)>7*86400000)return {earnings:null,warnings:['The calendar record predates the latest results report. Its estimate is withheld pending an updated record.']};
 if(estimate&&recentResult&&Date.parse(estimate.date)-Date.parse(recentResult.publishedAt)<14*86400000)return {earnings:null,warnings:['A recent results report conflicts with the calendar estimate. That estimate is withheld until the calendar catches up.']};
 return {earnings:estimate,warnings:[]};
}
export function estimatedWeek(date:string){const d=new Date(date+'T12:00:00Z');const day=d.getUTCDay();d.setUTCDate(d.getUTCDate()-(day===0?6:day-1));const end=new Date(d);end.setUTCDate(end.getUTCDate()+6);const fmt=(v:Date)=>v.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});return `${fmt(d)}–${fmt(end)}, ${end.getUTCFullYear()}`;}
export function priorityNews(news:NewsCatalyst[],now=Date.now()){return news.filter(n=>now-Date.parse(n.publishedAt)<=7*86400000).toSorted((a,b)=>a.priority-b.priority||b.publishedAt.localeCompare(a.publishedAt));}
