"use client";
import {useCatalysts,CatalystPanel,CatalystRadar,earningsLabel} from "./catalyst-panel";
import {useResearchInterests} from "./use-research-interests";
import {rankForYou,researchCase} from "@/lib/research-interests";
import {discoverySignal,researchDay} from "@/lib/discovery-signals";
import {priorityNews} from "@/lib/catalysts";
import {CompanyDepth,ValuationStrip,ValuationMap} from "./company-depth";
import {DiscoveryCompanies,CompanyPurchases,useDiscoveryLedger} from "./discovery-signals";
import {AppHeader} from "./app-header";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  Download,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type {
  CompanyResearchLive,
  DiscoveryResponse,
  ListedCompany,
  SearchResponse,
} from "@/lib/live-research-types";
import {
  parseTerminal,
  TERMINAL_KEY,
  type TerminalShelf,
} from "@/lib/terminal-shelf";
import {
  amount,
  checkedAt,
  displayName,
  fullDate,
  isNumber,
  matches,
  metricLabels,
  money,
  percent,
  researchCsv,
  symbol,
  tone,
  type Lens,
  type FinancialMetric,
} from "@/lib/research-view";
import {
  AtlasMap,
  GrowthRanking,
  MarginComparison,
  QuarterHistory,
} from "./atlas-charts";
import { CompanyProfile, PriceChart, MarketTape } from "./market-widgets";
import "./research-app.css";
import "./terminal-workspace.css";
import "./terminal-refinement.css";
const lenses: [Lens, string][] = [
  ["all", "All signals"],
  ["growth", "Sales growth"],
  ["margin", "Margins"],
  ["pressure", "Pressure"],
  ["unseen", "New to you"],
];
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("bullproof-terminal", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("bullproof-terminal", cb);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(TERMINAL_KEY);
  } catch {
    return null;
  }
}
const serverSnapshot = () => null;
async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "The research source is unavailable. Try again shortly.",
    );
  return data as T;
}
function Identity({ company }: { company: ListedCompany }) {
  return (
    <div className="r-identity">
      <span className="r-monogram" aria-hidden="true">
        {company.ticker}
      </span>
      <div>
        <h2>{displayName(company)}</h2>
        <span>
          {company.exchange ? `${company.exchange} · ` : ""}
          {company.ticker}
        </span>
      </div>
    </div>
  );
}
function Save({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button
      className={`r-save ${saved ? "is-saved" : ""}`}
      onClick={onClick}
      aria-pressed={saved}
      title={saved ? "On your watchlist" : "Add to watchlist"}
    >
      {saved ? <Check size={16} /> : <Bookmark size={16} />}{" "}
      <span>{saved ? "On your watchlist" : "Add to watchlist"}</span>
    </button>
  );
}
function ResearchNotes({
  company,
  value,
  draft,
  onDraft,
  onSave,
}: {
  company: ListedCompany;
  value: string;
  draft: string;
  onDraft: (s: string) => void;
  onSave: (s: string) => void;
}) {
  return (
    <section className="r-note-editor">
      <h2>Your {company.ticker} research</h2>
      
      <label htmlFor="research-note">
        Questions, evidence, and valuation thresholds
      </label>
      <textarea
        id="research-note"
        value={draft}
        maxLength={5000}
        rows={10}
        onChange={(e) => onDraft(e.target.value)}
      />
      <div className="r-note-actions">
        <button className="r-primary" onClick={() => onSave(draft)}>
          <Check size={16} /> Save notes
        </button>
        <span>
          {draft === value ? "Saved in this browser" : "Unsaved changes"} ·{" "}
          {draft.length}/5,000
        </span>
      </div>
    </section>
  );
}
export function ResearchApp({ initialTicker, initialWatchlist=false }: { initialTicker?: string; initialWatchlist?: boolean }) {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot),
    shelf = useMemo(() => parseTerminal(raw), [raw]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!Object.entries(noteDrafts).some(([ticker, draft]) => draft !== (shelf.notes[ticker] ?? ""))) return;
    const handle = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handle);
    return () => window.removeEventListener("beforeunload", handle);
  }, [noteDrafts, shelf.notes]);
  const [feed, setFeed] = useState<DiscoveryResponse | null>(null),
    [feedBusy, setFeedBusy] = useState(true),
    [moreBusy, setMoreBusy] = useState(false),
    [feedError, setFeedError] = useState("");
  const [selected, setSelected] = useState<CompanyResearchLive | null>(null),
    [requested, setRequested] = useState<ListedCompany | null>(null),
    [companyBusy, setCompanyBusy] = useState(false),
    [companyError, setCompanyError] = useState("");
  const [view, setView] = useState<"atlas" | "brief">(
      initialTicker ? "brief" : "atlas",
    ),
    [savedOnly, setSavedOnly] = useState(initialWatchlist),
    [lens, setLens] = useState<Lens>("all"),
    [sort, setSort] = useState("personal"),
    [chart, setChart] = useState<"price" | "map" | "rank" | "value">("price"),
    [compressed, setCompressed] = useState(false);
  const [tab, setTab] = useState<
      "research" | "price" | "business" | "sources" | "notes"
    >("research"),
    [quarter, setQuarter] = useState<string | undefined>(),
    [series, setSeries] = useState<FinancialMetric>("revenue");
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<ListedCompany[]>([]),
    [searchBusy, setSearchBusy] = useState(false),
    [searchError, setSearchError] = useState(""),
    [status, setStatus] = useState("");
  const feedAbort = useRef<AbortController | null>(null),
    companyAbort = useRef<AbortController | null>(null),
    currentTicker = useRef(initialTicker ?? ""),
    searchInput = useRef<HTMLInputElement>(null),
    inspector = useRef<HTMLElement>(null),
    mainHeading = useRef<HTMLHeadingElement>(null);
  const catalystKey=[...new Set([...(feed?.companies.map(c=>c.ticker)??[]),...(selected?[selected.ticker]:[])])].sort().join(',');
  const catalysts=useCatalysts(catalystKey,selected?.ticker??'');
  const portfolio=useDiscoveryLedger();
  const interests=useResearchInterests(shelf.watchlist);
  const writeShelf = useCallback(
    (change: (s: TerminalShelf) => TerminalShelf, message?: string) => {
      try {
        localStorage.setItem(
          TERMINAL_KEY,
          JSON.stringify(change(parseTerminal(snapshot()))),
        );
        window.dispatchEvent(new Event("bullproof-terminal"));
        if (message) setStatus(message);
      } catch {
        setStatus(
          "This browser could not save your research. Copy your note before leaving.",
        );
      }
    },
    [],
  );
  const loadFeed = useCallback(async (cursor?: string) => {
    feedAbort.current?.abort();
    const controller = new AbortController();
    feedAbort.current = controller;
    setFeedError("");
    setFeedBusy(!cursor);
    setMoreBusy(!!cursor);
    try {
      const next = await read<DiscoveryResponse>(
        `/api/discover${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setFeed((old) =>
        cursor && old
          ? {
              ...next,
              stale: old.stale || next.stale,
              warnings: [...new Set([...old.warnings, ...next.warnings])],
              companies: [
                ...old.companies,
                ...next.companies.filter(
                  (c) => !old.companies.some((p) => p.cik === c.cik),
                ),
              ],
            }
          : next,
      );
      if (!currentTicker.current && next.companies[0]) {
        currentTicker.current = next.companies[0].ticker;
        setSelected(next.companies[0]);
        setRequested(next.companies[0]);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setFeedError(
          e instanceof Error
            ? e.message
            : "The research source could not connect.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setFeedBusy(false);
        setMoreBusy(false);
      }
    }
  }, []);
  const refreshCompany = useCallback(async (ticker: string) => {
    companyAbort.current?.abort();
    const controller = new AbortController();
    companyAbort.current = controller;
    setCompanyBusy(true);
    setCompanyError("");
    try {
      const c = await read<CompanyResearchLive>(
        `/api/company/${encodeURIComponent(ticker)}`,
        controller.signal,
      );
      if (!controller.signal.aborted && currentTicker.current === ticker) {
        setSelected(c);
        setRequested(c);
      }
    } catch (e) {
      if (!controller.signal.aborted && currentTicker.current === ticker) {
        const message =
          e instanceof Error
            ? e.message
            : "Could not retrieve financial research.";
        setCompanyError(message);
        setSelected((old) =>
          old?.ticker === ticker
            ? {
                ...old,
                stale: true,
                warnings: [
                  ...new Set([
                    ...old.warnings,
                    "Refresh failed; showing previously retrieved research.",
                  ]),
                ],
              }
            : old,
        );
      }
    } finally {
      if (!controller.signal.aborted) setCompanyBusy(false);
    }
  }, []);
  const choose = useCallback(
    (
      c: ListedCompany | CompanyResearchLive,
      openBrief = false,
      push = true,
    ) => {
      currentTicker.current = c.ticker;
      setRequested(c);
      setSelected("quarters" in c ? c : null);
      setCompanyError("");
      setQuarter(undefined);
      setQuery("");
      setResults([]);
      setTab("research");
      writeShelf((s) => ({
        ...s,
        seen: [c.ticker, ...s.seen.filter((t) => t !== c.ticker)].slice(0, 100),
      }));
      if (openBrief) {
        setView("brief");
        if (push)
          window.history.pushState(
            null,
            "",
            `/research?ticker=${encodeURIComponent(c.ticker)}`,
          );
        window.scrollTo({ top: 0, behavior: "instant" });
        requestAnimationFrame(() =>
          mainHeading.current?.focus({ preventScroll: true }),
        );
      } else if (window.matchMedia("(max-width:800px)").matches) {
        requestAnimationFrame(() => {
          document.getElementById("terminal-chart")?.scrollIntoView({
            block: "start",
            behavior: "instant",
          });
          document.getElementById("terminal-chart")?.focus({ preventScroll: true });
        });
      }
      void refreshCompany(c.ticker);
    },
    [refreshCompany, writeShelf],
  );
  const goAtlas = useCallback((saved = false, push = true) => {
    setView("atlas");
    setSavedOnly(saved);
    setQuery("");
    if (push) window.history.pushState(null, "", saved ? "/research?view=watchlist" : "/research");
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() =>
      mainHeading.current?.focus({ preventScroll: true }),
    );
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadFeed();
      if (initialTicker)
        choose(
          { ticker: initialTicker, name: initialTicker, cik: "", exchange: "" },
          true,
          false,
        );
    }, 0);
    const interval = setInterval(
      () => {
        if (document.visibilityState === "visible") {
          void loadFeed();
          if (currentTicker.current) void refreshCompany(currentTicker.current);
        }
      },
      15 * 60 * 1000,
    );
    const pop = () => {
      const t = new URLSearchParams(window.location.search).get("ticker");
      if (t && /^[A-Z][A-Z0-9.\-]{0,11}$/i.test(t))
        choose(
          {
            ticker: t.toUpperCase(),
            name: t.toUpperCase(),
            cik: "",
            exchange: "",
          },
          true,
          false,
        );
      else goAtlas(new URLSearchParams(window.location.search).get("view")==="watchlist", false);
    };
    const resume=()=>{if(document.visibilityState==='visible'){void loadFeed();if(currentTicker.current)void refreshCompany(currentTicker.current);}};
    document.addEventListener('visibilitychange',resume);
    window.addEventListener("popstate", pop);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      feedAbort.current?.abort();
      companyAbort.current?.abort();
      document.removeEventListener("visibilitychange",resume);
      window.removeEventListener("popstate", pop);
    };
  }, [initialTicker, choose, goAtlas, loadFeed, refreshCompany]);
  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchBusy(true);
      setSearchError("");
      void read<SearchResponse>(
        `/api/search?q=${encodeURIComponent(query.trim())}`,
        controller.signal,
      )
        .then((v) => {
          if (!controller.signal.aborted) setResults(v.results);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setSearchError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchBusy(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInput.current?.focus();
      }
      if (e.key === "Escape") {
        setQuery("");
        setResults([]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const toggleSave = (c: ListedCompany) => {
    const full=feed?.companies.find(x=>x.ticker===c.ticker)??(selected?.ticker===c.ticker?selected:null);
    if(shelf.watchlist.includes(c.ticker))interests.restore(c.ticker);
    else if(full)interests.feedback(full,'save');
    writeShelf(
      (s) => ({
        ...s,
        watchlist: s.watchlist.includes(c.ticker)
          ? s.watchlist.filter((t) => t !== c.ticker)
          : [c.ticker, ...s.watchlist].slice(0, 100),
      }),
      shelf.watchlist.includes(c.ticker)
        ? `${c.ticker} removed from saved research.`
        : `${c.ticker} saved for research.`,
    );
  };
  const companies = useMemo(
    () => {const filtered=
      [...(feed?.companies ?? [])]
        .filter(
          (c) =>
            matches(c, lens, shelf.seen) &&
            (!savedOnly || shelf.watchlist.includes(c.ticker)) && (savedOnly || !["dismiss","known"].includes(interests.profile[c.ticker]?.action)),
        )
        .sort((a, b) =>
          sort === "daily" ? (()=>{const x=discoverySignal(a,catalysts.values[a.ticker]),y=discoverySignal(b,catalysts.values[b.ticker]);return Number(y.recent)-Number(x.recent)||y.date.localeCompare(x.date);})() : sort === "catalyst" ? (() => { const an = priorityNews(catalysts.values[a.ticker]?.news ?? [])[0]; const bn = priorityNews(catalysts.values[b.ticker]?.news ?? [])[0]; return (an?.priority ?? 99) - (bn?.priority ?? 99) || (bn?.publishedAt ?? "").localeCompare(an?.publishedAt ?? ""); })() : sort === "smaller" ? (a.valuation?.marketCap ?? Infinity) - (b.valuation?.marketCap ?? Infinity) : sort === "value" ? (a.valuation?.pe ?? Infinity) - (b.valuation?.pe ?? Infinity) : sort === "growth"
            ? (b.signals[0]?.revenueGrowth ?? -Infinity) -
              (a.signals[0]?.revenueGrowth ?? -Infinity)
            : sort === "margin"
              ? (b.signals[0]?.marginChangePp ?? -Infinity) -
                (a.signals[0]?.marginChangePp ?? -Infinity)
              : b.latestFilingDate.localeCompare(a.latestFilingDate),
        );
    return sort==="personal"&&!savedOnly?rankForYou(filtered,interests.profile,shelf.watchlist,shelf.seen):filtered;},
    [feed, lens, savedOnly, shelf, sort, catalysts.values,interests.profile],
  );
  useEffect(()=>{
    if(savedOnly||sort!=="personal"||!feed?.nextCursor||feedBusy||moreBusy||feedError||feed.companies.length>=24||(!shelf.watchlist.length&&!Object.keys(interests.profile).length))return;
    const timer=setTimeout(()=>void loadFeed(feed.nextCursor!),250);
    return()=>clearTimeout(timer);
  },[feed,savedOnly,sort,feedBusy,moreBusy,feedError,shelf.watchlist.length,interests.profile,loadFeed]);
  const current = selected ?? requested,
    latest = selected?.quarters.at(-1),
    signal = selected?.signals[0];
  function download() {
    const blob = new Blob([researchCsv(companies)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `bullproof-research-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function refresh() {
    catalysts.refresh();
    void loadFeed();
    if (currentTicker.current) void refreshCompany(currentTicker.current);
  }
  const searchView = (
    <div className="r-search-wrap">
      <label className="r-search">
        <Search size={17} />
        <input
          ref={searchInput}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setResults([]);
            setSearchError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) choose(results[0], true);
          }}
          placeholder="Search any company or ticker"
          aria-label="Search all listed companies"
          maxLength={80}
          autoComplete="off"
        />
        {query ? (
          <button
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
          >
            <X size={15} />
          </button>
        ) : (
          <kbd>⌘ K</kbd>
        )}
      </label>
      {query.trim() ? (
        <div className="r-search-results">
          <div className="r-search-context">SEC-listed company directory</div>
          {searchBusy ? (
            <p>Searching…</p>
          ) : searchError ? (
            <p role="alert">{searchError}</p>
          ) : results.length ? (
            results.slice(0, 12).map((c) => (
              <button
                key={`${c.cik}-${c.ticker}`}
                onClick={() => choose(c, true)}
              >
                <strong>{c.ticker}</strong>
                <span>{displayName(c)}</span>
                <small>{c.exchange}</small>
              </button>
            ))
          ) : (
            <p>No results yet. Try a ticker or company name.</p>
          )}
        </div>
      ) : null}
    </div>
  );
  const filters = (
    <div className="r-filters" role="group" aria-label="Discovery signals">
      {lenses.map(([key, label]) => (
        <button
          key={key}
          aria-pressed={lens === key}
          onClick={() => setLens(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
  const errors = (
    <>
      {companyError ? (
        <div className="r-notice" role="alert">
          <p>{companyError}</p>
          <button
            onClick={() => current && void refreshCompany(current.ticker)}
          >
            Retry financials
          </button>
          {current ? (
            <button
              onClick={() => {
                setView("brief");
                setTab("price");
                window.history.pushState(
                  null,
                  "",
                  `/research?ticker=${encodeURIComponent(current.ticker)}`,
                );
              }}
            >
              Open price chart
            </button>
          ) : null}
        </div>
      ) : null}
      {selected?.stale ? (
        <div className="r-notice">
          Cached company research · originally checked{" "}
          {checkedAt(selected.fetchedAt)}. {selected.warnings.join(" ")}
        </div>
      ) : null}
    </>
  );
  const tabs = (
    <nav className="r-brief-tabs" aria-label="Company research sections">
      {(
        [
          ["research", "News & financials"],
          ["price", "Price & volume"],
          ["business", "What it does"],
          ["sources", "Original filings"],
          ["notes", "My research notes"],
        ] as const
      ).map(([id, label]) => (
        <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
          {label}
        </button>
      ))}
    </nav>
  );
  return (
    <div
      className={`research-app terminal-workspace ${view === "atlas" ? "r-atlas" : "r-journal"}`}
    >
      <AppHeader active={savedOnly?'watchlist':'discover'} onDiscover={()=>goAtlas()}>
        {searchView}
        <button
          className="r-refresh"
          disabled={feedBusy || moreBusy || companyBusy}
          onClick={refresh}
          aria-label="Refresh research"
        >
          {feedBusy || companyBusy ? (
            <LoaderCircle className="r-spin" size={16} />
          ) : (
            <RefreshCw size={16} />
          )}
          <span>Refresh</span>
        </button>
      </AppHeader>
      <MarketTape symbols={["AMEX:SPY", "NASDAQ:QQQ", "AMEX:IWM", "NASDAQ:AAPL", "NASDAQ:NVDA", "NASDAQ:MSFT"]} />
      <div className="r-status" role="status">
        {status ? (
          <>
            <Check size={14} />
            {status}
            <button
              aria-label="Dismiss notification"
              onClick={() => setStatus("")}
            >
              <X size={14} />
            </button>
          </>
        ) : null}
      </div>
      {view === "atlas" ? (
        <main className="r-main">
          <div className="r-page-heading">
            <div>
              <h1 ref={mainHeading} tabIndex={-1}>
                {savedOnly ? "Watchlist" : "Discover"}
              </h1>

            </div>
            <div className="r-source-status">
              <strong>
                {feed
                  ? `${researchDay(Date.parse(feed.coverage.asOf))} · ${feed.companies.length} companies`
                  : "Scanning recent filings"}
              </strong>
              <span>
                {feed
                  ? `Checked ${checkedAt(feed.fetchedAt)}`
                  : "Connecting to SEC EDGAR…"}
              </span>
            </div>
          </div>
          {feedError ? (
            <div className="r-notice" role="alert">
              <strong>Source connection issue</strong>
              <p>
                {feedError}{" "}
                {feed ? "Your previous results remain available." : ""}
              </p>
              <button onClick={() => void loadFeed()}>Try again</button>
            </div>
          ) : null}
          {feed?.stale ? (
            <div className="r-notice">
              Cached discovery results · checked {checkedAt(feed.fetchedAt)}.
              The source could not supply a newer scan.
            </div>
          ) : null}
          {savedOnly ? (
            <section className="r-saved-list" aria-label="All saved companies">
              {shelf.watchlist.length ? (
                shelf.watchlist.map((t) => (
                  <button
                    key={t}
                    onClick={() =>
                      choose(
                        feed?.companies.find((c) => c.ticker === t) ?? {
                          ticker: t,
                          name: t,
                          cik: "",
                          exchange: "",
                        },
                        true,
                      )
                    }
                  >
                    <Bookmark size={13} />
                    {t}
                    <ArrowUpRight size={12} />
                  </button>
                ))
              ) : (
                <p>
                  Save a company from its inspector or brief to keep it here.
                </p>
              )}
              <small>
                Saved tickers open fresh research even if they are outside the
                current filing scan.
              </small>
            </section>
          ) : null}
          {savedOnly && !shelf.watchlist.length ? <div className="ah-empty"><h2>Your watchlist is empty</h2><button className="r-primary" onClick={()=>goAtlas()}>Discover companies <ArrowRight size={16}/></button><Link href="/saved">Earlier saved research</Link></div> : <>
          <div className="r-discovery-grid">
            <aside className="tw-universe" aria-label="Research universe">
              <div className="tw-panel-title"><h2>{savedOnly ? "Saved / current scan" : "Filing radar"}</h2><span>{companies.length}</span></div>
              <DiscoveryCompanies companies={companies} events={catalysts.values} portfolio={portfolio} selected={current?.ticker} onSelect={choose} busy={feedBusy} newsLoading={catalysts.loading} saved={savedOnly} interests={interests} watchlist={shelf.watchlist} seen={shelf.seen} onSave={toggleSave}/>
              {feed?.nextCursor ? <button className="r-text-button" disabled={moreBusy || feedBusy} onClick={() => void loadFeed(feed.nextCursor!)}>{moreBusy ? "Scanning…" : "Find more companies"}<ArrowRight size={13}/></button> : null}
            </aside>
            <section className="r-map-panel" id="terminal-chart" tabIndex={-1}>
              <div className="r-map-heading">
                <div>
                  <h2>{chart === "price" ? (current?.ticker ?? "SPY") : chart === "map" ? "Growth × profitability" : chart === "value" ? "Valuation × growth" : "Growth ranking"}<span className="tw-instrument">{chart === "price" ? (current ? displayName(current) : "S&P 500 ETF · market overview") : "SEC comparisons"}</span></h2>
                  <p>{chart === "price" ? "Candles / volume · exchange delays apply" : chart === "value" ? "Indicative trailing P/E vs. reported sales growth" : "Sales growth vs. operating margin change"}</p>
                </div>
                {current&&<div className="ah-chart-actions"><Save saved={shelf.watchlist.includes(current.ticker)} onClick={()=>toggleSave(current)}/><button className="r-primary" onClick={()=>choose(current,true)}>Open research <ArrowUpRight size={15}/></button></div>}
                <div className="r-switch" aria-label="Chart view">
                  <button aria-pressed={chart === "price"} onClick={() => setChart("price")}>Price chart</button>
                  <button aria-pressed={chart === "value"} onClick={() => setChart("value")} title="Compare trailing price-to-earnings multiples with sales growth">Valuation</button>
                  <button
                    aria-pressed={chart === "map"}
                    onClick={() => setChart("map")}
                  >
                    Growth map
                  </button>
                  <button
                    aria-pressed={chart === "rank"}
                    onClick={() => setChart("rank")}
                  >
                    Growth ranking
                  </button>
                </div>
              </div>
              {chart !== "price" ? filters : null}
              {chart === "price" ? <PriceChart symbol={current ? symbol(current) : "AMEX:SPY"} name={current ? displayName(current) : "S&P 500 ETF"}/> : feedBusy && !feed ? (
                <div className="r-loading">
                  <LoaderCircle size={24} className="r-spin" />
                  <h3>Reading the latest filings</h3>
                  <p>
                    Checking reported quarters and comparable periods. This can
                    take up to a minute.
                  </p>
                </div>
              ) : chart === "value" ? <ValuationMap companies={companies} selected={selected?.ticker} onSelect={c=>choose(c)}/> : chart === "map" ? (
                <>
                  <AtlasMap
                    companies={companies}
                    selected={selected?.ticker}
                    onSelect={(c) => choose(c)}
                    compressed={compressed}
                  />
                  <label className="r-scale-control">
                    <input
                      type="checkbox"
                      checked={compressed}
                      onChange={(e) => setCompressed(e.target.checked)}
                    />{" "}
                    Spread out extreme values <span>Symmetric log scale</span>
                  </label>
                </>
              ) : (
                <GrowthRanking
                  companies={companies}
                  selected={selected?.ticker}
                  onSelect={(c) => choose(c)}
                />
              )}
            </section>
            <aside
              className="r-inspector"
              ref={inspector}
              tabIndex={-1}
              aria-label="Selected company evidence"
            >
              <div className="tw-panel-title"><h2>Selected company</h2><span>SEC / GAAP</span></div>
              {errors}
              {selected && latest ? (
                <>
                  <Identity company={selected} /><p className="terminal-selected-signal">{researchCase(selected).case}</p>
                  <div className="tw-inspector-actions">
                  <button
                    className="r-primary r-full"
                    onClick={() => choose(selected, true)}
                  >
                    Read company brief <ArrowRight size={16} />
                  </button>
                  <Save
                    saved={shelf.watchlist.includes(selected.ticker)}
                    onClick={() => toggleSave(selected)}
                  />
                  </div>
                  <div className="r-metrics">
                    <div>
                      <span>Sales growth · YoY</span>
                      <strong className={tone(signal?.revenueGrowth)}>
                        {percent(signal?.revenueGrowth)}
                      </strong>
                    </div>
                    <div>
                      <span>Margin change · YoY</span>
                      <strong className={tone(signal?.marginChangePp)}>
                        {percent(signal?.marginChangePp, " pp")}
                      </strong>
                    </div>
                    <div>
                      <span>Quarterly sales</span>
                      <strong>{money(latest.revenue)}</strong>
                    </div>
                    <div>
                      <span>Operating margin</span>
                      <strong>
                        {amount(latest.operatingMargin, "operatingMargin")}
                      </strong>
                    </div>
                  </div>
                  <ValuationStrip company={selected}/>
                  <CompanyPurchases ticker={selected.ticker} portfolio={portfolio}/>
                  <CatalystPanel data={catalysts.values[selected.ticker]} compact error={catalysts.error} loading={catalysts.loading} onRetry={catalysts.refresh}/>
                  <details className="tw-history"><summary>Quarterly financials</summary>
                  <div className="r-mini-chart">
                    <div className="r-switch">
                      <button
                        aria-pressed={series === "revenue"}
                        onClick={() => setSeries("revenue")}
                      >
                        Revenue
                      </button>
                      <button
                        aria-pressed={series === "operatingIncome"}
                        onClick={() => setSeries("operatingIncome")}
                      >
                        Operating profit
                      </button>
                    </div>
                    <QuarterHistory
                      key={`${selected.ticker}-${series}`}
                      quarters={selected.quarters}
                      field={series}
                      small
                    />
                  </div>
                  </details>
                  <p className="r-meta">
                    Quarter ended {fullDate(latest.end)} ·{" "}
                    {companyBusy
                      ? "Checking source…"
                      : `Checked ${checkedAt(selected.fetchedAt)}`}
                  </p>
                </>
              ) : companyBusy ? (
                <div className="r-loading">
                  <LoaderCircle size={22} className="r-spin" />
                  <p>Reading {current?.ticker}…</p>
                </div>
              ) : (
                <div className="r-empty-inspector">
                  <h2>No company selected</h2>
                  
                </div>
              )}
            </aside>
          </div>

          {!savedOnly && (
          <details className="terminal-catalysts"><summary>News & earnings catalysts</summary><CatalystRadar companies={companies} values={catalysts.values} onSelect={c=>choose(c,true)} loading={catalysts.loading} error={catalysts.error} onRetry={catalysts.refresh}/></details>
          )}
          <section className="r-company-table">
            <div className="r-section-heading">
              <h2>Screener</h2>
              <div>
                <label>
                  Sort{" "}
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="personal">For you · unfamiliar first</option>
                    <option value="daily">Daily evidence</option>
                    <option value="catalyst">Recent catalysts</option>
                    <option value="smaller">Smaller companies</option>
                    <option value="value">Lower positive P/E</option>
                    <option value="recent">Newest filing</option>
                    <option value="growth">Sales growth</option>
                    <option value="margin">Margin change</option>
                  </select>
                </label>
                <button
                  className="r-text-button"
                  onClick={download}
                  disabled={!companies.length}
                >
                  <Download size={14} /> CSV
                </button>
              </div>
            </div>
            {filters}
            <div className="r-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Company</th><th>Why now / earnings</th>
                    <th>Est. market cap</th><th>P/E · TTM</th><th>FCF yield</th><th>Quarterly sales</th>
                    <th>Sales YoY</th>
                    <th>Op. margin</th>
                    <th>Margin change</th>
                    <th>Quarter ended</th>
                    <th>Research signal</th>
                    <th>
                      <span className="r-sr">Company brief</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => {
                    const q = c.quarters.at(-1),
                      s = c.signals[0];
                    return (
                      <tr
                        key={c.cik}
                        data-selected={selected?.ticker === c.ticker}
                      >
                        <td>
                          <button
                            className="r-company-select"
                            onClick={() => choose(c)}
                          >
                            <strong>{c.ticker}</strong>
                            <span>{displayName(c)}</span>
                          </button>
                        </td>
                        <td className="cat-table-event">{catalysts.values[c.ticker]?priorityNews(catalysts.values[c.ticker].news)[0]?.headline??(catalysts.values[c.ticker].newsStatus==='unavailable'?'News unavailable':'No recent headline found'):'Checking events…'}<small>{catalysts.values[c.ticker]?.earnings?earningsLabel(catalysts.values[c.ticker].earnings!):'Next earnings date not verified'}</small></td><td>{money(c.valuation?.marketCap)}</td><td>{c.valuation?.pe!=null?`${c.valuation.pe.toFixed(1)}×`:"—"}</td><td>{percent(c.valuation?.fcfYield)}</td><td>{money(q?.revenue)}</td>
                        <td className={tone(s?.revenueGrowth)}>
                          {percent(s?.revenueGrowth)}
                        </td>
                        <td>{amount(q?.operatingMargin, "operatingMargin")}</td>
                        <td className={tone(s?.marginChangePp)}>
                          {percent(s?.marginChangePp, " pp")}
                        </td>
                        <td>{q ? fullDate(q.end) : "—"}</td>
                        <td className="r-signal-text">
                          {s?.title ?? "Financial comparison"}
                        </td>
                        <td>
                          <button
                            className="r-row-brief"
                            aria-label={`Read ${c.ticker} brief`}
                            onClick={() => choose(c, true)}
                          >
                            <ArrowUpRight size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!companies.length && !feedBusy ? (
              <div className="r-empty">
                <p>
                  {savedOnly
                    ? "No saved companies in this scan. Open any saved ticker above for its research."
                    : "No companies match this signal in the loaded results."}
                </p>
                <button onClick={() => setLens("all")}>Show all signals</button>
              </div>
            ) : null}
            <div className="r-load-more">
              <span>
                {companies.length} shown / {feed?.companies.length ?? 0} loaded
                · matching fiscal quarters compared
              </span>
              {feed?.nextCursor ? (
                <button
                  className="r-primary"
                  onClick={() => void loadFeed(feed.nextCursor!)}
                  disabled={moreBusy || feedBusy}
                >
                  {moreBusy ? (
                    <LoaderCircle size={15} className="r-spin" />
                  ) : (
                    <Search size={15} />
                  )}{" "}
                  {moreBusy ? "Checking more filings…" : "Find more companies"}
                </button>
              ) : feed ? (
                <span>End of this scan. Refresh to check for new filings.</span>
              ) : null}
            </div>
          </section>
          </>}
          <details className="r-coverage">
            <summary>Coverage, sources & freshness</summary>
            <p>
              {feed?.coverage.description ??
                "Discovery scans recent SEC annual and quarterly filings."}
            </p>
            <p>
              Rechecks every 15 minutes while open and visible. Financial
              statements update when companies file; exchange prices are
              separate. Signals describe financial changes, not stock returns.
              Investment horizon is not inferred from a quarterly filing.
            </p>
            {feed?.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            <p>Saved research and notes are stored in this browser.</p>
            <a href="/saved">Earlier saved research</a>
          </details>
        </main>
      ) : (
        <main className="r-main r-brief">
          <div className="r-brief-back">
            <button onClick={() => goAtlas(savedOnly)}>
              <ArrowLeft size={15} /> Back to discovery
            </button>
            <span>
              {companyBusy
                ? "Checking latest financials…"
                : selected
                  ? `Checked ${checkedAt(selected.fetchedAt)}`
                  : "Company research"}
            </span>
          </div>
          <div className="r-brief-heading">
            <div>
              <h1 ref={mainHeading} tabIndex={-1}>
                {current ? displayName(current) : "Company research"}
              </h1>
              <p>
                {current?.exchange ? `${current.exchange} · ` : ""}
                {current?.ticker}{" "}
                {selected
                  ? `· ${selected.latestFilingForm} filed ${fullDate(selected.latestFilingDate)}`
                  : ""}
              </p>
            </div>
            {current ? (
              <Save
                saved={shelf.watchlist.includes(current.ticker)}
                onClick={() => toggleSave(current)}
              />
            ) : null}
          </div>
          <div className="tw-research-path"><button onClick={() => setTab("notes")}>Add note <ArrowRight size={14}/></button></div>
          {tabs}
          {errors}
          {companyBusy && !selected && tab !== "price" ? (
            <div className="r-loading">
              <LoaderCircle size={24} className="r-spin" />
              <h2>Reading {current?.ticker}’s financial history</h2>
              <p>Retrieving reported quarters and their original filings.</p>
            </div>
          ) : null}
          {tab === "price" && current ? (
            <section className="r-market">
              <h2>Price, volume & market context</h2>
              <p>
                Interactive market feed. Exchange delays vary; check the chart
                status.
              </p>
              <PriceChart
                symbol={symbol(current)}
                name={displayName(current)}
              />
            </section>
          ) : tab === "business" && current ? (
            <section className="r-market">
              <h2>What does {current.ticker} do?</h2>
              <p>Business description and industry context from TradingView.</p>
              <CompanyProfile symbol={symbol(current)} />
            </section>
          ) : tab === "notes" && current ? (
            <ResearchNotes
              key={current.ticker}
              company={current}
              value={shelf.notes[current.ticker] ?? ""}
              draft={noteDrafts[current.ticker] ?? shelf.notes[current.ticker] ?? ""}
              onDraft={(draft) => setNoteDrafts((previous) => ({ ...previous, [current.ticker]: draft }))}
              onSave={(note) =>
                writeShelf(
                  (s) => ({
                    ...s,
                    notes: { ...s.notes, [current.ticker]: note },
                    watchlist: [
                      current.ticker,
                      ...s.watchlist.filter((t) => t !== current.ticker),
                    ].slice(0, 100),
                  }),
                  `${current.ticker} notes saved.`,
                )
              }
            />
          ) : selected && latest && tab === "research" ? (
            <>
              <div className="terminal-brief-overview"><CompanyPurchases ticker={selected.ticker} portfolio={portfolio}/>
              <CompanyDepth company={selected}/>
              <CatalystPanel data={catalysts.values[selected.ticker]} error={catalysts.error} loading={catalysts.loading} onRetry={catalysts.refresh}/></div>
              <div className="r-story-head">
                <h2>Financial history</h2>
                <div>
                  <a
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Read the original filing <ArrowUpRight size={14} />
                  </a>
                </div>
              </div>
              <div className="r-period-controls">
                <span>
                  Latest quarter ended {fullDate(latest.end)} · year-over-year
                  signals
                </span>
                <label>
                  Inspect quarter{" "}
                  <select
                    value={quarter ?? latest.end}
                    onChange={(e) => setQuarter(e.target.value)}
                  >
                    {selected.quarters.map((q) => (
                      <option key={q.end} value={q.end}>
                        {fullDate(q.end)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="r-chart-pair">
                {(["revenue", "operatingIncome"] as FinancialMetric[]).map(
                  (field) => (
                    <section key={field}>
                      <div className="r-chart-heading">
                        <h3>{metricLabels[field]}</h3>
                        <span
                          className={tone(
                            field === "revenue"
                              ? signal?.revenueGrowth
                              : signal?.operatingIncomeGrowth,
                          )}
                        >
                          {percent(
                            field === "revenue"
                              ? signal?.revenueGrowth
                              : signal?.operatingIncomeGrowth,
                          )}{" "}
                          latest YoY
                        </span>
                      </div>
                      <QuarterHistory
                        key={`${selected.ticker}-${field}`}
                        quarters={selected.quarters}
                        field={field}
                        activeEnd={quarter}
                        onInspect={setQuarter}
                      />
                    </section>
                  ),
                )}
              </div>
              <MarginComparison quarters={selected.quarters} end={quarter} />
              <div className="r-chart-pair r-secondary-charts">
                {(["operatingMargin", "netIncome"] as FinancialMetric[]).map(
                  (field) => (
                    <section key={field}>
                      <div className="r-chart-heading">
                        <h3>{metricLabels[field]}</h3>
                        <span>Reported history</span>
                      </div>
                      <QuarterHistory
                        key={`${selected.ticker}-${field}`}
                        quarters={selected.quarters}
                        field={field}
                        activeEnd={quarter}
                        onInspect={setQuarter}
                      />
                    </section>
                  ),
                )}
              </div>
              <details className="r-coverage">
                <summary>Data notes</summary>
                {selected.caveats.map((c) => (
                  <p key={c}>{c}</p>
                ))}
                <p>
                  Missing quarters are left as gaps, not estimated. Headline
                  changes describe the latest quarter; selecting an older period
                  changes the chart readouts and margin comparison.
                </p>
                <button
                  className="r-text-button"
                  onClick={() => setTab("sources")}
                >
                  Inspect all periods & sources
                </button>
              </details>
            </>
          ) : selected && tab === "sources" ? (
            <SourceTable company={selected} />
          ) : null}
        </main>
      )}
      <footer className="r-footer">
        <span>Company evidence / SEC EDGAR</span>
        <span>Market charts / TradingView</span>
        <a href="/saved">Earlier saved notes</a>
      </footer>
    </div>
  );
}
function SourceTable({ company }: { company: CompanyResearchLive }) {
  return (
    <section className="r-sources">
      <h2>Every number has a source.</h2>
      <p>
        Reported standalone quarters, USD and US GAAP. Each metric links to the
        filing that supplied it; revisions may use different accessions.
      </p>
      <div className="r-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Revenue</th>
              <th>Operating profit</th>
              <th>Net income</th>
              <th>Operating margin</th>
            </tr>
          </thead>
          <tbody>
            {[...company.quarters].reverse().map((q) => (
              <tr key={q.end}>
                <td>
                  {fullDate(q.start)} – {fullDate(q.end)}
                </td>
                {(["revenue", "operatingIncome", "netIncome"] as const).map(
                  (m) => (
                    <td key={m}>
                      {isNumber(q[m]) ? (
                        <a
                          href={q.sources[m]?.sourceUrl ?? q.sourceUrl}
                          title={`${q.sources[m]?.tag ?? m}; filed ${q.sources[m]?.filed ?? q.filed}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {money(q[m])}
                          <ArrowUpRight size={12} />
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  ),
                )}
                <td>{amount(q.operatingMargin, "operatingMargin")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="r-source-notes">
        {company.caveats.map((c) => (
          <p key={c}>{c}</p>
        ))}
      </div>
    </section>
  );
}
