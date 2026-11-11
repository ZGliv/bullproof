import type {Metadata} from 'next';
import {PaperArena} from '@/components/paper-arena';
export const metadata:Metadata={title:'Research arena',description:'Competing hosted AI strategies, dated evidence, and auditable paper portfolios.'};
export default async function ArenaPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const q=await searchParams;
 const strategy=typeof q.strategy==='string'&&['growth','quality','turnaround'].includes(q.strategy)?q.strategy:'growth';
 const decision=typeof q.decision==='string'&&q.decision.length<200?q.decision:null;
 const ticker=typeof q.ticker==='string'&&/^[A-Z][A-Z0-9.-]{0,11}$/.test(q.ticker)?q.ticker:null;
 return <PaperArena key={`${strategy}:${decision}:${ticker}`} initialStrategy={strategy} initialDecision={decision} initialTicker={ticker}/>;
}
