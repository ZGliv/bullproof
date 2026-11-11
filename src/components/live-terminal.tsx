"use client";
import Image from "next/image";
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
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  Command,
  ExternalLink,
  FileText,
  History,
  Layers3,
  LoaderCircle,
  Radio,
  RotateCw,
  Search,
  SlidersHorizontal,
  Sparkles,
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
  changeLabel,
  compactMoney,
  financialLabels,
  QuarterChart,
  RevenueSpark,
  shortDate,
  type FinancialKey,
} from "./terminal-charts";
import { CompanyProfile, MarketTape, PriceChart } from "./market-widgets";
import "./live-terminal.css";

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
function tvSymbol(c: ListedCompany) {
  const exchange = c.exchange.toUpperCase();
  return `${exchange === "NASDAQ" ? "NASDAQ" : exchange === "NYSE" ? "NYSE" : exchange === "NYSE AMERICAN" ? "AMEX" : exchange === "NYSE ARCA" ? "AMEX" : exchange}:${c.ticker.replace("-", ".")}`;
}
function signalSummary(company: CompanyResearchLive) {
  const signal = company.signals[0];
  const latest = company.quarters.at(-1);
  if (!signal || !latest)
    return "A new report adds evidence to this company’s financial history.";
  const movement = (label: string, value: number) =>
    Math.abs(value) < 0.05
      ? `${label} was essentially flat`
      : `${label} ${value > 0 ? "rose" : "fell"} ${Math.abs(value).toFixed(1)}%`;
  const parts: string[] = [];
  if (signal.revenueGrowth !== null)
    parts.push(movement("Revenue", signal.revenueGrowth) + " year over year.");
  if (signal.operatingIncomeGrowth !== null)
    parts.push(
      movement("Operating income", signal.operatingIncomeGrowth) + ".",
    );
  else if (latest.operatingIncome !== null && latest.operatingIncome < 0)
    parts.push(
      `The quarter recorded an operating loss of ${compactMoney(Math.abs(latest.operatingIncome))}.`,
    );
  if (signal.marginChangePp !== null)
    parts.push(
      Math.abs(signal.marginChangePp) < 0.05
        ? "Operating margin was essentially unchanged."
        : `Operating margin ${signal.marginChangePp > 0 ? "expanded" : "contracted"} ${Math.abs(signal.marginChangePp).toFixed(1)} percentage points.`,
    );
  return parts.join(" ") || signal.explanation;
}
function timeLabel(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.valueOf())
    ? "Not yet checked"
    : new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(d);
}
async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { cache: "no-store", signal });
  const value = await r.json();
  if (!r.ok)
    throw new Error(
      typeof value.error === "string"
        ? value.error
        : "The research source is unavailable. Try again shortly.",
    );
  return value as T;
}
const lenses = [
  {
    id: "all",
    label: "All signals",
    description: "Recent filings with comparable quarterly data",
  },
  {
    id: "growth",
    label: "Sales growth",
    description: "Latest quarterly revenue growth above 10% year over year",
  },
  {
    id: "margin",
    label: "Margin expansion",
    description:
      "Operating margin up more than 1 percentage point year over year",
  },
  {
    id: "pressure",
    label: "Under pressure",
    description: "Falling sales, operating profit, or operating margin",
  },
  {
    id: "unseen",
    label: "New to you",
    description: "Companies you have not opened in this browser",
  },
] as const;
type Lens = (typeof lenses)[number]["id"];
function matches(c: CompanyResearchLive, lens: Lens, seen: string[]) {
  return (
    lens === "all" ||
    (lens === "unseen" && !seen.includes(c.ticker)) ||
    (lens === "growth" &&
      c.signals.some((s) => (s.revenueGrowth ?? -Infinity) > 10)) ||
    (lens === "margin" &&
      c.signals.some((s) => (s.marginChangePp ?? -Infinity) > 1)) ||
    (lens === "pressure" &&
      c.signals.some(
        (s) =>
          (s.revenueGrowth ?? 0) < 0 ||
          (s.operatingIncomeGrowth ?? 0) < 0 ||
          (s.marginChangePp ?? 0) < 0,
      ))
  );
}
function NoteEditor({
  company,
  value,
  onSave,
}: {
  company: ListedCompany;
  value: string;
  onSave: (note: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <section className="t-notes">
      <span className="t-label">YOUR RESEARCH / {company.ticker}</span>
      <h2>What would make this worth owning?</h2>
      <p>Keep a question, a valuation threshold, or a reason to pass.</p>
      <label htmlFor="terminal-note">Research notes</label>
      <textarea
        id="terminal-note"
        value={draft}
        maxLength={5000}
        rows={9}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="What needs to be true? What would change my mind?"
      />
      <button className="t-action" onClick={() => onSave(draft)}>
        <Check size={15} /> Save note
      </button>
      <small>Saved in this browser. Cross-device sync is not connected.</small>
    </section>
  );
}
function WatchButton({
  saved,
  onClick,
  name,
}: {
  saved: boolean;
  onClick: () => void;
  name: string;
}) {
  return (
    <button
      className={`t-watch-button ${saved ? "t-is-saved" : ""}`}
      aria-label={`${saved ? "Unwatch" : "Watch"} ${name}`}
      aria-pressed={saved}
      onClick={onClick}
    >
      {saved ? <Check size={15} /> : <Bookmark size={15} />}
      <span>{saved ? "Watching" : "Watch"}</span>
    </button>
  );
}

export function LiveTerminal({ initialTicker }: { initialTicker?: string }) {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const shelf = useMemo(() => parseTerminal(raw), [raw]);
  const [feed, setFeed] = useState<DiscoveryResponse | null>(null);
  const [feedBusy, setFeedBusy] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [selected, setSelected] = useState<CompanyResearchLive | null>(null);
  const [requested, setRequested] = useState<ListedCompany | null>(null);
  const [companyBusy, setCompanyBusy] = useState(false);
  const [companyError, setCompanyError] = useState("");
  const [lens, setLens] = useState<Lens>("all");
  const [sort, setSort] = useState("recent");
  const [tab, setTab] = useState<
    "research" | "price" | "filings" | "notes" | "business"
  >("research");
  const [mobileView, setMobileView] = useState<"feed" | "company">("feed");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ListedCompany[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [status, setStatus] = useState("");
  const [showWatchlist, setShowWatchlist] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const companyAbort = useRef<AbortController | null>(null);
  const feedAbort = useRef<AbortController | null>(null);
  function writeShelf(
    change: (current: TerminalShelf) => TerminalShelf,
    message?: string,
  ) {
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
  }
  function toggleWatch(c: ListedCompany) {
    writeShelf(
      (s) => ({
        ...s,
        watchlist: s.watchlist.includes(c.ticker)
          ? s.watchlist.filter((t) => t !== c.ticker)
          : [c.ticker, ...s.watchlist].slice(0, 100),
      }),
      shelf.watchlist.includes(c.ticker)
        ? `${c.ticker} removed from watchlist.`
        : `${c.ticker} added to your watchlist.`,
    );
  }
  const loadFeed = useCallback(
    async (cursor?: string) => {
      if (!cursor) {
        feedAbort.current?.abort();
        feedAbort.current = new AbortController();
        setFeedBusy(true);
        setFeedError("");
      } else setMoreBusy(true);
      try {
        const next = await readJson<DiscoveryResponse>(
          `/api/discover${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
          feedAbort.current?.signal,
        );
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
        setSelected((old) =>
          old
            ? (next.companies.find((c) => c.ticker === old.ticker) ?? old)
            : initialTicker
              ? null
              : (next.companies[0] ?? null),
        );
      } catch (e) {
        if (e instanceof Error && e.name !== "AbortError")
          setFeedError(e.message);
      } finally {
        if (cursor) setMoreBusy(false);
        else setFeedBusy(false);
      }
    },
    [initialTicker],
  );
  const choose = useCallback(async (c: ListedCompany | CompanyResearchLive) => {
    companyAbort.current?.abort();
    const controller = new AbortController();
    companyAbort.current = controller;
    setRequested(c);
    setCompanyError("");
    setMobileView("company");
    setTab("research");
    setQuery("");
    setResults([]);
    setShowWatchlist(false);
    window.history.replaceState(
      null,
      "",
      `/?ticker=${encodeURIComponent(c.ticker)}`,
    );
    try {
      localStorage.setItem(
        TERMINAL_KEY,
        JSON.stringify(
          (() => {
            const s = parseTerminal(snapshot());
            return {
              ...s,
              seen: [c.ticker, ...s.seen.filter((t) => t !== c.ticker)].slice(
                0,
                100,
              ),
            };
          })(),
        ),
      );
      window.dispatchEvent(new Event("bullproof-terminal"));
    } catch {
      /* Reading a company remains available if browser storage is disabled. */
    }
    if ("quarters" in c) {
      setSelected(c);
      setCompanyBusy(false);
      return;
    }
    setSelected(null);
    setCompanyBusy(true);
    try {
      const value = await readJson<CompanyResearchLive>(
        `/api/company/${encodeURIComponent(c.ticker)}`,
        controller.signal,
      );
      if (!controller.signal.aborted) setSelected(value);
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError")
        setCompanyError(e.message);
    } finally {
      if (!controller.signal.aborted) setCompanyBusy(false);
    }
  }, []);
  const refreshSelected = useCallback(async (ticker: string) => {
    try {
      const value = await readJson<CompanyResearchLive>(
        `/api/company/${encodeURIComponent(ticker)}`,
        AbortSignal.timeout(35000),
      );
      setSelected((old) => (old?.ticker === ticker ? value : old));
    } catch {
      setSelected((old) =>
        old?.ticker === ticker
          ? {
              ...old,
              stale: true,
              warnings: [
                ...new Set([
                  ...old.warnings,
                  "Company refresh failed; showing the previously retrieved research.",
                ]),
              ],
            }
          : old,
      );
    }
  }, []);
  useEffect(() => {
    if (!selected?.ticker) return;
    const ticker = selected.ticker;
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible")
          void refreshSelected(ticker);
      },
      15 * 60 * 1000,
    );
    return () => clearInterval(timer);
  }, [selected?.ticker, refreshSelected]);
  useEffect(() => {
    const startup = setTimeout(() => void loadFeed(), 0);
    const interval = setInterval(
      () => {
        if (document.visibilityState === "visible") void loadFeed();
      },
      15 * 60 * 1000,
    );
    return () => {
      clearTimeout(startup);
      clearInterval(interval);
      feedAbort.current?.abort();
    };
  }, [loadFeed]);
  useEffect(() => {
    const startup = setTimeout(() => {
      if (initialTicker) {
        void choose({
          ticker: initialTicker,
          name: initialTicker,
          exchange: "",
          cik: "",
        });
      }
    }, 0);
    return () => {
      clearTimeout(startup);
      companyAbort.current?.abort();
    };
  }, [initialTicker, choose]);
  useEffect(() => {
    if (query.trim().length < 1) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchBusy(true);
      setSearchError("");
      void readJson<SearchResponse>(
        `/api/search?q=${encodeURIComponent(query.trim())}`,
        controller.signal,
      )
        .then((value) => {
          if (!controller.signal.aborted) setResults(value.results);
        })
        .catch((e) => {
          if (e instanceof Error && e.name !== "AbortError")
            setSearchError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchBusy(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  useEffect(() => {
    if (
      mobileView !== "company" ||
      !window.matchMedia("(max-width:760px)").matches
    )
      return;
    const frame = requestAnimationFrame(() =>
      document
        .querySelector(".t-research")
        ?.scrollIntoView({ block: "start", behavior: "instant" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [mobileView, selected?.ticker]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
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
  const companies = useMemo(
    () =>
      [...(feed?.companies ?? [])]
        .filter((c) => matches(c, lens, shelf.seen))
        .sort((a, b) =>
          sort === "growth"
            ? (b.signals[0]?.revenueGrowth ?? -Infinity) -
              (a.signals[0]?.revenueGrowth ?? -Infinity)
            : b.latestFilingDate.localeCompare(a.latestFilingDate),
        ),
    [feed, lens, shelf.seen, sort],
  );
  const current = selected ?? requested;
  const latest = selected?.quarters.at(-1);
  const mainSignal = selected?.signals[0];
  const tapeSymbols = useMemo(
    () =>
      feed?.companies.slice(0, 10).map(tvSymbol) ?? [
        "NASDAQ:MSFT",
        "NASDAQ:NVDA",
        "NYSE:V",
        "NYSE:CAT",
        "NASDAQ:AMZN",
      ],
    [feed],
  );
  return (
    <div className="terminal-app">
      <aside className="t-sidebar">
        <Link href="/" className="t-brand">
          <Image src="/brand/bullproof.svg?v=20261029-bull" width={33} height={33} alt="" />
          <span>
            bullproof<small>RESEARCH TERMINAL</small>
          </span>
        </Link>
        <div className="t-side-label">WORKSPACE</div>
        <button
          className={!showWatchlist ? "t-side-active" : ""}
          onClick={() => {
            setMobileView("feed");
            setShowWatchlist(false);
          }}
        >
          <Radio size={17} /> Discovery{" "}
          <span>{feed?.companies.length ?? "—"}</span>
        </button>
        <button
          className={showWatchlist ? "t-side-active" : ""}
          onClick={() => setShowWatchlist((v) => !v)}
        >
          <Bookmark size={17} /> Watchlist <span>{shelf.watchlist.length}</span>
        </button>
        <Link href="/desk">
          <Layers3 size={17} /> Market movers <ArrowUpRight size={12} />
        </Link>
        <div className="t-side-divider" />
        <div className="t-side-label">ON YOUR RADAR</div>
        <div className="t-side-watchlist">
          {shelf.watchlist.length ? (
            shelf.watchlist.slice(0, 12).map((ticker) => (
              <button
                key={ticker}
                onClick={() =>
                  void choose(
                    feed?.companies.find((c) => c.ticker === ticker) ?? {
                      ticker,
                      name: ticker,
                      cik: "",
                      exchange: "",
                    },
                  )
                }
              >
                <i />
                {ticker}
                <ArrowUpRight size={12} />
              </button>
            ))
          ) : (
            <p>Watch a company to keep its research close.</p>
          )}
        </div>
        <div className="t-side-bottom">
          <Link href="/editions/02">
            <History size={15} /> Earlier research
          </Link>
          <Link href="/saved">
            <FileText size={15} /> Earlier saved notes
          </Link>
          <span>
            Company data / SEC EDGAR
            <br />
            Market charts / TradingView
          </span>
        </div>
      </aside>
      <div className="t-shell">
        <header className="t-top">
          <div className="t-mobile-brand">
            <Image
              src="/brand/bullproof.svg?v=20261029-bull"
              width={27}
              height={27}
              alt="Bullproof"
            />
          </div>
          <div className="t-search-wrap">
            <div className="t-search">
              <Search size={16} />
              <input
                ref={searchInput}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setResults([]);
                  setSearchError("");
                }}
                maxLength={80}
                placeholder="Research a company or ticker…"
                aria-label="Search all listed companies"
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) void choose(results[0]);
                }}
              />
              {query ? (
                <button
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                  }}
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd>
                  <Command size={10} /> K
                </kbd>
              )}
            </div>
            {query.trim() ? (
              <div className="t-search-results">
                <div className="t-label">SEC COMPANY DIRECTORY</div>
                {searchBusy ? (
                  <p>
                    <LoaderCircle size={14} className="t-spin" /> Finding
                    companies…
                  </p>
                ) : searchError ? (
                  <p>{searchError}</p>
                ) : results.length ? (
                  results.map((c) => (
                    <button
                      key={`${c.cik}-${c.ticker}`}
                      onClick={() => void choose(c)}
                    >
                      <b>{c.ticker}</b>
                      <span>
                        {c.name}
                        <small>{c.exchange}</small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))
                ) : (
                  <p>No matches yet. Try a ticker or company name.</p>
                )}
              </div>
            ) : null}
          </div>
          <div className="t-source-status">
            <i className={feedError || feed?.stale ? "t-disconnected" : ""} />
            <span>
              {feedBusy
                ? "Checking filings"
                : feedError
                  ? "Source connection issue"
                  : feed?.stale
                    ? "Cached source data"
                    : feed
                      ? "SEC connected"
                      : "Connecting sources"}
            </span>
          </div>
          <button
            className="t-refresh"
            onClick={() => {
              void loadFeed();
              if (selected) void refreshSelected(selected.ticker);
            }}
            disabled={feedBusy}
            aria-label="Refresh discovery sources"
          >
            <RotateCw size={14} className={feedBusy ? "t-spin" : ""} />
            <span>Refresh</span>
          </button>
        </header>
        <MarketTape symbols={tapeSymbols} />
        <main className="t-main">
          <div className="t-page-title">
            <div>
              <div className="t-eyebrow">
                DISCOVERY / REPORTED FINANCIAL CHANGES
              </div>
              <h1>A reason to look closer.</h1>
            </div>
            <div className="t-coverage">
              <span>
                <b>{feed?.coverage.universeCount.toLocaleString() ?? "—"}</b>{" "}
                listed securities
              </span>
              <span>
                <b>{feed?.coverage.candidateCount.toLocaleString() ?? "—"}</b>{" "}
                recent filers
              </span>
              <span>
                <b>{feed?.companies.length ?? "—"}</b> researched
              </span>
            </div>
          </div>
          <div className="t-source-line">
            <span>
              <i />{" "}
              {feed
                ? "Fresh annual and quarterly reports · US-listed companies · rolling 14-day window"
                : "Reading recent company filings and comparing reported quarters…"}
            </span>
            <small>
              {feed
                ? `${feed.stale ? "Cached · " : ""}Checked ${timeLabel(feed.fetchedAt)}`
                : "First scan can take a few seconds"}
            </small>
          </div>
          {feedError ? (
            <div className="t-error" role="alert">
              <b>Discovery source unavailable</b>
              <span>{feedError}</span>
              <button onClick={() => void loadFeed()}>Try again</button>
              {feed ? (
                <small>Previously loaded research remains visible.</small>
              ) : null}
            </div>
          ) : null}
          {feed ? (
            <details className="t-source-warnings">
              <summary>
                Coverage &amp; methodology
                {feed.warnings.length
                  ? ` · ${feed.warnings.length} source notes`
                  : ""}
              </summary>
              <p>{feed.coverage.description}</p>
              {feed.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </details>
          ) : null}
          {showWatchlist ? (
            <section className="t-watchlist-panel">
              <header>
                <h2>Your watchlist</h2>
                <button
                  aria-label="Close watchlist"
                  onClick={() => setShowWatchlist(false)}
                >
                  <X size={16} />
                </button>
              </header>
              {shelf.watchlist.length ? (
                <div>
                  {shelf.watchlist.map((ticker) => (
                    <button
                      key={ticker}
                      onClick={() =>
                        void choose(
                          feed?.companies.find((c) => c.ticker === ticker) ?? {
                            ticker,
                            name: ticker,
                            cik: "",
                            exchange: "",
                          },
                        )
                      }
                    >
                      <b>{ticker}</b>
                      <span>
                        {shelf.notes[ticker]
                          ? "Has research notes"
                          : "Open current research"}
                      </span>
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
              ) : (
                <p>
                  Use Watch on a company to save it here. Notes stay in this
                  browser.
                </p>
              )}
            </section>
          ) : null}
          <div className="t-lenses" role="group" aria-label="Discovery lenses">
            <SlidersHorizontal size={14} />
            {lenses.map((l) => (
              <button
                key={l.id}
                aria-pressed={lens === l.id}
                onClick={() => {
                  setLens(l.id);
                  setMobileView("feed");
                }}
              >
                {l.label}
                {l.id === "unseen" ? (
                  <span>
                    {
                      (feed?.companies ?? []).filter(
                        (c) => !shelf.seen.includes(c.ticker),
                      ).length
                    }
                  </span>
                ) : null}
              </button>
            ))}
            <span className="t-lens-description">
              {lenses.find((l) => l.id === lens)?.description}
            </span>
          </div>
          <div className="t-mobile-switch">
            <button
              aria-pressed={mobileView === "feed"}
              onClick={() => setMobileView("feed")}
            >
              Discoveries <span>{companies.length}</span>
            </button>
            <button
              aria-pressed={mobileView === "company"}
              onClick={() => setMobileView("company")}
            >
              Research {current?.ticker ?? ""}
            </button>
            <button
              onClick={() => setShowWatchlist((v) => !v)}
              aria-label="Open watchlist"
            >
              <Bookmark size={15} />
              {shelf.watchlist.length}
            </button>
          </div>
          <div className={`t-terminal-grid t-mobile-${mobileView}`}>
            <section className="t-feed">
              <header className="t-panel-top">
                <span>
                  <Radio size={13} /> RESEARCH INBOX
                </span>
                <select
                  aria-label="Sort discoveries"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="recent">Newest filing</option>
                  <option value="growth">Revenue growth</option>
                </select>
              </header>
              <div className="t-feed-list">
                {feedBusy && !feed ? (
                  <div className="t-loading">
                    <LoaderCircle size={22} className="t-spin" />
                    <h2>Scanning fresh filings</h2>
                    <p>
                      Matching listed companies, extracting financial history,
                      and checking the changes.
                    </p>
                    <small>
                      Every discovery needs reported data behind it.
                    </small>
                  </div>
                ) : companies.length ? (
                  companies.map((c) => {
                    const s = c.signals[0];
                    const q = c.quarters.at(-1);
                    return (
                      <button
                        className={`t-discovery-row ${current?.ticker === c.ticker ? "t-selected" : ""}`}
                        key={c.cik}
                        onClick={() => void choose(c)}
                      >
                        <div className="t-row-top">
                          <b>{c.ticker}</b>
                          <span>{c.exchange}</span>
                          {shelf.watchlist.includes(c.ticker) ? (
                            <Bookmark size={12} />
                          ) : null}
                          <small>{shortDate(c.latestFilingDate)}</small>
                        </div>
                        <div className="t-row-name">{c.name}</div>
                        <div className="t-row-signal">
                          <span
                            className={`t-signal-dot t-tone-${s?.tone ?? "neutral"}`}
                          />
                          {s?.title ?? "A new financial report to investigate"}
                        </div>
                        <div className="t-row-data">
                          <div>
                            <small>REVENUE YoY</small>
                            <strong
                              className={
                                (s?.revenueGrowth ?? 0) < 0
                                  ? "t-red"
                                  : "t-green"
                              }
                            >
                              {changeLabel(s?.revenueGrowth ?? null)}
                            </strong>
                          </div>
                          <div>
                            <small>OP. MARGIN</small>
                            <strong>
                              {q?.operatingMargin === null ||
                              q?.operatingMargin === undefined
                                ? "—"
                                : q.operatingMargin.toFixed(1) + "%"}
                            </strong>
                          </div>
                          <RevenueSpark quarters={c.quarters} />
                        </div>
                        <div className="t-row-foot">
                          <span>
                            {c.latestFilingForm} · ended{" "}
                            {shortDate(c.periodEnd)}
                          </span>
                          <span>
                            {shelf.seen.includes(c.ticker)
                              ? "Viewed"
                              : "New to you"}{" "}
                            <ArrowUpRight size={11} />
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="t-no-results">
                    <Search size={22} />
                    <h3>No matches in this batch.</h3>
                    <p>Try another lens or scan more recent filers.</p>
                    <button onClick={() => setLens("all")}>
                      Show all signals
                    </button>
                  </div>
                )}
              </div>
              <div className="t-feed-bottom">
                {feed?.nextCursor ? (
                  <button
                    className="t-load-more"
                    disabled={moreBusy || feedBusy}
                    onClick={() => void loadFeed(feed.nextCursor!)}
                  >
                    {moreBusy ? (
                      <LoaderCircle size={14} className="t-spin" />
                    ) : (
                      <ArrowDown size={14} />
                    )}{" "}
                    {moreBusy
                      ? "Researching the next companies…"
                      : "Scan more companies"}
                  </button>
                ) : feed ? (
                  <span>
                    End of this filing window. Refresh checks for new filings.
                  </span>
                ) : null}
                <small>
                  {feed
                    ? `${feed.coverage.scannedCount} examined in the latest batch · auto-check every 15 min while open`
                    : "Connecting to SEC EDGAR"}
                </small>
              </div>
            </section>
            <section className="t-research">
              {companyBusy ? (
                <div className="t-loading t-company-loading">
                  <LoaderCircle size={24} className="t-spin" />
                  <h2>Researching {requested?.ticker}</h2>
                  <p>
                    Loading standardized financial history from the original
                    filings.
                  </p>
                </div>
              ) : companyError ? (
                <div className="t-company-error">
                  <h2>{requested?.name}</h2>
                  <div className="t-error" role="alert">
                    {companyError}
                  </div>
                  {requested ? (
                    <>
                      <button
                        className="t-action"
                        onClick={() => void choose(requested)}
                      >
                        Retry financial research
                      </button>
                      <PriceChart
                        key={requested.ticker}
                        symbol={
                          requested.exchange
                            ? tvSymbol(requested)
                            : requested.ticker
                        }
                        name={requested.name}
                      />
                    </>
                  ) : null}
                </div>
              ) : selected && latest ? (
                <>
                  <header className="t-company-head">
                    <div className="t-company-id">
                      <span>{selected.ticker}</span>
                      <div>
                        <h2>{selected.name}</h2>
                        <small>
                          {selected.exchange} · CIK {selected.cik}
                          <span className="t-company-freshness">
                            Research checked {timeLabel(selected.fetchedAt)}
                          </span>
                        </small>
                      </div>
                    </div>
                    <WatchButton
                      saved={shelf.watchlist.includes(selected.ticker)}
                      name={selected.ticker}
                      onClick={() => toggleWatch(selected)}
                    />
                  </header>
                  <div
                    className="t-research-tabs"
                    role="group"
                    aria-label="Company research view"
                  >
                    {(
                      [
                        ["research", "Financials"],
                        ["price", "Price & volume"],
                        ["business", "The business"],
                        ["filings", "Source filings"],
                        ["notes", "My notes"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        aria-pressed={tab === id}
                        onClick={() => setTab(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {selected.stale ? (
                    <div className="t-stale">
                      Cached financial research · checked{" "}
                      {timeLabel(selected.fetchedAt)}.{" "}
                      {selected.warnings.join(" ")}
                    </div>
                  ) : null}
                  {tab === "research" ? (
                    <>
                      <div
                        className={`t-reason t-tone-${mainSignal?.tone ?? "neutral"}`}
                      >
                        <div>
                          <span className="t-label">
                            <Sparkles size={12} /> WHY THIS SURFACED
                          </span>
                          <span className="t-horizon">
                            Business change · quarters
                          </span>
                        </div>
                        <h3>{mainSignal?.title ?? "New financial evidence"}</h3>
                        <p>{signalSummary(selected)}</p>
                        <a
                          href={selected.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {selected.latestFilingForm} filed{" "}
                          {shortDate(selected.latestFilingDate)},{" "}
                          {selected.latestFilingDate.slice(0, 4)}{" "}
                          <ExternalLink size={11} />
                        </a>
                      </div>
                      <div className="t-period-context">
                        Year-over-year comparison · quarter ended{" "}
                        {shortDate(latest.end)}, {latest.end.slice(0, 4)}
                      </div>
                      <div className="t-financial-kpis">
                        <div>
                          <small>QUARTERLY REVENUE</small>
                          <strong>{compactMoney(latest.revenue)}</strong>
                          <span
                            className={
                              (mainSignal?.revenueGrowth ?? 0) < 0
                                ? "t-red"
                                : "t-green"
                            }
                          >
                            {changeLabel(mainSignal?.revenueGrowth ?? null)}{" "}
                            <em>YoY</em>
                          </span>
                        </div>
                        <div>
                          <small>OPERATING MARGIN</small>
                          <strong>
                            {latest.operatingMargin === null
                              ? "—"
                              : latest.operatingMargin.toFixed(1) + "%"}
                          </strong>
                          <span
                            className={
                              (mainSignal?.marginChangePp ?? 0) < 0
                                ? "t-red"
                                : "t-green"
                            }
                          >
                            {changeLabel(
                              mainSignal?.marginChangePp ?? null,
                              " pp",
                            )}{" "}
                            <em>YoY</em>
                          </span>
                        </div>
                        <div>
                          <small>QUARTERLY NET INCOME</small>
                          <strong>{compactMoney(latest.netIncome)}</strong>
                          <span>
                            Ended {shortDate(latest.end)},{" "}
                            {latest.end.slice(0, 4)}
                          </span>
                        </div>
                      </div>
                      <div className="t-fundamental-grid">
                        {(
                          [
                            "revenue",
                            "operatingMargin",
                            "operatingIncome",
                            "netIncome",
                          ] as FinancialKey[]
                        ).map((field) => (
                          <section key={field} className="t-financial-panel">
                            <header>
                              <h3>{financialLabels[field]}</h3>
                              <span>
                                {selected.quarters.length} reported quarters
                              </span>
                            </header>
                            <QuarterChart
                              key={`${selected.ticker}-${field}`}
                              quarters={selected.quarters}
                              field={field}
                            />
                          </section>
                        ))}
                      </div>
                      <div className="t-research-next">
                        <section>
                          <span className="t-label">
                            WHAT TO INVESTIGATE NEXT
                          </span>
                          <h3>A signal starts a question.</h3>
                          <ul>
                            <li>
                              {(mainSignal?.revenueGrowth ?? 0) > 10
                                ? "Separate organic demand from pricing and acquisitions. Is this growth repeatable?"
                                : (mainSignal?.revenueGrowth ?? 0) < 0
                                  ? "Is the sales decline cyclical, or is the business losing demand?"
                                  : "What changes the company’s growth rate from here?"}
                            </li>
                            <li>
                              {mainSignal?.marginChangePp === null ||
                              mainSignal?.marginChangePp === undefined
                                ? "Comparable operating margin is unavailable. Check the cost structure in the original filing."
                                : mainSignal.marginChangePp > 0.05
                                  ? "Which costs or business mix drove the margin improvement? Check for one-time benefits."
                                  : mainSignal.marginChangePp < -0.05
                                    ? "What explains the margin pressure, and can management reverse it?"
                                    : "What could change the currently stable operating margin?"}
                            </li>
                            <li>
                              Compare valuation with normalized earnings before
                              deciding whether the stock is attractive.
                            </li>
                          </ul>
                          <button onClick={() => setTab("notes")}>
                            Write your research question{" "}
                            <ArrowRight size={13} />
                          </button>
                        </section>
                        <section>
                          <span className="t-label">DATA TO KEEP IN MIND</span>
                          <p>
                            This is a measured financial change, not a confirmed
                            explanation or a buy rating.
                          </p>
                          {selected.caveats.slice(0, 3).map((c) => (
                            <p key={c}>{c}</p>
                          ))}
                          <button onClick={() => setTab("filings")}>
                            Inspect periods & sources <ArrowUpRight size={13} />
                          </button>
                        </section>
                      </div>
                    </>
                  ) : tab === "price" ? (
                    <>
                      <div className="t-price-intro">
                        <span className="t-label">
                          PRICE / VOLUME / INDICATORS
                        </span>
                        <span>
                          Independent market feed · use the chart controls to
                          explore
                        </span>
                      </div>
                      <PriceChart
                        key={selected.ticker}
                        symbol={tvSymbol(selected)}
                        name={selected.name}
                      />
                      <div className="t-price-context">
                        <strong>Price action is context.</strong>
                        <span>
                          The discovery signal comes from reported financials. A
                          chart move alone does not establish its cause.
                        </span>
                        <button onClick={() => setTab("research")}>
                          Back to the financial evidence{" "}
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </>
                  ) : tab === "business" ? (
                    <>
                      <div className="t-business-heading">
                        <span className="t-label">UNDERSTAND THE COMPANY</span>
                        <h3>What does {selected.ticker} actually do?</h3>
                        <p>
                          Business description and industry context from the
                          market-data provider.
                        </p>
                      </div>
                      <CompanyProfile
                        key={selected.ticker}
                        symbol={tvSymbol(selected)}
                      />
                      <div className="t-business-links">
                        <a
                          href={`https://www.sec.gov/edgar/browse/?CIK=${selected.cik}&owner=exclude`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Full SEC company record <ExternalLink size={13} />
                        </a>
                        <a
                          href={selected.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Read the source business report{" "}
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    </>
                  ) : tab === "filings" ? (
                    <section className="t-filings">
                      <div className="t-filings-heading">
                        <span className="t-label">REPRODUCE THE RESEARCH</span>
                        <h3>The numbers, back to their source.</h3>
                        <p>
                          Standalone quarters. Values are US dollars; margins
                          are percentages. Open a metric’s filing to check its
                          accounting tag and reporting context.
                        </p>
                      </div>
                      <div className="t-table-scroll">
                        <table>
                          <caption>
                            {selected.name} · reported quarterly history
                          </caption>
                          <thead>
                            <tr>
                              <th>Quarter end</th>
                              <th>Revenue</th>
                              <th>Op. income</th>
                              <th>Margin</th>
                              <th>Net income</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...selected.quarters].reverse().map((q) => (
                              <tr key={q.end}>
                                <th>
                                  {q.end}
                                  <small>Filed {q.filed}</small>
                                </th>
                                {(
                                  [
                                    "revenue",
                                    "operatingIncome",
                                    "operatingMargin",
                                    "netIncome",
                                  ] as FinancialKey[]
                                ).map((field) => (
                                  <td key={field}>
                                    <a
                                      href={
                                        q.sources[
                                          field === "operatingMargin"
                                            ? "operatingIncome"
                                            : field
                                        ]?.sourceUrl ?? q.sourceUrl
                                      }
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={
                                        q.sources[
                                          field === "operatingMargin"
                                            ? "operatingIncome"
                                            : field
                                        ]?.tag
                                      }
                                    >
                                      {field === "operatingMargin"
                                        ? q[field] === null
                                          ? "—"
                                          : q[field].toFixed(1) + "%"
                                        : compactMoney(q[field])}
                                      <ExternalLink size={9} />
                                    </a>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="t-source-method">
                        <h3>How this signal was produced</h3>
                        <ol>
                          <li>
                            Read a recent annual or quarterly filing from SEC
                            EDGAR.
                          </li>
                          <li>
                            Match the issuer to the SEC listed-company
                            directory.
                          </li>
                          <li>
                            Extract standardized XBRL facts with their period
                            and accession.
                          </li>
                          <li>
                            Compare matching prior-year quarters; flag
                            measurable changes.
                          </li>
                        </ol>
                        <p>
                          Rule-based screening. No generated news narrative is
                          treated as a verified cause.
                        </p>
                        {selected.caveats.map((c) => (
                          <p key={c}>{c}</p>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <NoteEditor
                      key={selected.ticker}
                      company={selected}
                      value={shelf.notes[selected.ticker] ?? ""}
                      onSave={(note) =>
                        writeShelf(
                          (s) => ({
                            ...s,
                            notes: { ...s.notes, [selected.ticker]: note },
                            watchlist: s.watchlist.includes(selected.ticker)
                              ? s.watchlist
                              : [selected.ticker, ...s.watchlist].slice(0, 100),
                          }),
                          "Research note saved in this browser.",
                        )
                      }
                    />
                  )}
                </>
              ) : (
                <div className="t-loading t-company-loading">
                  <Radio size={28} />
                  <h2>
                    {feedBusy
                      ? "Building your research inbox"
                      : "Choose a company to investigate"}
                  </h2>
                  <p>
                    Financial history, price charts, company context, and
                    original filings in one workspace.
                  </p>
                </div>
              )}
            </section>
          </div>
          <footer className="t-footer">
            <span>
              <i /> SEC filings + XBRL · TradingView market data
            </span>
            <span>
              Refreshes while open · company filings update on reporting
              schedules
            </span>
            <Link href="/editions/02">
              Curated edition archive <ArrowUpRight size={12} />
            </Link>
          </footer>
        </main>
      </div>
      {status ? (
        <div role="status" className="t-toast">
          <span>{status}</span>
          <button onClick={() => setStatus("")} aria-label="Dismiss message">
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
