import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { etClock, etDay } from "./format";
import s from "./shell.module.css";

type Section = "slate" | "record" | "call" | "none";

const NAV: { id: Section; label: string; href: string }[] = [
  { id: "slate", label: "Slate", href: "/" },
  { id: "record", label: "Record", href: "/record" },
];

export function Shell({
  active,
  lockedAt,
  children,
}: {
  active: Section;
  lockedAt?: string | null;
  children: ReactNode;
}) {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.headerInner}>
          <Link className={s.brand} href="/" aria-label="Bullproof">
            <Image src="/brand/bullproof.svg" width={22} height={22} alt="" unoptimized />
            <span className={s.wordmark}>Bullproof</span>
          </Link>
          <nav className={s.nav} aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.id}
                className={s.navLink}
                href={item.href}
                aria-current={active === item.id ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
            {/* A plain anchor: /research runs on the legacy global stylesheets, so it gets a full page load. */}
            <a className={s.navLink} href="/research">
              Research
            </a>
          </nav>
          {lockedAt ? (
            <time className={s.locked} dateTime={lockedAt} title="Slate locked">
              <span className={s.lockedLabel}>Locked</span> {etDay(lockedAt)} {etClock(lockedAt)}
            </time>
          ) : null}
        </div>
      </header>
      <main className={s.main}>{children}</main>
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <span>AI-generated market commentary · Not investment advice</span>
          <span>SEC EDGAR · Alpaca</span>
        </div>
      </footer>
    </div>
  );
}

/** The single-row state used for empty lists and for an unreachable Worker. */
export function StateRow({ children }: { children: ReactNode }) {
  return <div className={s.stateRow}>{children}</div>;
}
