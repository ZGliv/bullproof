import {normalizeNews,resolveEarnings,type RawNews,type CompanyCatalysts} from '../src/lib/catalysts';
type Credentials={APCA_API_KEY_ID:string;APCA_API_SECRET_KEY:string};
const memory=new Map<string,{at:number;value:unknown}>(),pending=new Map<string,Promise<unknown>>();
async function memo<T>(key:string,seconds:number,load:()=>Promise<T>):Promise<T>{
 const existing=memory.get(key);if(existing&&Date.now()-existing.at<seconds*1000)return existing.value as T;
 const active=pending.get(key);if(active)return active as Promise<T>;
 const work=(async()=>{const edge=typeof caches!=='undefined'?(caches as CacheStorage&{default?:Cache}).default:undefined;const request=new Request(`https://bullproof-paper-runner.bullproof-markets.workers.dev/internal-cache/${encodeURIComponent(key)}`);const hit=await edge?.match(request);if(hit){const value=await hit.json() as T;memory.set(key,{at:Date.now(),value});return value;}
 const value=await load();memory.set(key,{at:Date.now(),value});while(memory.size>300)memory.delete(memory.keys().next().value!);if(edge)await edge.put(request,Response.json(value,{headers:{'Cache-Control':`public, max-age=${seconds}`}}));return value;})();pending.set(key,work);try{return await work;}finally{pending.delete(key);}
}
async function fetchJson(url:string,headers?:HeadersInit){const r=await fetch(url,{headers,signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error(`Source returned ${r.status}`);return r.json();}
import {calendarEstimate,type CalendarRow} from '../src/lib/earnings-calendar';
export {calendarEstimate} from '../src/lib/earnings-calendar';
let focusWindow=0,focusCount=0;
async function calendar(ticker:string,focused:boolean){
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
 if(focused)return memo(`calendar-company-v1:${ticker}`,3600,async()=>{
  if(Date.now()-focusWindow>60000){focusWindow=Date.now();focusCount=0;}if(focusCount>=6)throw new Error('Calendar pacing limit');focusCount++;
  const response=await fetchJson(`https://xoomar.com/api/markets/earnings/${encodeURIComponent(ticker)}`) as {data?:{ticker?:string;next?:CalendarRow};updatedAt?:string};
  if(response.data?.ticker!==ticker)throw new Error('Calendar symbol mismatch');return {estimate:calendarEstimate({...response.data.next,ticker},ticker,today),updatedAt:typeof response.updatedAt==='string'?response.updatedAt:null};
 });
 const snapshot=await memo('calendar-window-v1:'+today,3600,async()=>{const end=new Date(Date.parse(today)+119*86400000).toISOString().slice(0,10);const response=await fetchJson(`https://xoomar.com/api/markets/earnings?status=estimated&from=${today}&to=${end}&limit=2000`) as {data?:CalendarRow[];updatedAt?:string};if(!Array.isArray(response.data))throw new Error('Calendar format changed');return {rows:response.data,updatedAt:typeof response.updatedAt==='string'?response.updatedAt:null};});
 return {estimate:calendarEstimate(snapshot.rows.find(r=>r.ticker===ticker),ticker,today),updatedAt:snapshot.updatedAt};
}
async function news(ticker:string,env:Credentials){return memo(`news-v1:${ticker}`,900,async()=>{const start=new Date(Date.now()-30*86400000).toISOString();const r=await fetchJson(`https://data.alpaca.markets/v1beta1/news?symbols=${ticker}&start=${start}&limit=50&include_content=false&sort=desc`,{'APCA-API-KEY-ID':env.APCA_API_KEY_ID,'APCA-API-SECRET-KEY':env.APCA_API_SECRET_KEY}) as {news?:RawNews[];next_page_token?:string};if(!Array.isArray(r.news))throw new Error('News format changed');return {raw:r.news,checkedAt:new Date().toISOString(),more:!!r.next_page_token};});}
export async function catalystResponse(request:Request,env:Credentials){
 const params=new URL(request.url).searchParams,symbols=[...new Set((params.get('symbols')??'').split(','))],focus=params.get('focus');
 if(!symbols.length||symbols.length>12||symbols.some(s=>! /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s))||focus&&!symbols.includes(focus))return Response.json({error:'Use 1–12 valid stock symbols; focus must be included'},{status:400});
 const companies:Record<string,CompanyCatalysts>={};
 // Three companies in flight keeps upstream requests comfortably within the existing Basic allowance.
 for(let i=0;i<symbols.length;i+=3)await Promise.all(symbols.slice(i,i+3).map(async ticker=>{
  const [n,c]=await Promise.allSettled([news(ticker,env),calendar(ticker,ticker===focus)]);
  const raw=n.status==='fulfilled'?n.value.raw:[],estimate=c.status==='fulfilled'?c.value.estimate:null,resolved=resolveEarnings(estimate,raw,ticker,Date.now(),c.status==='fulfilled'?c.value.updatedAt:null);
  companies[ticker]={ticker,checkedAt:n.status==='fulfilled'?n.value.checkedAt:new Date().toISOString(),news:normalizeNews(raw,ticker),earnings:resolved.earnings,newsStatus:n.status==='fulfilled'?'ok':'unavailable',calendarStatus:c.status==='fulfilled'?'ok':'unavailable',calendarUpdatedAt:c.status==='fulfilled'?c.value.updatedAt:null,warnings:[...resolved.warnings,...(n.status==='fulfilled'&&n.value.more?['News coverage is limited to the latest 50 source articles in 30 days.']:[]),...(n.status==='rejected'?['News could not be refreshed. This does not mean there are no catalysts.']:[]),...(c.status==='rejected'?['Earnings calendar is temporarily unavailable. No date is inferred.']:[])]};
 }));
 return Response.json({companies,fetchedAt:new Date().toISOString()},{headers:{'Cache-Control':'public, max-age=60'}});
}
