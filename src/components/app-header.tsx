'use client';
import Link from 'next/link';
import Image from 'next/image';
import type {ReactNode} from 'react';

type Active = 'discover' | 'watchlist' | 'markets' | 'portfolios';

export function AppHeader({
  active,
  children,
  onDiscover,
}: {
  active: Active;
  children?: ReactNode;
  onDiscover?: () => void;
}) {
  return (
    <header className="ah-header">
      {/* Slate and Record run without the legacy stylesheets, so leaving /research is a full page load. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- see above */}
      <a className="ah-brand" href="/">
        <Image src="/brand/bullproof.svg?v=20261029-bull" width={32} height={32} alt="" />
        Bullproof
      </a>
      <nav aria-label="Main navigation">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load, as above */}
        <a href="/">Slate</a>
        <a href="/record">Record</a>
        <Link
          href="/research"
          aria-current={active === 'discover' ? 'page' : undefined}
          onClick={
            onDiscover
              ? (event) => {
                  event.preventDefault();
                  onDiscover();
                }
              : undefined
          }
        >
          Research
        </Link>
      </nav>
      <div className="ah-tools">
        <button onClick={() => window.dispatchEvent(new Event('bullproof-open-sync'))}>Sync</button>
        {children}
      </div>
    </header>
  );
}
