import {recoverCalendar} from '@/lib/earnings-calendar';
import type {CatalystResponse} from '@/lib/catalysts';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){
 const params=new URL(request.url).searchParams,symbols=params.get('symbols')??'',focus=params.get('focus');
 if(symbols.split(',').length>12||! /^[A-Z][A-Z0-9.\-]*(?:,[A-Z][A-Z0-9.\-]*)*$/.test(symbols)||symbols.length>140||focus&&!symbols.split(',').includes(focus))return Response.json({error:'Invalid symbols'},{status:400});
 try{const base=process.env.BULLPROOF_RUNNER_URL;if(!base)throw new Error('Missing hosted connection');const url=new URL('/catalysts',base);if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev'))throw new Error('Invalid host');url.searchParams.set('symbols',symbols);if(focus)url.searchParams.set('focus',focus);const r=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error('Source unavailable');const data=await r.json() as CatalystResponse;
 // The public provider can reject requests from a shared Worker IP. Only the
 // inspected ticker uses this cached, bounded fallback; news stays on the Worker.
 if(focus&&data.companies[focus]?.calendarStatus==='unavailable'){
  try{const calendar=await fetch(`https://xoomar.com/api/markets/earnings/${encodeURIComponent(focus)}`,{next:{revalidate:3600},signal:AbortSignal.timeout(8000)});
   if(calendar.ok)data.companies[focus]=recoverCalendar(data.companies[focus],await calendar.json());
  }catch{/* Preserve the explicit unavailable state, never infer a date. */}
 }
 return Response.json(data,{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'News and earnings sources are temporarily unavailable. Financial research is still available.'},{status:503});}
}
