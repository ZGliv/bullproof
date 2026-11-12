# Bullproof

Earnings research with AI-generated market calls, linked SEC evidence, and a public results record.

[Open Bullproof](https://bullproof.vercel.app)

## What it does

- **Earnings slate:** publishes dated calls on the direction and size of a stock's earnings reaction. Calls retain their original evidence and publication time.
- **Call details:** pairs the thesis with source excerpts, filing links, historical earnings reactions, and a typical-move reference calculated from those reactions.
- **Results record:** grades direction and move-size separately, keeping pending, graded, and void calls distinguishable. Missing release or price evidence is handled explicitly.
- **Company research:** SEC-backed discovery, ticker search, financial charts, TradingView market charts, saved companies, research notes, and optional private device sync.
- **Portfolio experiment:** retains the earlier paper-portfolio research and results. These are internal simulations; the application does not place broker orders. The portfolio schedule is retired, separate from the earnings jobs.

The main routes are `/` (slate), `/call/[id]` (call details), `/record` (results), `/research` (company research), `/saved` (saved research), and `/arena` (portfolio experiment).

AI commentary is experimental, not investment advice or evidence of a proven predictive edge. Source coverage and data availability limit what the app can publish.

## Stack

Next.js 16, React 19, TypeScript, and D3 on the web; Cloudflare Workers, D1, and Workers AI for hosted jobs and storage. SEC EDGAR supplies filing evidence, Alpha Vantage supplies the earnings calendar, and Alpaca supplies market observations and news.

- `src/app/` — pages and server endpoints
- `src/components/calls/` — earnings slate, call details, and record interface
- `src/lib/earnings/` — shared contracts, evidence extraction, calendar handling, grading, and validation
- `src/lib/live-research.ts` — SEC company research and discovery
- `cloud/earnings.ts` — scheduled earnings publication, grading, and public reads
- `cloud/worker.ts` — Worker entry point, protected admin routes, and retained portfolio features

## Run locally

Requires Node.js **22.18.0 or newer**.

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). To connect the earnings pages, create an untracked `.env.local` and set `BULLPROOF_RUNNER_URL` to your configured Worker. Production accepts HTTPS `*.workers.dev` URLs; development also accepts localhost or `127.0.0.1`.

Without a configured, reachable Worker and initialized database, the earnings pages show **Unavailable**. The repository does not bundle a live earnings database. `/research` can read public SEC sources independently; hosted enrichment and sync require the Worker.

## Runtime configuration

The web app reads these server-side environment variables:

| Name | Purpose |
| --- | --- |
| `BULLPROOF_RUNNER_URL` | Base URL of the hosted Worker |
| `SEC_USER_AGENT` | Optional operator identification for SEC requests |

For your own backend, update the account and D1 identifiers in `cloud/wrangler.jsonc`, bind `DB` to your database and `AI` to Workers AI, and initialize the applicable schemas: `cloud/earnings-schema.sql`, `cloud/schema.sql`, and `cloud/sync-schema.sql`. The file's schedules invoke the earnings publication and grading jobs.

Worker configuration:

| Name | Purpose |
| --- | --- |
| `RESEARCH_URL` | Base URL of the Next.js app providing SEC evidence endpoints |
| `ALPHAVANTAGE_API_KEY` | Worker secret for the earnings calendar; required to publish a slate |
| `APCA_API_KEY_ID` | Worker secret for Alpaca API access |
| `APCA_API_SECRET_KEY` | Worker secret for Alpaca API access |
| `ADMIN_TOKEN` | Worker secret protecting administrative operations |
| `ENABLED` | Gate for the retained paper-portfolio runner; not an earnings-job switch |

Keep credentials in server environment variables or Worker secrets, never client-exposed variables. Environment files, private portfolio state, local build output, and deployment credentials are excluded from Git. The retained `public/data/paper-arena.json` is a dated public simulation snapshot, not private account data or the current earnings ledger.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The tests cover evidence extraction, calendar and session boundaries, reaction calculations, grading, publication validation, Worker behavior, and retained research features. These checks do not establish predictive accuracy or verify a particular deployed environment.
