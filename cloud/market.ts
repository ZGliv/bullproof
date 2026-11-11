import type { MarketObservation } from '../src/lib/company-fundamentals';
type Credentials={APCA_API_KEY_ID:string;APCA_API_SECRET_KEY:string};
const cache=new Map<string,{at:number;value:MarketObservation|null}>();let lastFetch=0;
export function parseObservation(value:unknown,now=Date.now()):MarketObservation|null {
 const s=value as {latestTrade?:{p:number;t:string};prevDailyBar?:{c:number;t:string}};const trade=s?.latestTrade;if(!trade||!Number.isFinite(trade.p)||trade.p<=0||!Number.isFinite(Date.parse(trade.t))||now-Date.parse(trade.t)>7*86400000||Date.parse(trade.t)>now+60000)return null;
 const previous=s.prevDailyBar;const close=previous&&Number.isFinite(previous.c)&&previous.c>0&&Date.parse(previous.t)<Date.parse(trade.t)&&Date.parse(trade.t)-Date.parse(previous.t)<7*86400000?previous.c:null;
 return {price:trade.p,at:trade.t,source:'Alpaca IEX',previousClose:close,dayChange:close?(trade.p/close-1)*100:null};
}
export async function marketResponse(request:Request,env:Credentials){
 const raw=new URL(request.url).searchParams.get('symbols')??'';const symbols=[...new Set(raw.split(','))].sort();if(!symbols.length||symbols.length>24||symbols.some(s=>! /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)))return Response.json({error:'Use 1–24 stock symbols'},{status:400});
 const now=Date.now(),missing=symbols.filter(s=>!cache.has(s)||now-cache.get(s)!.at>10*60000);
 if(missing.length){if(now-lastFetch<1500)return Response.json({error:'Price service busy; retry shortly'},{status:429});lastFetch=now;
 const r=await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?feed=iex&symbols=${encodeURIComponent(missing.join(','))}`,{headers:{'APCA-API-KEY-ID':env.APCA_API_KEY_ID,'APCA-API-SECRET-KEY':env.APCA_API_SECRET_KEY},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('IEX price observations unavailable');const data=await r.json() as Record<string,unknown>;
 for(const s of missing)cache.set(s,{at:now,value:parseObservation(data[s],now)});while(cache.size>500)cache.delete(cache.keys().next().value!);
 }
 return Response.json({observations:Object.fromEntries(symbols.map(s=>[s,cache.get(s)?.value??null])),fetchedAt:new Date(now).toISOString()},{headers:{'Cache-Control':'public, max-age=60'}});
}
