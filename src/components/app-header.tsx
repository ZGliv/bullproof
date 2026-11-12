'use client';
import Link from 'next/link';
import Image from 'next/image';
import type {ReactNode} from 'react';

const NAV = [
  {id: 'slate', label: 'Slate', href: '/'},
  {id: 'record', label: 'Record', href: '/record'},
  {id: 'discover', label: 'Research', href: '/research'},
];

export function AppHeader({active,children,onDiscover}:{active:'discover'|'watchlist'|'markets'|'portfolios';children?:ReactNode;onDiscover?:()=>void}){
 return <header className="ah-header"><Link className="ah-brand" href="/"><Image src="/brand/bullproof.svg?v=20261029-bull" width={32} height={32} alt=""/>Bullproof</Link><nav aria-label="Main navigation">{NAV.map(n=><Link key={n.id} href={n.href} aria-current={active===n.id?'page':undefined} onClick={n.id==='discover'&&onDiscover?e=>{e.preventDefault();onDiscover();}:undefined}>{n.label}</Link>)}</nav><div className="ah-tools"><button onClick={()=>window.dispatchEvent(new Event("bullproof-open-sync"))}>Sync</button>{children}</div></header>;
}
