## October 28: Atlas discovery + Journal briefs

The production homepage now uses `ResearchApp`, with fresh SEC discovery and per-company research. The approved fixed previews remain under `/directions/` for reference only. Main routes never read their snapshot JSON.

New visualizations: selectable growth/margin scatterplot, signed growth ranking, linked quarterly revenue/operating-income/net-income bars, gap-aware margin history, and matching-year margin comparison. Includes signal filters, optional symmetric-log outlier scale, table/CSV fallback, original filing links, ticker search, TradingView price/volume, saved companies and notes. Draft notes survive in-app navigation; saving persists them in this browser.

Installed guidance: NTCoding/claude-skillz data-visualization and jiannanya/snow-d3 (pinned revisions recorded in output/atlas-journal-oct28). D3 scale, shape and Delaunay modules implement responsive scales and nearest-point selection. Interface Design and Impeccable guide the approved visual system. See DESIGN.md.

Discovery refreshes every 15 minutes while visible; scan-more loads distinct batches from the rolling filings window. SEC coverage is selective (supported USD US-GAAP quarters), not a complete worldwide stock universe. Unsupported or more-than-18-month-old financial history produces a coverage message; market chart access remains available. No paid data API is configured.

Validation: 50 tests, lint, typecheck, production build, desktop/mobile browser checks and independent design review. Browser evidence lives in output/playwright/atlas-journal-oct28/.

# Bullproof

The default experience is a connected **discovery terminal**. It reads recent SEC filings, matches issuers to the exchange-listed ticker directory, extracts reported quarterly financials, and explains measurable changes. There is no manually chosen company list in the default feed.

Live: https://bullproof.vercel.app . Production `dpl_BMECRnmzmSeR2AjFTr6qjYj6BY6r` is READY; rollback reference `dpl_HpoExPYqawxKCZZHcQaTYUWTVAuJ`.  The former three-company edition is archived at `/editions/02`; old saved notes remain at `/saved`, and the original market dashboard/notebook remains at `/desk` with its storage untouched.

## Live discovery and research

- `/api/discover`: reads up to the newest100 filings per form (10-Q and10-K) from a rolling14-day window; resolves unique listed issuers; checks up to15 candidates per page to return up to6 comparable companies. Load more continues a frozen candidate snapshot; refresh starts a current scan.
- `/api/search?q=...`: searches the SEC exchange-listed ticker directory (roughly10,000 securities; actual coverage is returned).
- `/api/company/[ticker]`: up to8 explicitly reported standalone quarters, accounting tags, filing accessions, financial-change signals, and limitations. No estimated missing quarters or cumulative cash masquerading as quarterly data.
- Measured signals include sales growth with margin pressure, profit/loss transitions, expanding margins, and declining sales/profitability. These explain a research question, not an expected return. No synthetic confidence scores, buy ratings, or unverified catalyst narratives.
- Frontend: ticker search, discovery lenses, distinct pagination, period charts, source drilldowns, attributed TradingView price/volume charts and company profiles, watchlists, seen status and notes.
- App and selected-company research refresh every15 minutes while visible, plus manual refresh. Provider caches retain original retrieval timestamps; stale responses and coverage omissions are explicit. Old data is never replaced with fictional sample companies.
- Research storage: `bullproof:terminal:v1`, browser-local. The prior discovery shelf and research notebook are preserved under their original keys. Cross-device sync is not connected.

## Source architecture and boundaries

`src/lib/live-research.ts` owns server-side SEC access, normalization, quantitative signals, bounded scanning, compressed stateless cursors, single-flight requests and cache. Types are in `live-research-types.ts`; tests cover fiscal-period matching, restatements, loss-base handling, cache expiry, distinct pagination and malformed/decompression-limited cursors.

SEC request starts are gated to fewer than3 per second **per server process**, with12-second request timeouts, a bounded discovery operation budget,15-minute company/candidate caching and6-hour directory caching. Cache/rate coordination is not distributed across a deployment fleet; this is a personal prototype, and larger traffic needs a shared cache and limiter. A company can be omitted when standardized USD US-GAAP tags or exact standalone quarters are missing. Financial statements update on reporting schedules; refresh does not manufacture new financial data between filings.

TradingView widgets provide their own market feed. Exchange delays and coverage vary. Widget documents are isolated from React script cleanup and keep attribution and an external chart link. No market-data API credentials or scraping are used for the terminal. Optional `SEC_USER_AGENT` can identify the operator; the default identifies Bullproof and its public URL.

