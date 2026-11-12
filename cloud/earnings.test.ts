import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker';
import {
  GRADE_CRON,
  MODEL,
  PROMPT_VERSION,
  PUBLISH_CRON,
  board,
  callById,
  gradeDue,
  jobFailed,
  ledger,
  modelJson,
  modelRequest,
  publishSlate,
  retryMessage,
} from './earnings';
import { callHashInput } from '../src/lib/earnings/validate';
import type { EarningsCall, EarningsRelease, EvidenceDoc, TradingDay } from '../src/lib/earnings/types';

// ---------------------------------------------------------------------------------------------
// Harness: an in-memory D1 stand-in on node:sqlite, as in worker.test.ts.

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('cloud/schema.sql', 'utf8'));
  db.exec(readFileSync('cloud/earnings-schema.sql', 'utf8'));
  function prepare(sql: string) {
    let args: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) {
        args = values;
        return statement;
      },
      async first<T>() {
        return (db.prepare(sql).get(...(args as [])) ?? null) as T | null;
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...(args as [])) as T[] };
      },
      async run() {
        return { meta: { changes: Number(db.prepare(sql).run(...(args as [])).changes) } };
      },
    };
    return statement;
  }
  async function batch(statements: { run: () => Promise<unknown> }[]) {
    db.exec('BEGIN');
    try {
      const out = [];
      for (const s of statements) out.push(await s.run());
      db.exec('COMMIT');
      return out;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return { prepare, batch, raw: db };
}

const ADMIN = 'test-secret-not-a-real-key';

function environment() {
  return {
    DB: database(),
    AI: { run: vi.fn() },
    APCA_API_KEY_ID: 'test',
    APCA_API_SECRET_KEY: 'test',
    ADMIN_TOKEN: ADMIN,
    RESEARCH_URL: 'https://research.test',
    ENABLED: 'true',
    ALPHAVANTAGE_API_KEY: 'test-key',
  };
}
type Env = ReturnType<typeof environment>;

function rows<T>(env: Env, sql: string): T[] {
  return env.DB.raw.prepare(sql).all() as T[];
}

// ---------------------------------------------------------------------------------------------
// Real data. Calendar: weekdays minus the NYSE holidays and half days that Alpaca /v2/calendar
// returned for 2025-2026. Prices: Alpaca SIP split-adjusted daily bars. Filings: SEC EDGAR via the
// app's /api/earnings/packet route on 2026-11-12 (text cut to short excerpts).

const HOLIDAYS = [
  '2025-01-01', '2025-01-09', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19',
  '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25', '2026-01-01', '2026-01-19', '2026-02-16',
  '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
];
const HALF_DAYS = ['2025-07-03', '2025-11-28', '2025-12-24', '2026-11-27', '2026-12-24'];

function tradingDays(from: string, to: string): TradingDay[] {
  const days: TradingDay[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const weekday = new Date(t).getUTCDay();
    if (weekday === 0 || weekday === 6 || HOLIDAYS.includes(date)) continue;
    days.push({ date, open: '09:30', close: HALF_DAYS.includes(date) ? '13:00' : '16:00' });
  }
  return days;
}
const CALENDAR = tradingDays('2025-01-02', '2026-12-31');

/** Alpha Vantage EARNINGS_CALENDAR rows fetched 2026-11-12 (AACG has no time slot, so it is an estimate). */
const AV_CSV = [
  'symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay',
  'AACG,ATA CREATIVITY GLOBAL,2026-11-11,2026-09-30,,USD,',
  'ABSI,ABSCI CORPORATION,2026-11-12,2026-09-30,-0.14,USD,pre-market',
  'AMAT,APPLIED MATERIALS INCORPORATED,2026-11-12,2026-10-31,4.06,USD,post-market',
  'CSCO,CISCO SYSTEMS INCORPORATED,2026-11-12,2026-10-31,1.15,USD,post-market',
].join('\n');

type Bar = { t: string; c: number; v: number };
const bar = (date: string, c: number, v: number): Bar => ({ t: `${date}T05:00:00Z`, c, v });

/** The last three sessions before the 2026-11-12 slate. ABSI is below the price floor and gets no bars here. */
const RECENT_BARS: Record<string, Bar[]> = {
  AMAT: [bar('2026-11-09', 370.55, 11009902), bar('2026-11-10', 372.53, 6341388), bar('2026-11-11', 395.08, 7405911)],
  CSCO: [bar('2026-11-09', 98.65, 20358799), bar('2026-11-10', 98.15, 17772769), bar('2026-11-11', 100.76, 19117433)],
};

/** CSCO closes around its last six results (8-Ks accepted after the close, so the next session reacts). */
const CSCO_HISTORY: Bar[] = [
  bar('2025-05-14', 61.29, 34509182), bar('2025-05-15', 64.26, 60718026),
  bar('2025-08-13', 70.4, 38096360), bar('2025-08-14', 69.3, 39317329),
  bar('2025-11-12', 73.96, 57591646), bar('2025-11-13', 77.38, 57638526),
  bar('2026-02-11', 85.54, 34455759), bar('2026-02-12', 75, 68098557),
  bar('2026-05-13', 101.87, 45246303), bar('2026-05-14', 115.53, 70942256),
  bar('2026-08-11', 120.43, 16382369), bar('2026-08-12', 123.88, 36220181),
  bar('2026-08-13', 113.47, 61562894), bar('2026-08-14', 111.68, 29415590),
  bar('2026-08-17', 112.9, 22791454),
];

const index = (accession: string) =>
  `https://www.sec.gov/Archives/edgar/data/858877/${accession.replace(/-/g, '')}/${accession}-index.htm`;
const release = (accession: string, acceptedAt: string, periodEnd: string): EarningsRelease => ({
  accession,
  acceptedAt,
  reportDate: acceptedAt.slice(0, 10),
  periodEnd,
  url: index(accession),
});
const CSCO_RELEASES: EarningsRelease[] = [
  release('0000858877-26-000106', '2026-08-12T20:07:06.000Z', '2026-07-25'),
  release('0000858877-26-000075', '2026-05-13T20:06:53.000Z', '2026-04-25'),
  release('0000858877-26-000006', '2026-02-11T21:07:20.000Z', '2026-01-24'),
  release('0001193125-25-277624', '2025-11-12T21:15:30.000Z', '2025-10-25'),
  release('0001193125-25-179820', '2025-08-13T20:11:01.000Z', '2025-07-26'),
  release('0001193125-25-119864', '2025-05-14T20:17:33.000Z', '2025-04-26'),
];

const CSCO_DOCS: EvidenceDoc[] = [
  {
    source: 'press_release',
    form: '8-K EX-99.1',
    accession: '0000858877-26-000106',
    filedAt: '2026-08-12T20:07:06.000Z',
    periodEnd: '2026-07-25',
    url: 'https://www.sec.gov/Archives/edgar/data/858877/000085887726000106/exhibit991pressrelease-q4f.htm',
    text: [
      'CISCO REPORTS FOURTH QUARTER AND FISCAL YEAR 2026 EARNINGS',
      'News Summary:',
      '•Broad-based, record high demand for Cisco technology with a networking supercycle underway',
      '◦Q4 total product orders up 35% year over year; up 25% excluding hyperscalers, with double-digit growth across every geography and customer market',
      '◦Networking product orders grew 40% year over year in Q4, marking the eighth consecutive quarter of double-digit growth',
      '◦$4 billion of orders taken in Q4, bringing the total for FY 2026 to $9.3 billion',
    ].join('\n'),
  },
  {
    source: 'mdna',
    form: '10-K',
    accession: '0000858877-26-000132',
    filedAt: '2026-09-02T20:36:56.000Z',
    periodEnd: '2026-07-25',
    url: 'https://www.sec.gov/Archives/edgar/data/858877/000085887726000132/csco-20260725.htm',
    text:
      'Total revenue in fiscal 2026 increased by 12% compared with fiscal 2025. Product revenue increased by 16% and ' +
      'services revenue was flat. Our total revenue reflected growth across each of our geographic segments.',
  },
];

const CSCO_PACKET = {
  ok: true,
  ticker: 'CSCO',
  cik: '0000858877',
  name: 'CISCO SYSTEMS, INC.',
  releases: CSCO_RELEASES,
  sharesOutstanding: 3942586873,
  fetchedAt: '2026-11-12T01:30:05.000Z',
  asOf: '2026-11-12T01:30:00.000Z',
  docs: CSCO_DOCS,
};

/** A model answer for CSCO whose quotes are verbatim from the excerpts above. */
const CSCO_ANSWER = {
  ticker: 'CSCO',
  direction: 'up',
  move: 'over',
  confidence: 3,
  bull: {
    point: 'Orders lead revenue, so a fourth-quarter order book this strong should show up in the quarter being reported.',
    source: 'press_release',
    quote: 'Networking product orders grew 40% year over year in Q4, marking the eighth consecutive quarter of double-digit growth',
  },
  bear: {
    point: 'Services, the recurring part of the business, did not grow in fiscal 2026, so product orders carry the whole case.',
    source: 'mdna',
    quote: 'Product revenue increased by 16% and services revenue was flat.',
  },
  thesis:
    'Q4 FY26 networking orders grew 40%, and that order book should carry into Q1 FY27 revenue. ' +
    'Two of the last three reactions beat the 6.6% line, -12.32% and +13.41%, so a large move is likely.',
  wrong_if: 'Q1 FY27 product orders grow more slowly than the 35% total product order growth reported for Q4 FY26.',
};

const modelReply = (answer: unknown) => ({ choices: [{ message: { content: JSON.stringify(answer) } }] });

// ---------------------------------------------------------------------------------------------
// A routed fetch stub for Alpaca, Alpha Vantage and the research routes.

interface World {
  csv?: string;
  recentBars?: Record<string, Bar[]>;
  history?: Record<string, Bar[]>;
  news?: NewsRow[];
  /** Serves news pages itself (paging, sort order); overrides `news`. */
  newsPage?: (url: URL) => { news: NewsRow[]; next_page_token: string | null };
  /** Serves every bars response in two pages joined by a page token. */
  pagedBars?: boolean;
  packets?: Record<string, unknown>;
  releases?: Record<string, unknown>;
  /** HTTP status for a research route request, by ticker (e.g. 503 while SEC is down). */
  failing?: Record<string, number>;
  /** Runs before each request is answered (to move the clock, for example). */
  onRequest?: (url: URL) => void;
}
type NewsRow = { headline: string; created_at: string; symbols: string[] };

function barsBody(url: URL, source: Record<string, Bar[]>, paged: boolean) {
  const symbols = url.searchParams.get('symbols')!.split(',');
  const all = Object.fromEntries(symbols.filter((s) => source[s]).map((s) => [s, source[s]]));
  if (!paged) return { bars: all, next_page_token: null };
  const second = url.searchParams.get('page_token') === 'page-2';
  const half = (rows: Bar[]) => (second ? rows.slice(Math.ceil(rows.length / 2)) : rows.slice(0, Math.ceil(rows.length / 2)));
  const bars = Object.fromEntries(Object.entries(all).map(([s, rows]) => [s, half(rows)]));
  return { bars, next_page_token: second ? null : 'page-2' };
}

function stubFetch(world: World) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    world.onRequest?.(url);
    if (url.hostname === 'paper-api.alpaca.markets' && url.pathname === '/v2/calendar') return Response.json(CALENDAR);
    if (url.hostname === 'www.alphavantage.co') return new Response(world.csv ?? AV_CSV);
    if (url.pathname === '/v2/stocks/bars') {
      const historical = url.searchParams.get('start')! < '2026-10-01' && world.history;
      return Response.json(barsBody(url, historical || world.recentBars || RECENT_BARS, world.pagedBars === true));
    }
    if (url.pathname === '/v1beta1/news') {
      return Response.json(world.newsPage?.(url) ?? { news: world.news ?? [], next_page_token: null });
    }
    const ticker = url.searchParams.get('ticker') ?? '';
    if (world.failing?.[ticker]) return Response.json({ error: 'SEC EDGAR is unavailable.' }, { status: world.failing[ticker] });
    if (url.pathname === '/api/earnings/packet' && world.packets?.[ticker]) return Response.json(world.packets[ticker]);
    if (url.pathname === '/api/earnings/releases' && world.releases?.[ticker]) return Response.json(world.releases[ticker]);
    return Response.json({ error: `unrouted ${url.href}` }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const requested = (fetch: ReturnType<typeof stubFetch>, path: string) =>
  fetch.mock.calls.map(([input]) => new URL(String(input))).filter((url) => url.pathname === path);

/** 20:30 ET on Wednesday 2026-11-11: the slate covers Thursday 2026-11-12. */
const PUBLISH_AT = new Date('2026-11-12T01:30:00.000Z');

let env: Env;
beforeEach(() => {
  env = environment();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(PUBLISH_AT);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const cscoWorld = (): World => ({ history: { CSCO: CSCO_HISTORY }, packets: { CSCO: CSCO_PACKET } });

// ---------------------------------------------------------------------------------------------

describe('cron dispatch', () => {
  it('runs publish and grade on their own crons and nothing on any other', async () => {
    const fetch = stubFetch({ ...cscoWorld(), csv: AV_CSV.split('\n')[0] });
    await worker.scheduled({ cron: PUBLISH_CRON }, env);
    await worker.scheduled({ cron: GRADE_CRON }, env);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls = fetch.mock.calls.length;
    await worker.scheduled({ cron: '30,45 1 * * MON-FRI' }, env);
    expect(fetch.mock.calls.length).toBe(calls);
    expect(error).toHaveBeenCalledWith('Unknown cron: 30,45 1 * * MON-FRI');
    const runs = rows<{ job: string; outcome: string }>(env, 'SELECT job, outcome FROM earnings_runs ORDER BY id');
    expect(runs).toEqual([
      { job: 'publish', outcome: 'published 0, skipped 0 (S1=2026-11-12)' },
      { job: 'grade', outcome: 'graded 0, void 0, pending 0' },
    ]);
  });

  it('keeps wrangler.jsonc on the same cron strings the dispatcher matches', () => {
    const config = JSON.parse(readFileSync('cloud/wrangler.jsonc', 'utf8')) as { triggers: { crons: string[] } };
    expect(config.triggers.crons).toEqual([PUBLISH_CRON, GRADE_CRON]);
  });

  it('surfaces a failed job to the scheduler after recording it', async () => {
    stubFetch({ csv: '{"Information": "rate limit"}' });
    await expect(worker.scheduled({ cron: PUBLISH_CRON }, env)).rejects.toThrow('calendar-unavailable');
    expect(rows(env, 'SELECT outcome FROM earnings_runs')).toEqual([{ outcome: 'calendar-unavailable (S1=2026-11-12)' }]);
    expect(jobFailed('published 3, skipped 1 (S1=2026-11-12); stopped: daily AI cap reached')).toBe(false);
    expect(jobFailed('published 0, skipped 0 (S1=2026-11-12); CSCO not inserted: lease lost')).toBe(true);
  });

  it('records a missing calendar key and touches nothing else', async () => {
    const fetch = stubFetch({});
    const result = await publishSlate({ ...env, ALPHAVANTAGE_API_KEY: undefined }, PUBLISH_AT);
    expect(result.outcome).toBe('calendar-key-missing');
    expect(fetch).not.toHaveBeenCalled();
    expect(rows(env, 'SELECT outcome FROM earnings_runs')).toEqual([{ outcome: 'calendar-key-missing' }]);
  });

  it('stops when Alpha Vantage answers with a throttle note instead of the CSV', async () => {
    stubFetch({ csv: '{"Information": "rate limit"}' });
    const result = await publishSlate(env, PUBLISH_AT);
    expect(result.outcome).toBe('calendar-unavailable (S1=2026-11-12)');
    expect(env.AI.run).not.toHaveBeenCalled();
  });
});

describe('modelRequest', () => {
  const reporter = { ticker: 'CSCO', name: 'Cisco Systems Inc', reportDate: '2026-11-12', timing: 'amc' as const, epsEstimate: 1.15 };
  const reaction = (session: string, movePct: number) =>
    ({ session, movePct, timing: 'amc' as const, mapping: 'accepted' as const, accession: 'a' });
  const base = { reporter, session: '2026-11-13', baseSession: '2026-11-12', refClose: 100.76, refCloseDate: '2026-11-11', docs: CSCO_DOCS };
  const withLine = {
    ...base,
    line: { value: 4.7, reactions: [reaction('2026-05-14', 13.41), reaction('2026-08-13', -8.4), reaction('2025-11-13', 4.62), reaction('2026-02-12', -12.32)] },
  };

  it('names the quarter being reported, the line and the reactions, and allows only typed figures', () => {
    const { messages, validation } = modelRequest(withLine);
    expect(messages[1].content).toContain('Reporting: the quarter after the one ended 2026-07-25 in the documents (it ends around 2026-10)');
    expect(messages[1].content).toContain('Line: 4.7% (median absolute move of the last 4 earnings reactions)');
    expect(messages[1].content).toContain('Past earnings reactions, oldest first: 2026-05-14 +13.41%');
    expect(messages[0].content).toContain('cites at least one of those reactions');
    expect(validation.line).toBe(4.7);
    // Date parts (2026, 11, 13...) are not allowed figures; the close, the line, the count and the moves are.
    expect(validation.allowedNumbers).toEqual([100.76, 4.7, 4, 13.41, 8.4, 4.62, 12.32]);
  });

  it('with no line, leaves out the reactions and tells the model not to discuss the move', () => {
    const { messages, validation } = modelRequest({ ...base, line: { value: null, reactions: [reaction('2026-08-13', -19.61)] } });
    expect(messages[1].content).toContain('Line: none');
    expect(messages[1].content).not.toContain('Past earnings reactions');
    expect(messages[1].content).not.toContain('19.61');
    expect(messages[0].content).toContain('Set move to "under" and do not discuss the size of the move');
    expect(messages[0].content).not.toContain('cites at least one of those reactions');
    expect(validation).toMatchObject({ line: null, allowedNumbers: [100.76] });
  });

  it('is prompt generation calls-v2', () => {
    expect(PROMPT_VERSION).toBe('calls-v2');
  });

  it('asks for the reasoning before the picks', () => {
    const { schema } = modelRequest(withLine);
    expect(Object.keys(schema.properties)).toEqual(['ticker', 'bull', 'bear', 'thesis', 'wrong_if', 'direction', 'move', 'confidence']);
  });

  it('adds a plain hint for each kind of failure in the retry', () => {
    const text = retryMessage(['wrong_if.restates_grading', 'bull.quote_word_count:31']);
    expect(text).toContain('That answer failed these checks: wrong_if.restates_grading, bull.quote_word_count:31.');
    expect(text).toContain('wrong_if names a business result in the coming report');
    expect(text).toContain('8 to 20 consecutive words');
  });
});

describe('publishSlate', () => {
  it('locks a validated, hashed call for the next session and reads it back', async () => {
    const fetch = stubFetch(cscoWorld());
    env.AI.run.mockResolvedValueOnce(modelReply(CSCO_ANSWER));

    const result = await publishSlate(env, PUBLISH_AT);
    expect(result.outcome).toBe('published 1, skipped 0 (S1=2026-11-12); AMAT packet: research.test returned 404');
    expect(result.published).toEqual(['CSCO']);
    expect(result.aiCalls).toBe(1);

    const [request] = env.AI.run.mock.calls[0] as [string, Record<string, unknown>];
    expect(request).toBe(MODEL);
    const input = env.AI.run.mock.calls[0][1] as { messages: { content: string }[]; chat_template_kwargs: unknown };
    expect(input.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(input.messages[1].content).toContain('Line: 6.6% (median absolute move of the last 6 earnings reactions)');
    expect(input.messages[1].content).toContain('Graded session: 2026-11-13 close versus the 2026-11-12 close');
    expect(input.messages[1].content).toContain('Company: Cisco Systems Inc (CSCO)');
    expect(input.messages[1].content).toContain('Reporting: the quarter after the one ended 2026-07-25');

    const call = (await callById(env, '2026-11-13:CSCO')) as EarningsCall;
    expect(call).toMatchObject({
      ticker: 'CSCO',
      name: 'Cisco Systems Inc',
      session: '2026-11-13',
      reportDate: '2026-11-12',
      timing: 'amc',
      publishedAt: '2026-11-12T01:30:00.000Z',
      refClose: 100.76,
      refCloseDate: '2026-11-11',
      marketCap: Math.round(3942586873 * 100.76),
      direction: 'up',
      overUnder: 'over',
      confidence: 3,
      wrongIf: CSCO_ANSWER.wrong_if,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      status: 'locked',
      grade: null,
      voidReason: null,
    });
    expect(call.line.value).toBe(6.6);
    expect(call.line.reactions.map((r) => r.movePct)).toEqual([4.85, -1.56, 4.62, -12.32, 13.41, -8.4]);
    expect(call.bull).toMatchObject({ source: 'press_release', form: '8-K EX-99.1', url: CSCO_DOCS[0].url });
    expect(call.bear).toMatchObject({ source: 'mdna', form: '10-K', filedAt: '2026-09-02T20:36:56.000Z' });

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(callHashInput(call)));
    expect(call.hash).toBe(Buffer.from(digest).toString('hex'));

    // Liquidity ranks AMAT first; ABSI never gets that far. Recent bars once, then history for CSCO only
    // (AMAT's packet failed first), ending at the last close.
    const barRequests = requested(fetch, '/v2/stocks/bars');
    expect(barRequests.map((url) => url.searchParams.get('symbols'))).toEqual(['ABSI,AMAT,CSCO', 'CSCO']);
    expect(barRequests.every((url) => url.searchParams.get('end') === '2026-11-11T21:00:00.000Z')).toBe(true);
    const lease = rows<{ name: string; token: string }>(env, 'SELECT name, token FROM earnings_lock');
    expect(lease).toEqual([{ name: 'publish', token: '' }]);
  });

  it('is idempotent: a second run neither calls the model again nor duplicates the call', async () => {
    stubFetch({ ...cscoWorld(), packets: { CSCO: CSCO_PACKET, AMAT: { ok: false, ticker: 'AMAT', reason: 'already-reported', detail: '' } } });
    env.AI.run.mockResolvedValue(modelReply(CSCO_ANSWER));
    await publishSlate(env, PUBLISH_AT);
    const second = await publishSlate(env, new Date('2026-11-12T01:45:00.000Z'));
    expect(second.outcome).toBe('published 0, skipped 0 (S1=2026-11-12)');
    expect(env.AI.run).toHaveBeenCalledTimes(1);
    expect(rows(env, 'SELECT id FROM earnings_calls')).toEqual([{ id: '2026-11-13:CSCO' }]);
    expect(rows(env, 'SELECT ticker, reason FROM earnings_skips')).toEqual([{ ticker: 'AMAT', reason: 'already-reported' }]);
  });

  it('skips a company whose results headline is already out, but not for a market wrap naming others', async () => {
    stubFetch({
      ...cscoWorld(),
      news: [
        // Real headlines; the first is CSCO's 2026-08-12 results flash, placed after this slate's last close.
        { headline: 'Cisco Systems Q4 Adj. EPS $1.22 Beats $1.17 Estimate, Sales $17.252B Beat $16.823B Estimate', created_at: '2026-11-11T22:06:59Z', symbols: ['CSCO'] },
        { headline: 'Cisco Systems, Applied Materials On Deck Thursday As AI Demand Faces Test', created_at: '2026-11-11T20:30:55Z', symbols: ['AMAT', 'CSCO'] },
      ],
      packets: { AMAT: { ok: false, ticker: 'AMAT', reason: 'no-press-release', detail: '' } },
    });
    const result = await publishSlate(env, PUBLISH_AT);
    expect(result.skipped).toEqual([
      { ticker: 'CSCO', reason: 'already-reported' },
      { ticker: 'AMAT', reason: 'no-press-release' },
    ]);
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it('retries once with the failed checks, then skips the company as model-invalid', async () => {
    stubFetch(cscoWorld());
    const paraphrased = { ...CSCO_ANSWER, bull: { ...CSCO_ANSWER.bull, quote: 'Networking orders grew 40% in the fourth quarter for an eighth straight quarter' } };
    env.AI.run.mockResolvedValue({ response: paraphrased });

    const result = await publishSlate(env, PUBLISH_AT);
    expect(env.AI.run).toHaveBeenCalledTimes(2);
    const retry = env.AI.run.mock.calls[1][1] as { messages: { role: string; content: string }[] };
    expect(retry.messages.at(-1)?.content).toContain('bull.quote_not_found_in_press_release');
    expect(retry.messages.at(-1)?.content).toContain(
      'The sentence closest to the bull quote is in press_release: "◦Networking product orders grew 40% year over year in Q4,',
    );
    expect(result.skipped).toContainEqual({ ticker: 'CSCO', reason: 'model-invalid' });
    expect(result.outcome).toContain('CSCO retried: bull.quote_not_found_in_press_release');
    expect(rows(env, 'SELECT ai_calls FROM earnings_runs')).toEqual([{ ai_calls: 2 }]);
    expect(rows(env, 'SELECT id FROM earnings_calls')).toEqual([]);
  });

  it('stops at the daily model cap without skipping anyone', async () => {
    stubFetch(cscoWorld());
    env.DB.raw.exec("INSERT INTO earnings_runs(job, started_at, ai_calls) VALUES('publish', '2026-11-12T00:00:01.000Z', 24)");
    const result = await publishSlate(env, PUBLISH_AT);
    expect(env.AI.run).not.toHaveBeenCalled();
    expect(result.outcome).toContain('stopped: daily AI cap reached');
    expect(rows(env, "SELECT ticker FROM earnings_skips WHERE ticker='CSCO'")).toEqual([]);
  });

  it('stops the run when the model call itself fails', async () => {
    stubFetch(cscoWorld());
    env.AI.run.mockRejectedValue(new Error('5006: input schema rejected'));
    const result = await publishSlate(env, PUBLISH_AT);
    expect(result.outcome).toContain('model-error: 5006: input schema rejected');
    expect(env.AI.run).toHaveBeenCalledTimes(1);
  });
});

// The real 2026-11-12 slate's top names. NBIS and NU are foreign private issuers (no 8-K Item 2.02).
const SLATE_CSV = [
  'symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay',
  'NBIS,NEBIUS GROUP NAAMLOZE VENNOOTSCHAP,2026-11-12,2026-09-30,-0.61,USD,pre-market',
  'NU,NU HOLDINGS LIMITED,2026-11-12,2026-09-30,0.22,USD,post-market',
  'AMAT,APPLIED MATERIALS INCORPORATED,2026-11-12,2026-10-31,4.06,USD,post-market',
  'CSCO,CISCO SYSTEMS INCORPORATED,2026-11-12,2026-10-31,1.15,USD,post-market',
  'CBRS,CEREBRAS SYSTEMS INCORPORATED,2026-11-12,2026-09-30,-0.13,USD,post-market',
  'TWST,TWIST BIOSCIENCE CORPORATION,2026-11-12,2026-09-30,-0.44,USD,pre-market',
  'FPS,FORGENT POWER SOLUTIONS INCORPORATED,2026-11-12,2026-09-30,0.18,USD,pre-market',
].join('\n');
const SLATE_BARS: Record<string, Bar[]> = {
  ...RECENT_BARS,
  NBIS: [bar('2026-11-09', 141.45, 19063710), bar('2026-11-10', 134, 20769542), bar('2026-11-11', 154.69, 41299569)],
  NU: [bar('2026-11-09', 12.36, 49202249), bar('2026-11-10', 12.08, 57981082), bar('2026-11-11', 12.32, 58262100)],
  CBRS: [bar('2026-11-09', 96.7, 8576797), bar('2026-11-10', 93.66, 8259971), bar('2026-11-11', 101.08, 9414541)],
  TWST: [bar('2026-11-09', 135.34, 1670436), bar('2026-11-10', 132.13, 1719553), bar('2026-11-11', 122.59, 3481201)],
  FPS: [bar('2026-11-09', 22.6, 11331090), bar('2026-11-10', 21.48, 6532675), bar('2026-11-11', 24.57, 12106880)],
};
const foreign = (ticker: string) => ({ ok: false, ticker, reason: 'not-8k-filer', detail: 'files 6-K' });
/** Every 8-K filer gets CSCO's packet, so CSCO's verbatim answer validates for any of them. */
const cscoLike = (ticker: string) => ({ ...CSCO_PACKET, ticker });
const answerFor = (_model: string, input: { messages: { content: string }[] }) =>
  modelReply({ ...CSCO_ANSWER, ticker: /\(([A-Z]+)\)/.exec(input.messages[1].content)![1] });
const slateWorld = (): World => ({
  csv: SLATE_CSV,
  recentBars: SLATE_BARS,
  history: Object.fromEntries(Object.keys(SLATE_BARS).map((t) => [t, CSCO_HISTORY])),
  packets: {
    NBIS: foreign('NBIS'), NU: foreign('NU'),
    ...Object.fromEntries(['AMAT', 'CSCO', 'CBRS', 'TWST', 'FPS'].map((t) => [t, cscoLike(t)])),
  },
});

/** A call already locked on an earlier evening (the CSCO answer, stored as publishSlate stores it). */
function lockEarlier(id: string, reportDate: string, timing: 'bmo' | 'amc') {
  const [session, ticker] = id.split(':');
  const body = { id, ticker, name: 'Cisco Systems Inc', session, reportDate, timing, publishedAt: '2026-11-10T01:30:00.000Z' };
  env.DB.raw
    .prepare('INSERT INTO earnings_calls(id, session, ticker, rank, published_at, hash, body) VALUES(?,?,?,?,?,?,?)')
    .run(id, session, ticker, 1, body.publishedAt, 'h', JSON.stringify(body));
}

describe('publishSlate: budgets and the called set', () => {
  it('spends model slots only on companies that reach the model', async () => {
    const fetch = stubFetch(slateWorld());
    env.AI.run.mockImplementation(answerFor);
    const result = await publishSlate(env, PUBLISH_AT);
    expect(result.skipped).toEqual([
      { ticker: 'NBIS', reason: 'not-8k-filer' },
      { ticker: 'NU', reason: 'not-8k-filer' },
    ]);
    expect(result.published).toEqual(['AMAT', 'CSCO', 'CBRS', 'TWST']);
    const packets = requested(fetch, '/api/earnings/packet').map((url) => url.searchParams.get('ticker'));
    expect(packets).toEqual(['NBIS', 'AMAT', 'CSCO', 'CBRS', 'NU', 'TWST']);
    expect(rows(env, "SELECT json_extract(body, '$.name') AS name FROM earnings_calls ORDER BY rank")).toEqual([
      { name: 'Applied Materials Inc' }, { name: 'Cisco Systems Inc' }, { name: 'Cerebras Systems Inc' },
      { name: 'Twist Bioscience Corporation' },
    ]);
    // The next cron minute picks up where this one stopped.
    const next = await publishSlate(env, new Date('2026-11-12T01:45:00.000Z'));
    expect(next.published).toEqual(['FPS']);
  });

  it('stops after ten packet requests in one run', async () => {
    const tickers = ['NBIS', 'NU', 'AMAT', 'CSCO', 'CBRS', 'TWST', 'FPS', 'ABSI', 'EYE', 'DLO', 'VIK', 'JD'];
    const csv = [SLATE_CSV.split('\n')[0], ...tickers.map((t) => `${t},${t} INCORPORATED,2026-11-12,2026-09-30,,USD,pre-market`)];
    const fetch = stubFetch({
      csv: csv.join('\n'),
      recentBars: Object.fromEntries(tickers.map((t) => [t, RECENT_BARS.CSCO])),
      packets: Object.fromEntries(tickers.map((t) => [t, foreign(t)])),
    });
    const result = await publishSlate(env, PUBLISH_AT);
    expect(requested(fetch, '/api/earnings/packet')).toHaveLength(10);
    expect(result.skipped).toHaveLength(10);
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it('does not call a company again when the calendar moves its locked slot to the same session', async () => {
    // Locked as 11-11 after the close (graded 11-12); the calendar now says 11-12 before the open.
    lockEarlier('2026-11-12:CSCO', '2026-11-11', 'amc');
    const csv = AV_CSV.replace('1.15,USD,post-market', '1.15,USD,pre-market');
    const fetch = stubFetch({ csv, history: { AMAT: CSCO_HISTORY }, packets: { AMAT: cscoLike('AMAT') } });
    env.AI.run.mockImplementation(answerFor);
    const result = await publishSlate(env, PUBLISH_AT);
    expect(result.published).toEqual(['AMAT']);
    expect(requested(fetch, '/api/earnings/packet').map((url) => url.searchParams.get('ticker'))).toEqual(['AMAT']);
  });

  it('does not lock a second call when the calendar delays a locked reporter by a day', async () => {
    lockEarlier('2026-11-12:CSCO', '2026-11-11', 'amc');
    stubFetch(cscoWorld());
    env.AI.run.mockImplementation(answerFor);
    await publishSlate(env, PUBLISH_AT);
    expect(rows(env, "SELECT id FROM earnings_calls WHERE ticker='CSCO'")).toEqual([{ id: '2026-11-12:CSCO' }]);
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it('retries a company later when SEC is unavailable instead of skipping it for the night', async () => {
    stubFetch({ ...cscoWorld(), failing: { CSCO: 503, AMAT: 503 } });
    const result = await publishSlate(env, PUBLISH_AT);
    expect(result.outcome).toContain('CSCO packet: research.test returned 503');
    expect(rows(env, 'SELECT * FROM earnings_skips')).toEqual([]);
  });

  it('does not count another company\'s results headline against this one', async () => {
    stubFetch({
      ...cscoWorld(),
      packets: { CSCO: CSCO_PACKET },
      news: [
        {
          headline: 'San Francisco-Based Fastly Reports Third Quarter 2026 Results',
          created_at: '2026-11-11T21:10:00Z',
          symbols: ['FSLY', 'CSCO'],
        },
      ],
    });
    env.AI.run.mockResolvedValue(modelReply(CSCO_ANSWER));
    const result = await publishSlate(env, PUBLISH_AT);
    expect(result.published).toEqual(['CSCO']);
  });

  it('reads the newest news page when the window has more than three pages', async () => {
    const filler = (i: number): NewsRow => ({
      headline: `Market wrap ${i}`,
      created_at: '2026-11-11T21:30:00Z',
      symbols: ['CSCO'],
    });
    const flash: NewsRow = {
      headline: 'Cisco Systems Q1 Adj. EPS $1.05 Beats $1.02 Estimate',
      created_at: '2026-11-12T01:20:00Z',
      symbols: ['CSCO'],
    };
    const fetch = stubFetch({
      ...cscoWorld(),
      newsPage: (url) =>
        url.searchParams.get('sort') === 'desc'
          ? { news: [flash], next_page_token: 'more' }
          : { news: Array.from({ length: 50 }, (_, i) => filler(i)), next_page_token: 'more' },
    });
    const result = await publishSlate(env, PUBLISH_AT);
    expect(requested(fetch, '/v1beta1/news').map((url) => url.searchParams.get('sort'))).toEqual(['asc', 'asc', 'asc', 'desc']);
    expect(result.skipped).toContainEqual({ ticker: 'CSCO', reason: 'already-reported' });
  });

  it('follows bar page tokens and never takes a session in progress as the last close', async () => {
    // A manual run at 14:00 ET on 11-11: the last finished session is 11-10.
    const fetch = stubFetch({ ...cscoWorld(), pagedBars: true, packets: { CSCO: CSCO_PACKET } });
    env.AI.run.mockResolvedValue(modelReply(CSCO_ANSWER));
    await publishSlate(env, new Date('2026-11-11T19:00:00.000Z'));
    const bars = requested(fetch, '/v2/stocks/bars');
    expect(bars.every((url) => url.searchParams.get('end') === '2026-11-10T21:00:00.000Z')).toBe(true);
    expect(bars.filter((url) => url.searchParams.get('page_token') === 'page-2')).toHaveLength(2);
  });

  it('skips a company after a second model error on the same evening, so it cannot block the slate', async () => {
    stubFetch(cscoWorld());
    env.AI.run.mockRejectedValue(new Error('3040: capacity'));
    await publishSlate(env, PUBLISH_AT);
    expect(rows(env, 'SELECT * FROM earnings_skips')).toEqual([]);
    await publishSlate(env, new Date('2026-11-12T01:45:00.000Z'));
    expect(rows(env, 'SELECT ticker, reason FROM earnings_skips')).toEqual([{ ticker: 'CSCO', reason: 'model-error' }]);
  });
});

describe('leases', () => {
  it('records already-running when another run holds the lease', async () => {
    const fetch = stubFetch(cscoWorld());
    env.DB.raw.prepare("INSERT INTO earnings_lock(name, token, expires) VALUES('publish', 'other', ?)").run(Date.now() + 60_000);
    expect((await publishSlate(env, PUBLISH_AT)).outcome).toBe('already-running');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('writes nothing once the lease has expired mid-run, and says so', async () => {
    stubFetch(cscoWorld());
    env.AI.run.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 11 * 60_000);
      return modelReply(CSCO_ANSWER);
    });
    const result = await publishSlate(env, PUBLISH_AT);
    expect(result.outcome).toContain('CSCO not inserted: lease lost');
    expect(result.published).toEqual([]);
    expect(jobFailed(result.outcome)).toBe(true);
    expect(rows(env, 'SELECT id FROM earnings_calls')).toEqual([]);
  });

  it('does not count grades that the fence refused', async () => {
    lock(cscoQ4Call());
    const result = await gradeAt(AFTER_SESSION, {
      releases: releasesFor(CSCO_RELEASES),
      onRequest: (url) => {
        if (url.pathname === '/v1beta1/news') vi.setSystemTime(Date.now() + 11 * 60_000);
      },
    });
    expect(result.outcome).toBe('graded 0, void 0, pending 0; CSCO grade not written: lease lost');
    expect(rows(env, 'SELECT * FROM earnings_grades')).toEqual([]);
  });
});

describe('modelJson', () => {
  it('accepts a string, a parsed object, or an OpenAI-style message', () => {
    expect(modelJson({ response: '```json\n{"a":1}\n```' })).toEqual({ a: 1 });
    expect(modelJson({ response: { a: 1 } })).toEqual({ a: 1 });
    expect(modelJson({ choices: [{ message: { content: '<think>x</think>{"a":1}' } }] })).toEqual({ a: 1 });
    expect(() => modelJson({})).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// Grading. CSCO's real fiscal Q4 2026 print: 8-K accepted 2026-08-12 20:07:06Z, a results flash on
// Alpaca news 7 seconds earlier, and a -8.40% move on 2026-08-13.

const CSCO_Q4_NEWS = [
  { headline: 'Cisco Systems Q4 Adj. EPS $1.22 Beats $1.17 Estimate, Sales $17.252B Beat $16.823B Estimate', created_at: '2026-08-12T20:06:59Z', symbols: ['CSCO'] },
  { headline: 'Cisco Systems Sees Q1 GAAP EPS $1.08-$1.10 vs $0.90 Est', created_at: '2026-08-12T20:07:31Z', symbols: ['CSCO'] },
];

function cscoQ4Call(overrides: Partial<EarningsCall> = {}): Omit<EarningsCall, 'status' | 'grade' | 'voidReason'> {
  return {
    id: '2026-08-13:CSCO',
    ticker: 'CSCO',
    name: 'CISCO SYSTEMS INCORPORATED',
    session: '2026-08-13',
    reportDate: '2026-08-12',
    timing: 'amc',
    publishedAt: '2026-08-12T01:30:00.000Z',
    hash: 'not-checked-here',
    marketCap: null,
    refClose: 120.43,
    refCloseDate: '2026-08-11',
    // Median |move| of the five prior reactions above: 4.85 → 4.9.
    line: { value: 4.9, reactions: [] },
    direction: 'down',
    overUnder: 'over',
    confidence: 3,
    thesis: CSCO_ANSWER.thesis,
    wrongIf: CSCO_ANSWER.wrong_if,
    bull: { ...CSCO_ANSWER.bull, source: 'press_release', form: '8-K EX-99.1', filedAt: '2026-05-13T20:06:53.000Z', url: index('0000858877-26-000075') },
    bear: { ...CSCO_ANSWER.bear, source: 'mdna', form: '10-Q', filedAt: '2026-05-20T20:00:00.000Z', url: index('0000858877-26-000075') },
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    ...overrides,
  } as Omit<EarningsCall, 'status' | 'grade' | 'voidReason'>;
}

function lock(call: ReturnType<typeof cscoQ4Call>, rank = 1) {
  env.DB.raw
    .prepare('INSERT INTO earnings_calls(id, session, ticker, rank, published_at, hash, body) VALUES(?,?,?,?,?,?,?)')
    .run(call.id, call.session, call.ticker, rank, call.publishedAt, call.hash, JSON.stringify(call));
}

const releasesFor = (list: EarningsRelease[]) => ({
  CSCO: { ticker: 'CSCO', cik: '0000858877', name: 'CISCO SYSTEMS, INC.', releases: list, sharesOutstanding: null, fetchedAt: '' },
});

async function gradeAt(now: string, world: World) {
  vi.setSystemTime(new Date(now));
  stubFetch({ recentBars: { CSCO: CSCO_HISTORY }, ...world });
  return gradeDue(env, new Date(now));
}

const AFTER_SESSION = '2026-08-13T22:45:00.000Z';

describe('gradeDue', () => {
  it('grades a win on both legs, dating the release from the earlier news flash', async () => {
    lock(cscoQ4Call());
    const result = await gradeAt(AFTER_SESSION, { releases: releasesFor(CSCO_RELEASES), news: CSCO_Q4_NEWS });
    expect(result.outcome).toBe('graded 1, void 0, pending 0');
    const call = (await callById(env, '2026-08-13:CSCO')) as EarningsCall;
    expect(call.status).toBe('graded');
    expect(call.grade).toEqual({
      gradedAt: AFTER_SESSION,
      releaseAt: '2026-08-12T20:06:59.000Z',
      releaseSource: 'news',
      baseDate: '2026-08-12',
      baseClose: 123.88,
      resultDate: '2026-08-13',
      resultClose: 113.47,
      movePct: -8.4,
      direction: 'win',
      overUnder: 'win',
    });
  });

  it('grades losses when the picks were the other way', async () => {
    lock(cscoQ4Call({ direction: 'up', overUnder: 'under' }));
    await gradeAt(AFTER_SESSION, { releases: releasesFor(CSCO_RELEASES) });
    const call = (await callById(env, '2026-08-13:CSCO')) as EarningsCall;
    expect(call.grade).toMatchObject({ releaseSource: '8-K', direction: 'loss', overUnder: 'loss' });
  });

  it('pushes the over/under leg when the move equals the line', async () => {
    // Real AAPL fiscal Q4 2026: 8-K at 21:30Z on 2026-11-02, -1.90% on 2026-11-03 against a 1.9 line.
    const aapl = cscoQ4Call({
      id: '2026-11-03:AAPL', ticker: 'AAPL', name: 'APPLE INCORPORATED', session: '2026-11-03', reportDate: '2026-11-02',
      publishedAt: '2026-10-31T01:30:00.000Z', refCloseDate: '2026-10-30', refClose: 344.63, line: { value: 1.9, reactions: [] },
    });
    lock(aapl);
    await gradeAt('2026-11-03T22:45:00.000Z', {
      recentBars: { AAPL: [bar('2026-10-30', 344.63, 68057076), bar('2026-11-02', 338.32, 64967561), bar('2026-11-03', 331.9, 63324019)] },
      releases: { AAPL: { ticker: 'AAPL', releases: [{ ...CSCO_RELEASES[0], accession: '0000320193-26-000024', acceptedAt: '2026-11-02T21:30:00.000Z' }] } },
    });
    const call = (await callById(env, '2026-11-03:AAPL')) as EarningsCall;
    expect(call.grade).toMatchObject({ movePct: -1.9, direction: 'win', overUnder: 'push' });
  });

  // The void cases move the release evidence or the clock away from the real print.
  const voidCases: [string, string, EarningsRelease[], string][] = [
    ['pre-release', AFTER_SESSION, [{ ...CSCO_RELEASES[0], acceptedAt: '2026-08-11T20:07:06.000Z' }], 'results before the lock'],
    ['no-release', '2026-08-14T22:45:00.000Z', CSCO_RELEASES.slice(1), 'no 8-K or headline by the next close'],
    ['intraday-release', AFTER_SESSION, [{ ...CSCO_RELEASES[0], acceptedAt: '2026-08-12T15:00:00.000Z' }], 'released mid-session'],
    [
      'session-mismatch',
      '2026-08-14T22:45:00.000Z',
      [{ ...CSCO_RELEASES[0], acceptedAt: '2026-08-13T20:07:06.000Z', reportDate: '2026-08-13' }],
      'released a day late',
    ],
  ];
  it.each(voidCases)('voids %s (%s)', async (reason, now, list) => {
    lock(cscoQ4Call());
    const result = await gradeAt(now, { releases: releasesFor(list) });
    expect(result.results).toEqual([{ id: '2026-08-13:CSCO', status: 'void', detail: reason }]);
    const call = (await callById(env, '2026-08-13:CSCO')) as EarningsCall;
    expect(call).toMatchObject({ status: 'void', voidReason: reason, grade: null });
  });

  it('voids missing-bar only after three more sessions, staying pending before that', async () => {
    lock(cscoQ4Call());
    const noResultBar = { CSCO: CSCO_HISTORY.filter((b) => !b.t.startsWith('2026-08-13')) };
    const early = await gradeAt('2026-08-17T22:45:00.000Z', { recentBars: noResultBar, releases: releasesFor(CSCO_RELEASES) });
    expect(early.outcome).toBe('graded 0, void 0, pending 1');
    const late = await gradeAt('2026-08-18T22:45:00.000Z', { recentBars: noResultBar, releases: releasesFor(CSCO_RELEASES) });
    expect(late.outcome).toBe('graded 0, void 1 (CSCO missing-bar), pending 0');
  });

  it('leaves a call pending before its session settles, and when the release source is down', async () => {
    lock(cscoQ4Call());
    const before = await gradeAt('2026-08-13T20:10:00.000Z', { releases: releasesFor(CSCO_RELEASES) });
    expect(before.outcome).toBe('graded 0, void 0, pending 1');
    const down = await gradeAt(AFTER_SESSION, {});
    expect(down.outcome).toBe('graded 0, void 0, pending 0, errors 1');
    expect(rows(env, 'SELECT * FROM earnings_grades')).toEqual([]);
    expect(rows<{ job: string }>(env, 'SELECT job FROM earnings_runs')).toHaveLength(2);
  });
});

describe('gradeDue: evidence', () => {
  it('ignores another company\'s results headline that names this one', async () => {
    lock(cscoQ4Call());
    const rival = {
      headline: 'Cisco Rival Arista Networks Reports Second Quarter 2026 Results',
      created_at: '2026-08-12T15:00:00Z',
      symbols: ['ANET', 'CSCO'],
    };
    await gradeAt(AFTER_SESSION, { releases: releasesFor(CSCO_RELEASES), news: [rival, ...CSCO_Q4_NEWS] });
    const call = (await callById(env, '2026-08-13:CSCO')) as EarningsCall;
    expect(call.grade).toMatchObject({ releaseSource: 'news', releaseAt: '2026-08-12T20:06:59.000Z', direction: 'win' });
  });

  it('reads this company\'s news only, up to the session close, until the results headline turns up', async () => {
    lock(cscoQ4Call());
    const chatter = Array.from({ length: 50 }, (_, i) => ({
      headline: `Cisco options activity ${i}`,
      created_at: '2026-08-11T14:00:00Z',
      symbols: ['CSCO'],
    }));
    const pages: Record<string, { news: NewsRow[]; next_page_token: string | null }> = {
      first: { news: chatter, next_page_token: 'second' },
      second: { news: CSCO_Q4_NEWS, next_page_token: 'third' },
    };
    const world: World = { releases: releasesFor(CSCO_RELEASES), newsPage: (url) => pages[url.searchParams.get('page_token') ?? 'first'] };
    vi.setSystemTime(new Date(AFTER_SESSION));
    const fetch = stubFetch({ recentBars: { CSCO: CSCO_HISTORY }, ...world });
    await gradeDue(env, new Date(AFTER_SESSION));
    const queries = requested(fetch, '/v1beta1/news');
    expect(queries).toHaveLength(2);
    expect(queries[0].searchParams.get('symbols')).toBe('CSCO');
    expect(queries[0].searchParams.get('end')).toBe('2026-08-13T20:00:00.000Z');
    const call = (await callById(env, '2026-08-13:CSCO')) as EarningsCall;
    expect(call.grade).toMatchObject({ releaseSource: 'news', releaseAt: '2026-08-12T20:06:59.000Z' });
  });

  it('settles a call whose releases lookup keeps failing once the no-release deadline passes', async () => {
    lock(cscoQ4Call());
    const before = await gradeAt(AFTER_SESSION, {});
    expect(before.outcome).toBe('graded 0, void 0, pending 0, errors 1');
    const after = await gradeAt('2026-08-14T22:45:00.000Z', {});
    expect(after.results).toEqual([{ id: '2026-08-13:CSCO', status: 'void', detail: 'no-release' }]);
    expect(after.outcome).toContain('CSCO settled without full evidence');
  });

  it('settles on the news when the releases lookup fails past the deadline', async () => {
    lock(cscoQ4Call());
    await gradeAt('2026-08-14T22:45:00.000Z', { news: CSCO_Q4_NEWS });
    const call = (await callById(env, '2026-08-13:CSCO')) as EarningsCall;
    expect(call.grade).toMatchObject({ releaseSource: 'news', direction: 'win' });
  });

  it('dates a late 8-K by its date of report: graded when on time, void when before the lock', async () => {
    // The 8-K went in two days after the 2026-08-12 after-close release and no headline was found.
    const late = { ...CSCO_RELEASES[0], acceptedAt: '2026-08-14T20:30:00.000Z', reportDate: '2026-08-12' };
    lock(cscoQ4Call());
    await gradeAt('2026-08-14T22:45:00.000Z', { releases: releasesFor([late]) });
    expect(await callById(env, '2026-08-13:CSCO')).toMatchObject({ status: 'graded', grade: { releaseSource: '8-K' } });

    // Same filing, but the press release went out on 08-11, the day the call was locked.
    lock(cscoQ4Call({ id: '2026-08-13:CSCX', ticker: 'CSCX' }));
    const early = { ...late, reportDate: '2026-08-11' };
    await gradeAt('2026-08-14T22:45:00.000Z', {
      recentBars: { CSCX: CSCO_HISTORY },
      releases: { CSCX: { ...releasesFor([early]).CSCO, ticker: 'CSCX' } },
    });
    expect(await callById(env, '2026-08-13:CSCX')).toMatchObject({ status: 'void', voidReason: 'pre-release' });
  });
});

describe('board, ledger and routes', () => {
  it('serves the slate, recent results and season record', async () => {
    lock(cscoQ4Call());
    await gradeAt(AFTER_SESSION, { releases: releasesFor(CSCO_RELEASES), news: CSCO_Q4_NEWS });
    lock(cscoQ4Call({ id: '2026-11-13:CSCO', session: '2026-11-13', reportDate: '2026-11-12', publishedAt: '2026-11-12T01:30:00.000Z' }));

    const now = new Date('2026-11-12T02:00:00.000Z');
    const response = await board(env, now);
    expect(response.slate.map((c) => [c.id, c.status])).toEqual([['2026-11-13:CSCO', 'locked']]);
    expect(response.recent.map((c) => [c.id, c.status])).toEqual([['2026-08-13:CSCO', 'graded']]);
    expect(response.record).toMatchObject({
      season: '2026 Q3',
      direction: { win: 1, loss: 0, push: 0, n: 1, pct: null, interval: null, base: { label: 'Always down', win: 1 } },
      overUnder: { win: 1, loss: 0, push: 0, n: 1, base: { label: 'Always over', win: 1 } },
      voids: 0,
      last: [{ id: '2026-08-13:CSCO', direction: 'win', overUnder: 'win' }],
    });
    expect(response.run.lastGradeAt).not.toBeNull();
    expect(response.run.lastPublishAt).toBeNull();

    const all = await ledger(env, now);
    expect(all.calls.map((c) => c.id)).toEqual(['2026-11-13:CSCO', '2026-08-13:CSCO']);

    const http = await worker.fetch(new Request('https://worker.test/earnings/board'), env);
    expect(http.status).toBe(200);
    expect(http.headers.get('Cache-Control')).toBe('public, max-age=30');
    const missing = await worker.fetch(new Request('https://worker.test/earnings/call?id=2026-11-13:NOPE'), env);
    expect(missing.status).toBe(404);
    const found = await worker.fetch(new Request(`https://worker.test/earnings/call?id=${encodeURIComponent('2026-08-13:CSCO')}`), env);
    expect((await found.json()).grade.movePct).toBe(-8.4);
  });

  it('serves the ledger one season at a time, with every open call', async () => {
    lock(cscoQ4Call());
    await gradeAt(AFTER_SESSION, { releases: releasesFor(CSCO_RELEASES), news: CSCO_Q4_NEWS });
    const may = { session: '2026-05-14', reportDate: '2026-05-13', publishedAt: '2026-05-13T01:30:00.000Z', refCloseDate: '2026-05-12' };
    lock(cscoQ4Call({ id: '2026-05-14:CSCO', ...may }));
    await gradeAt('2026-05-14T22:45:00.000Z', { releases: releasesFor(CSCO_RELEASES.slice(1)) });
    lock(cscoQ4Call({ id: '2026-11-13:CSCO', session: '2026-11-13', reportDate: '2026-11-12', publishedAt: '2026-11-12T01:30:00.000Z' }));

    const now = new Date('2026-11-12T02:00:00.000Z');
    const current = await ledger(env, now);
    expect(current.record.season).toBe('2026 Q3');
    expect(current.calls.map((c) => [c.id, c.status])).toEqual([['2026-11-13:CSCO', 'locked'], ['2026-08-13:CSCO', 'graded']]);
    const q2 = await ledger(env, now, '2026 Q2');
    expect(q2.calls.map((c) => c.id)).toEqual(['2026-11-13:CSCO', '2026-05-14:CSCO']);
    expect(q2.record.season).toBe('2026 Q2');

    const http = await worker.fetch(new Request('https://worker.test/earnings/ledger?season=2026%20Q2'), env);
    expect(http.headers.get('Content-Type')).toBe('application/json');
    expect(((await http.json()) as { calls: unknown[] }).calls).toHaveLength(2);
    const bad = await worker.fetch(new Request('https://worker.test/earnings/ledger?season=Q9'), env);
    expect(bad.status).toBe(400);
  });

  it('answers a public route failure without the database error text', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { ...env, DB: { ...env.DB, prepare: () => { throw new Error('no such table: earnings_calls'); } } };
    const response = await worker.fetch(new Request('https://worker.test/earnings/board'), broken);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Unavailable' });
    expect(error).toHaveBeenCalled();
  });

  it('keeps the manual runs behind the admin token', async () => {
    stubFetch({});
    const anonymous = await worker.fetch(new Request('https://worker.test/admin/earnings/grade', { method: 'POST' }), env);
    expect(anonymous.status).toBe(404);
    const admin = await worker.fetch(
      new Request('https://worker.test/admin/earnings/grade', { method: 'POST', headers: { Authorization: `Bearer ${ADMIN}` } }),
      env,
    );
    expect(await admin.json()).toEqual({ outcome: 'graded 0, void 0, pending 0', results: [] });
  });
});
