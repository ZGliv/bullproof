'use client';
import Link from 'next/link';
import Image from 'next/image';
import type {ReactNode} from 'react';
export function AppHeader({active,children,onDiscover,onWatchlist,count}:{active:'discover'|'watchlist'|'markets'|'portfolios';children?:ReactNode;onDiscover?:()=>void;onWatchlist?:()=>void;count?:number}){
 return <header className="ah-header"><Link className="ah-brand" href="/" onClick={onDiscover?e=>{e.preventDefault();onDiscover();}:undefined}><Image src="/brand/bullproof.svg?v=20261029-bull" width={32} height={32} alt=""/>Bullproof</Link><nav aria-label="Main navigation">{[{id:'discover',label:'Discover',href:'/',action:onDiscover},{id:'watchlist',label:'Watchlist',href:'/?view=watchlist',action:onWatchlist},{id:'markets',label:'Markets',href:'/desk'},{id:'portfolios',label:'Portfolios',href:'/arena'}].map(n=><Link key={n.id} href={n.href} aria-current={active===n.id?'page':undefined} onClick={n.action?e=>{e.preventDefault();n.action!();}:undefined}>{n.label}{n.id==='watchlist'&&count!==undefined&&<small>{count}</small>}</Link>)}</nav><div className="ah-tools"><button onClick={()=>window.dispatchEvent(new Event("bullproof-open-sync"))}>Sync</button>{children}</div></header>;
}