Primary references: [SEC APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [TradingView widget integration](https://www.tradingview.com/widget-docs/tutorials/iframe/build-page/widget-integration/).

## Branding and validation

Bullproof remains the working name. SVG branding, ICO favicon, opaque180px Apple icon and192/512px manifest icons remain available for Safari Add to Home Screen. Regenerate assets with `node scripts/export-icons.mjs`.

Lint, TypeScript,39 tests and production build pass. Browser checks cover distinct scan batches, arbitrary ticker search, eight-quarter chart/source rendering, actual TradingView candlestick canvases, company profiles, watchlist/notes persistence, deep-link refresh, injected upstream failure/recovery, and320/390/768/1024/1440 responsive widths. Evidence: `output/live-terminal-oct27/`. Physical iPhone installation is not directly tested.

The sections below describe the retained `/desk` experience.

## Research notebook

The case editor is now a four-part investigation workspace: **Thesis → Evidence → Review → History**.

- **Evidence:** source cards pair an HTTP(S) link and publication date with a specific claim, optional excerpt, and Supports / Contradicts / Unclear relationship. Cards can be edited or removed with undo before saving. The app validates the record shape, not the truth of its contents or the availability of the linked page.
- **Review:** record an updated conclusion, change the case status, and schedule your next review while retaining the first market observation.
- **History:** each changed save creates a dated, read-only revision of the hypothesis, evidence cards, notes, conclusion, and review settings. Expand a revision for before-and-after comparisons. Editing or removing a source does not rewrite earlier revisions. Saving unchanged content does not create duplicate history.
- **Compatibility:** version-one notebooks migrate to version two on the next save. Their existing notes become the initial revision and remain editable under Evidence → Research notes. The same browser-storage key is retained.

History is immutable through the application UI, not a tamper-proof audit log. It is still local browser data and can be lost if that data is cleared. Export includes the complete revision history; import and cloud recovery remain unimplemented.

- Open any mover and choose **Start research case**, or try the clearly labeled fictional case from the research desk.
- Record a question/hypothesis, source notes, counterevidence, a falsifier, review date, and investigation status.
- Save and reopen cases across browser reloads; filter by status or reviews due, and search by ticker or hypothesis.
- Each case preserves its original price observation, source, retrieval timestamp, period, and sample/live-feed distinction. Opening a saved case never substitutes a current quote.
- Export the versioned notebook JSON for a portable copy. Import and cross-device sync are not implemented.
- Storage failures keep the editor open with an error. Unreadable saved data is never silently replaced. Unsaved edits prompt before closing the editor.

This first slice uses local browser storage, not an account or a server database. Evidence is manually authored and is not verified by the app. Review dates are an in-app queue, not notifications. The notebook does not fetch filings, explain catalysts automatically, or recommend trades.

### A one-minute demonstration

1. Choose **Try a sample case**. The fictional DEMO1 case explains the research fields without pretending to contain actual market evidence.
2. Revise the hypothesis, add a review date, and save.
3. Refresh the page, open **Research desk**, filter to reviews due, and reopen the case.
4. Change its status to Closed and save. It remains searchable under All cases or Closed and leaves the due queue.

The deeper prototype at `Project Room/bullproof` remains a separate application. Its source-scoped evidence model is a possible future migration destination; this change does not claim the two codebases are integrated.

## What it includes

- Daily winners and losers with price, dollar move, percentage move, and volume
- A $2 price, 100K-share volume, and $1M turnover screen to reduce illiquid noise
- Explainable 0–100 research scores based on momentum, turnover, and liquidity
- Risk context for every research candidate
- Ticker search, local watchlist persistence, detail drawers, loading/error states, and responsive layouts
- A provider adapter for full-universe 1D and 1W rankings

## Data modes

The app deliberately avoids undocumented market-data scraping endpoints whose terms prohibit redistribution.

### Preview mode

With no environment variables, the app uses Alpha Vantage's documented `TOP_GAINERS_LOSERS` demo endpoint. It provides live end-of-day headline movers and most-active U.S. tickers. The interface labels this as headline coverage and keeps 1W locked because the demo response is not a full-market historical feed.

### Full-universe mode

Set `MASSIVE_API_KEY` on the server to use Massive's adjusted U.S. daily aggregate endpoint. The app retrieves completed sessions, calculates 1D and 1W price returns, applies the liquidity screen, and enables both period controls.

Before publicly redistributing market data, confirm that your provider plan grants the required display and redistribution rights. Never expose `MASSIVE_API_KEY` with a `NEXT_PUBLIC_` prefix.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Optional full-universe feed:

```bash
# .env.local
MASSIVE_API_KEY=your_server_side_key
```

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Deploy to Vercel

```bash
npx vercel@latest deploy -y
```

Add `MASSIVE_API_KEY` in the Vercel project settings if you have a provider plan that permits your intended use, then redeploy.

## Signal methodology

The research score is a ranking heuristic:

- 50% absolute price momentum
- 30% latest-session dollar turnover
- 20% latest-session share liquidity

The score does not include valuation, financial statements, portfolio fit, taxes, news verification, or a prediction of future returns. The interface keeps those limitations visible wherever signals appear.
