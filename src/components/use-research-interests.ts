'use client';
import {useCallback,useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {INTEREST_KEY,parseInterests,features,type Interests,type Feedback} from '@/lib/research-interests';
import type {CompanyResearchLive} from '@/lib/live-research-types';
const snapshot=()=>{try{return localStorage.getItem(INTEREST_KEY);}catch{return null;}};
const subscribe=(fn:()=>void)=>{window.addEventListener('bullproof-interests',fn);window.addEventListener('storage',fn);return()=>{window.removeEventListener('bullproof-interests',fn);window.removeEventListener('storage',fn);};};
export function useResearchInterests(saved:string[]){
 const raw=useSyncExternalStore(subscribe,snapshot,()=>null),profile=useMemo(()=>parseInterests(raw),[raw]);
 const [error,setError]=useState('');
 const write=useCallback((change:(p:Interests)=>Interests)=>{try{localStorage.setItem(INTEREST_KEY,JSON.stringify({version:1,items:change(parseInterests(snapshot()))}));window.dispatchEvent(new Event('bullproof-interests'));setError('');}catch{setError('This browser could not save discovery feedback.');}},[]);
 const feedback=useCallback((c:CompanyResearchLive,action:Feedback['action'])=>write(p=>({...p,[c.ticker]:{action,features:features(c),at:new Date().toISOString(),enriched:!!c.context}})),[write]);
 const restore=useCallback((ticker:string)=>write(p=>Object.fromEntries(Object.entries(p).filter(([t])=>t!==ticker))),[write]);
 const savedKey=saved.join(',');
 // Existing watchlist entries teach the same model; notes and feedback never leave the browser.
 useEffect(()=>{const controller=new AbortController();async function learn(){const missing=savedKey.split(',').filter(t=>{const p=parseInterests(snapshot())[t];return t&&(!p||(p.action==='save'&&!p.enriched));});for(let i=0;i<missing.length;i+=2){await Promise.all(missing.slice(i,i+2).map(async ticker=>{try{const r=await fetch(`/api/company/${encodeURIComponent(ticker)}`,{signal:controller.signal});if(!r.ok)return;const c=await r.json() as CompanyResearchLive;if(c.ticker!==ticker||!Array.isArray(c.quarters))return;if(!controller.signal.aborted)write(p=>p[ticker]&&p[ticker].action!=='save'?p:{...p,[ticker]:{action:'save',features:features(c),at:p[ticker]?.at??new Date().toISOString(),enriched:true}});}catch{/* Missing fundamentals do not invent interests. */}}));if(controller.signal.aborted)return;}}void learn();return()=>controller.abort();},[savedKey,write]);
 return {profile,error,feedback,restore,reset:()=>write(()=>({}))};
}
