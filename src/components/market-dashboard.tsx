"use client";

import Image from "next/image";
import {AppHeader} from "./app-header";
import "./legacy-refinement.css";

import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  Info,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ResearchEditor, ResearchNotebook } from "./research-notebook";
import { createResearchCase, NOTEBOOK_KEY, parseNotebook, serializeNotebook, upsertResearchCase, type ResearchCase } from "@/lib/research-notebook";
import { getFallbackSnapshot } from "@/lib/fallback-data";
import type { MarketPeriod, MarketSnapshot, ResearchIdea, StockMover } from "@/lib/types";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const WATCHLIST_KEY = "parlai-watchlist:v1";

function readWatchlist(): string[] {
  try {
    const stored = window.localStorage.getItem(WATCHLIST_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

function persistWatchlist(symbols: string[]) {
  try {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(symbols));
    window.dispatchEvent(new Event("bullproof-notebook"));
  } catch {
    // Persistence can be unavailable in private browsing or restricted contexts.
  }
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(Math.abs(value) >= 100 ? 0 : 1)}%`;
}

function formatSignedMoney(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return `${sign}${formatted}`;
}

function formatFetchedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(value));
}

function initials(symbol: string) {
  return symbol.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "—";
}

function matchesQuery(stock: StockMover, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return `${stock.symbol} ${stock.name} ${stock.sector ?? ""}`.toLowerCase().includes(normalized);
}

function breadthPercent(snapshot: MarketSnapshot) {
  const directional = snapshot.advancers + snapshot.decliners;
  return directional === 0 ? 50 : (snapshot.advancers / directional) * 100;
}

function EmptyMovers({ query }: { query: string }) {
  return (
    <div className="empty-state">
      <Search size={19} />
      <p>No movers match “{query}”.</p>
      <span>Try a ticker or clear the search.</span>
    </div>
  );
}

interface MoverPanelProps {
  title: string;
  kicker: string;
  tone: "positive" | "negative";
  stocks: StockMover[];
  query: string;
  onSelect: (stock: StockMover) => void;
}

function MoverPanel({ title, kicker, tone, stocks, query, onSelect }: MoverPanelProps) {
  const Icon = tone === "positive" ? TrendingUp : TrendingDown;

  return (
    <section className={`mover-panel ${tone}`} aria-labelledby={`${tone}-movers-title`}>
      <div className="panel-heading">
        <div>
          <p className="section-kicker">{kicker}</p>
          <h3 id={`${tone}-movers-title`}><Icon size={20} /> {title}</h3>
        </div>
        <span className="row-count">{stocks.length} shown</span>
      </div>

      {stocks.length === 0 ? (
        <EmptyMovers query={query} />
      ) : (
        <div className="table-scroll">
          <table className="mover-table">
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Price</th>
                <th scope="col">Move</th>
                <th scope="col">Volume</th>
                <th scope="col"><span className="sr-only">Open details</span></th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock) => (
                <tr key={stock.symbol} onClick={() => onSelect(stock)}>
                  <td>
                    <button
                      className="stock-identity"
                      type="button"
                      onClick={() => onSelect(stock)}
                      aria-label={`Open research details for ${stock.symbol}`}
                    >
                      <span className="rank">{String(stock.rank).padStart(2, "0")}</span>
                      <span className="ticker-avatar" aria-hidden="true">{initials(stock.symbol)}</span>
                      <span className="ticker-copy">
                        <strong>{stock.symbol}</strong>
                        <small>{stock.name === stock.symbol ? "U.S. listed equity" : stock.name}</small>
                      </span>
                    </button>
                  </td>
                  <td className="numeric-cell">
                    <strong>{formatPrice(stock.price)}</strong>
                    <small>{formatSignedMoney(stock.changeAmount)}</small>
                  </td>
                  <td className={`numeric-cell move-cell ${tone}`}>
                    <strong>
                      {tone === "positive" ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                      {formatPercent(stock.changePercent)}
                    </strong>
                    <small>{tone === "positive" ? "Gain" : "Loss"}</small>
                  </td>
                  <td className="numeric-cell volume-cell">
                    <strong>{compactFormatter.format(stock.volume)}</strong>
                    <small>shares</small>
                  </td>
                  <td><ChevronRight className="row-chevron" size={17} aria-hidden="true" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface IdeaCardProps {
  idea: ResearchIdea;
  saved: boolean;
  onToggleSaved: (symbol: string) => void;
  onSelect: (stock: StockMover) => void;
}

function IdeaCard({ idea, saved, onToggleSaved, onSelect }: IdeaCardProps) {
  return (
    <article className="idea-card">
      <div className="idea-topline">
        <div className="idea-symbol">
          <span className="ticker-avatar large" aria-hidden="true">{initials(idea.stock.symbol)}</span>
          <div>
            <strong>{idea.stock.symbol}</strong>
            <span>{idea.horizon}</span>
          </div>
        </div>
        <button
          className={`icon-button ${saved ? "saved" : ""}`}
          type="button"
          onClick={() => onToggleSaved(idea.stock.symbol)}
          aria-label={saved ? `Remove ${idea.stock.symbol} from watchlist` : `Add ${idea.stock.symbol} to watchlist`}
        >
          {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
        </button>
      </div>

      <div className="score-line">
        <div>
          <span>Signal score</span>
          <strong>{idea.score}<small>/100</small></strong>
        </div>
        <span className="signal-pill"><Sparkles size={13} /> {idea.label}</span>
      </div>

      <div className="factor-list" aria-label="Signal factor scores">
        {idea.factors.map((factor) => (
          <div className="factor" key={factor.label}>
            <div><span>{factor.label}</span><strong>{factor.value}</strong></div>
            <div className="factor-track"><span style={{ width: `${factor.value}%` }} /></div>
          </div>
        ))}
      </div>

      <div className="idea-reason">
        <span className="check-icon" aria-hidden="true"><Check size={12} /></span>
        <p>{idea.thesis[0]}</p>
      </div>

      <button className="text-button" type="button" onClick={() => onSelect(idea.stock)}>
        Open research snapshot <ArrowRight size={15} />
      </button>
    </article>
  );
}

interface DetailDrawerProps {
  stock: StockMover;
  idea?: ResearchIdea;
  period: MarketPeriod;
  saved: boolean;
  onToggleSaved: (symbol: string) => void;
  onClose: () => void;
  onStartCase: () => void;
}

function DetailDrawer({ stock, idea, period, saved, onToggleSaved, onClose, onStartCase }: DetailDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={onClose}>
      <aside
        className="detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <span className="drawer-label">Research snapshot · {period}</span>
          <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="Close details">
            <X size={19} />
          </button>
        </div>

        <div className="drawer-company">
          <span className="ticker-avatar xlarge" aria-hidden="true">{initials(stock.symbol)}</span>
          <div>
            <p>{stock.exchange} {stock.sector ? `· ${stock.sector}` : "· U.S. listed"}</p>
            <h2 id="stock-detail-title">{stock.symbol}</h2>
            {stock.name !== stock.symbol && <span>{stock.name}</span>}
          </div>
          <button
            className={`watch-button ${saved ? "saved" : ""}`}
            type="button"
            onClick={() => onToggleSaved(stock.symbol)}
          >
            {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            {saved ? "Watching" : "Watch"}
          </button>
        </div>

        <div className="drawer-price">
          <div>
            <span>Latest close</span>
            <strong>{formatPrice(stock.price)}</strong>
          </div>
          <div className={stock.changePercent >= 0 ? "gain" : "loss"}>
            <span>{period} price move</span>
            <strong>{formatPercent(stock.changePercent)}</strong>
            <small>{formatSignedMoney(stock.changeAmount)}</small>
          </div>
        </div>

        <div className="detail-metrics">
          <div><span>Baseline close</span><strong>{formatPrice(stock.baselinePrice)}</strong></div>
          <div><span>Latest volume</span><strong>{compactFormatter.format(stock.volume)}</strong></div>
          <div><span>Screen rank</span><strong>#{stock.rank}</strong></div>
        </div>

        {idea ? (
          <>
            <section className="drawer-section">
              <div className="drawer-section-title">
                <h3>Why it surfaced</h3>
                <span>{idea.score}/100 signal</span>
              </div>
              <ul className="evidence-list positive-list">
                {idea.thesis.map((item) => <li key={item}><Check size={14} /> <span>{item}</span></li>)}
              </ul>
            </section>
            <section className="drawer-section risk-section">
              <div className="drawer-section-title"><h3>What to investigate</h3><ShieldAlert size={18} /></div>
              <ul className="evidence-list risk-list">
                {idea.risks.map((item) => <li key={item}><span>{item}</span></li>)}
              </ul>
            </section>
          </>
        ) : (
          <section className="drawer-section risk-section">
            <div className="drawer-section-title"><h3>Context before conclusions</h3><Info size={18} /></div>
            <p className="drawer-copy">
              This stock appears in the movers table, not the positive research-signal set. A large decline is not automatically a bargain; investigate the catalyst, balance sheet, dilution risk, and liquidity first.
            </p>
          </section>
        )}

        <button type="button" className="research-save start-case" onClick={onStartCase}>Start research case <ArrowRight size={16} /></button>
        
        <div className="drawer-disclosure">
          <ShieldAlert size={16} />
          <p>Research signal only—not a recommendation to buy, sell, or hold. Prices can move before you act.</p>
        </div>
      </aside>
    </div>
  );
}

export function MarketDashboard({ initialSnapshot }: { initialSnapshot: MarketSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [query, setQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [showFeedNote, setShowFeedNote] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockMover | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [cases, setCases] = useState<ResearchCase[]>([]);
  const [activeCase, setActiveCase] = useState<ResearchCase | null>(null);
  const [notebookError, setNotebookError] = useState("");
  const [notebookLoaded, setNotebookLoaded] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setWatchlist(readWatchlist());
      try {
        setCases(parseNotebook(window.localStorage.getItem(NOTEBOOK_KEY)));
        setNotebookLoaded(true);
      } catch { setNotebookError("Your saved notebook could not be read. Existing data has been preserved; saving is disabled until browser storage is available and readable."); }
    });

    const synced=()=>{setWatchlist(readWatchlist());try{setCases(parseNotebook(window.localStorage.getItem(NOTEBOOK_KEY)));}catch{setNotebookError("Synced notebook could not be read; local data retained.");}};
    window.addEventListener('bullproof-notebook',synced);
    return () => {window.cancelAnimationFrame(frame);window.removeEventListener('bullproof-notebook',synced);};
  }, []);

  const savedSymbols = useMemo(() => new Set(watchlist), [watchlist]);
  const visibleWinners = useMemo(
    () => snapshot.winners.filter((stock) => matchesQuery(stock, query)),
    [snapshot.winners, query],
  );
  const visibleLosers = useMemo(
    () => snapshot.losers.filter((stock) => matchesQuery(stock, query)),
    [snapshot.losers, query],
  );
  const selectedIdea = selectedStock
    ? snapshot.ideas.find((idea) => idea.stock.symbol === selectedStock.symbol)
    : undefined;
  const advanceShare = breadthPercent(snapshot);

  function toggleSaved(symbol: string) {
    setWatchlist((current) => {
      const next = current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : [...current, symbol];
      persistWatchlist(next);
      return next;
    });
  }

  function saveCase(item: ResearchCase): string | null {
    if (!notebookLoaded) return "The existing notebook could not be loaded. Your draft is still open; existing data will not be overwritten.";
    try {
      // Re-read at save time so another tab's new cases are not overwritten.
      const stored = parseNotebook(window.localStorage.getItem(NOTEBOOK_KEY));
      const existing = stored.find((record) => record.id === item.id);
      if (existing && existing.updatedAt !== activeCase?.updatedAt) {
        return "This case was updated in another tab. Your draft is still open. Copy your edits, then close and reload to review the newer saved case.";
      }
      const next = upsertResearchCase(stored, item, activeCase?.updatedAt ?? item.updatedAt);
      window.localStorage.setItem(NOTEBOOK_KEY, serializeNotebook(next));
      window.dispatchEvent(new Event("bullproof-notebook"));
      setCases(next);
      setSaveNotice(`${item.symbol} case saved in this browser. Reopen it from your research desk.`);
      return null;
    } catch { return "Could not save to browser storage. Keep this draft open and allow storage or free up space, then retry."; }
  }

  function startCase(stock: StockMover) {
    const draft = createResearchCase(stock, snapshot);
    setActiveCase(cases.find((item) => item.id === draft.id) ?? draft);
    setSelectedStock(null);
  }

  function trySampleCase() {
    const sample = getFallbackSnapshot("1D");
    const draft = createResearchCase(sample.winners[0], sample);
    setActiveCase(cases.find((item) => item.id === draft.id) ?? {
      ...draft,
      hypothesis: "Practice case: did a company announcement explain the unusual move?",
      evidence: "Illustrative exercise only. DEMO1 and its price move are fictional. No filing, news event, or catalyst has been verified. Replace this note with a dated primary source in a real case.",
      counterEvidence: "A price jump alone cannot establish the cause. We have not checked broader market moves, company filings, or share issuance.",
      falsifier: "Reject the explanation if a dated primary source contradicts the proposed announcement, or shows it occurred after the move.",
    });
  }

  async function loadPeriod(period: MarketPeriod) {
    if (period === "1W" && !snapshot.supportsWeekly) {
      setShowFeedNote(true);
      return;
    }

    setIsRefreshing(true);
    setRefreshError("");
    setShowFeedNote(false);

    try {
      const response = await fetch(`/api/market?period=${period}`);
      if (!response.ok) throw new Error("Market refresh failed");
      const nextSnapshot = (await response.json()) as MarketSnapshot;
      setSnapshot(nextSnapshot);
      setSelectedStock(null);
    } catch {
      setRefreshError("The data feed did not refresh. The last successful snapshot is still shown.");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="app-shell">
      <AppHeader active="markets">
        <div className="header-status">
          <span className={`status-dot ${snapshot.isFallback ? "sample" : ""}`} aria-hidden="true" />
          <span>{snapshot.isFallback ? "Sample mode" : "EOD data"}</span>
          <small>{snapshot.marketDate}</small>
        </div>
      </AppHeader>

      <main id="top">
        <section className="hero-section">
          <div className="hero-grid-lines" aria-hidden="true" />
          <div className="hero-copy">
            
            <h1>Market movers</h1>
            
            <div className="hero-research-actions"><a className="research-save" href="#notebook">Open your research desk <ArrowRight size={16} /></a><button type="button" className="text-button" onClick={trySampleCase}>Try a sample case <ArrowRight size={15} /></button></div>
          </div>
          <div className="hero-aside">
            <div className="period-card">
              <span className="control-label">Price return window</span>
              <div className="period-switch" role="group" aria-label="Select price return period">
                {(["1D", "1W"] as MarketPeriod[]).map((period) => (
                  <button
                    key={period}
                    type="button"
                    className={snapshot.period === period ? "active" : ""}
                    onClick={() => void loadPeriod(period)}
                    aria-pressed={snapshot.period === period}
                    aria-label={
                      period === "1W" && !snapshot.supportsWeekly
                        ? "1W — licensed full-market feed required"
                        : undefined
                    }
                    data-locked={period === "1W" && !snapshot.supportsWeekly}
                  >
                    {period}
                    {period === "1W" && !snapshot.supportsWeekly && <LockKeyhole size={12} />}
                  </button>
                ))}
              </div>
              <div className="coverage-row">
                <Database size={15} />
                <div>
                  <strong>{snapshot.coverage === "full" ? "Full-market feed" : "Headline movers feed"}</strong>
                  <span>{snapshot.notice}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {showFeedNote && (
          <div className="feed-note" role="status">
            <div><LockKeyhole size={18} /><p><strong>1W is wired, but needs a licensed full-market feed.</strong><span>Add a server-side Massive key to unlock full-universe 1D and 1W price-return rankings.</span></p></div>
            <button type="button" onClick={() => setShowFeedNote(false)} aria-label="Dismiss feed notice"><X size={17} /></button>
          </div>
        )}

        {(snapshot.isFallback || refreshError) && (
          <div className="data-warning" role="status">
            <Info size={17} />
            <span>{refreshError || snapshot.notice}</span>
          </div>
        )}

        <section className="snapshot-section" aria-labelledby="snapshot-title">
          <div className="section-heading compact-heading">
            <div>
              <p className="section-kicker">Market snapshot</p>
              <h2 id="snapshot-title">The tape, at a glance</h2>
            </div>
            <div className="updated-copy"><Clock3 size={14} /> Retrieved {formatFetchedAt(snapshot.fetchedAt)}</div>
          </div>

          <div className="snapshot-grid">
            <article className="stat-card primary-stat">
              <span className="stat-icon"><BarChart3 size={18} /></span>
              <p>Eligible securities</p>
              <strong>{numberFormatter.format(snapshot.eligibleCount)}</strong>
              <small>of {numberFormatter.format(snapshot.universeCount)} names returned</small>
            </article>
            <article className="stat-card breadth-stat">
              <span className="stat-icon"><Activity size={18} /></span>
              <p>Screen breadth</p>
              <strong>{snapshot.advancers}<small> up</small> / {snapshot.decliners}<small> down</small></strong>
              <div className="breadth-track" aria-label={`${advanceShare.toFixed(0)} percent advancers`}>
                <span style={{ width: `${advanceShare}%` }} />
              </div>
            </article>
            <article className="stat-card">
              <span className="stat-icon"><ArrowUpRight size={18} /></span>
              <p>Median absolute move</p>
              <strong>{snapshot.medianMove.toFixed(1)}%</strong>
              <small>among eligible names in this feed</small>
            </article>
            <article className="stat-card">
              <span className="stat-icon"><ShieldAlert size={18} /></span>
              <p>Liquidity guardrail</p>
              <strong>$1M+</strong>
              <small>latest price × latest volume</small>
            </article>
          </div>
        </section>

        <section id="movers" className="movers-section" aria-labelledby="movers-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">{snapshot.period} leaderboard</p>
              <h2 id="movers-title">Biggest market moves</h2>
              <p>Filtered to $2+ securities with at least 100K shares and $1M in latest-session turnover.</p>
            </div>
            <div className="mover-tools">
              <label className="search-field">
                <Search size={16} />
                <span className="sr-only">Search movers</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticker" />
                {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
              </label>
              <button
                className="refresh-button"
                type="button"
                onClick={() => void loadPeriod(snapshot.period)}
                disabled={isRefreshing}
              >
                <RefreshCw size={15} className={isRefreshing ? "spinning" : ""} />
                <span>{isRefreshing ? "Refreshing" : "Refresh"}</span>
              </button>
            </div>
          </div>

          <div className="mover-grid">
            <MoverPanel
              title="Biggest winners"
              kicker="Leaders"
              tone="positive"
              stocks={visibleWinners}
              query={query}
              onSelect={setSelectedStock}
            />
            <MoverPanel
              title="Biggest losers"
              kicker="Laggards"
              tone="negative"
              stocks={visibleLosers}
              query={query}
              onSelect={setSelectedStock}
            />
          </div>
        </section>

        {saveNotice && <div className="notebook-saved" role="status">{saveNotice}<button type="button" onClick={() => setSaveNotice("")} aria-label="Dismiss saved message"><X size={16} /></button></div>}
        <ResearchNotebook cases={cases} onOpen={setActiveCase} error={notebookError} onTrySample={trySampleCase} />

        <section id="signals" className="signals-section" aria-labelledby="signals-title">
          <div className="section-heading signals-heading">
            <div>
              <p className="section-kicker">Transparent signal desk</p>
              <h2 id="signals-title">Ideas worth researching</h2>
              <p>These candidates rank measurable momentum and liquidity. They do not predict future returns.</p>
            </div>
            <div className="ideas-not-advice"><Info size={15} /><span>Ideas, not instructions</span></div>
          </div>

          {snapshot.ideas.length > 0 ? (
            <div className="idea-grid">
              {snapshot.ideas.map((idea) => (
                <IdeaCard
                  key={idea.stock.symbol}
                  idea={idea}
                  saved={savedSymbols.has(idea.stock.symbol)}
                  onToggleSaved={toggleSaved}
                  onSelect={setSelectedStock}
                />
              ))}
            </div>
          ) : (
            <div className="signals-empty">
              <ShieldAlert size={22} />
              <div><strong>No research signals are available from sample data.</strong><span>Bullproof never invents a signal when the underlying feed is unavailable.</span></div>
            </div>
          )}
        </section>

        <details id="methodology" className="methodology-section" aria-labelledby="methodology-title"><summary>Methodology</summary>
          <div className="methodology-intro">
            <p className="section-kicker light">Methodology</p>
            <h2 id="methodology-title">No black box.<br />Just a clear screen.</h2>
            <p>Every idea can be traced to observable price and volume inputs. Fundamental research still belongs in your process.</p>
            <a href={snapshot.sourceUrl} target={snapshot.sourceUrl.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
              View data-source documentation <ExternalLink size={14} />
            </a>
          </div>
          <div className="method-steps">
            <article><span>01</span><div><h3>Screen</h3><p>Remove sub-$2 and thinly traded names using share-volume and dollar-turnover floors.</p></div></article>
            <article><span>02</span><div><h3>Rank</h3><p>Sort eligible stocks by adjusted price return for the selected completed-session window.</p></div></article>
            <article><span>03</span><div><h3>Explain</h3><p>Blend momentum, turnover, and liquidity into a transparent 0–100 research score.</p></div></article>
          </div>
          <div className="score-formula">
            <span>Research score</span>
            <div><strong>50%</strong> momentum <i>+</i> <strong>30%</strong> turnover <i>+</i> <strong>20%</strong> liquidity</div>
            <small>Ranking heuristic, not a forecast or valuation model.</small>
          </div>
        </details>

        <section className="disclosure-section" aria-labelledby="disclosure-title">
          <div className="disclosure-icon"><ShieldAlert size={24} /></div>
          <div>
            <p className="section-kicker">Before you use a signal</p>
            <h2 id="disclosure-title">Research is not a recommendation.</h2>
            <p>
              Bullproof is for informational and educational use only. It does not provide personalized investment advice. Market data may be delayed or incomplete, model scores can be wrong, and investing involves risk—including loss of principal. Verify any catalyst, fundamentals, liquidity, and fit for your own circumstances with qualified professionals.
            </p>
          </div>
          <div className="source-stamp">
            <Database size={16} />
            <span>Current source</span>
            <strong>{snapshot.sourceName}</strong>
            <small>Retrieved {formatFetchedAt(snapshot.fetchedAt)}</small>
          </div>
        </section>
      </main>

      <footer>
        <a className="brand footer-brand" href="#top"><Image src="/brand/bullproof.svg?v=20261029-bull" width={36} height={36} alt="" style={{borderRadius:8}}/><span>bullproof</span><small>markets</small></a>
        <p>Market moves, explained. © {new Date().getUTCFullYear()}</p>
        <div><a href="#methodology">Methodology</a><a href="#disclosure-title">Disclosures</a></div>
      </footer>

      <div className="sr-only" aria-live="polite">
        {isRefreshing ? "Refreshing market data" : refreshError || `Showing ${snapshot.period} market data`}
      </div>

      {activeCase && <ResearchEditor key={activeCase.id} initialCase={activeCase} onSave={saveCase} onClose={() => setActiveCase(null)} />}

      {selectedStock && (
        <DetailDrawer
          stock={selectedStock}
          idea={selectedIdea}
          period={snapshot.period}
          saved={savedSymbols.has(selectedStock.symbol)}
          onToggleSaved={toggleSaved}
          onClose={() => setSelectedStock(null)}
          onStartCase={() => startCase(selectedStock)}
        />
      )}
    </div>
  );
}
