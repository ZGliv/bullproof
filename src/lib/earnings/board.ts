import type { BoardResponse, EarningsCall, LedgerResponse } from "./types";

/**
 * Server-side reads of the Worker's public earnings routes.
 * Only imported by Server Components; the runner URL never reaches the browser.
 */

const TIMEOUT_MS = 8_000;
const REVALIDATE_SECONDS = 30;
const CALL_ID = /^\d{4}-\d{2}-\d{2}:[A-Z]{1,5}$/;

function runnerBase(): URL | null {
  const configured = process.env.BULLPROOF_RUNNER_URL;
  if (!configured) return null;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const hosted = url.protocol === "https:" && url.hostname.endsWith(".workers.dev");
  const local =
    process.env.NODE_ENV !== "production" &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  return hosted || local ? url : null;
}

async function getJson<T>(path: string): Promise<{ status: number; data: T | null } | null> {
  const base = runnerBase();
  if (!base) return null;
  try {
    const response = await fetch(new URL(path, base), {
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return { status: response.status, data: null };
    return { status: response.status, data: (await response.json()) as T };
  } catch {
    return null;
  }
}

export async function getBoard(): Promise<BoardResponse | null> {
  return (await getJson<BoardResponse>("/earnings/board"))?.data ?? null;
}

export async function getLedger(): Promise<LedgerResponse | null> {
  return (await getJson<LedgerResponse>("/earnings/ledger"))?.data ?? null;
}

export function isCallId(id: string): boolean {
  return CALL_ID.test(id);
}

/** The call, `"not-found"` when the Worker has no such id, or null when the Worker is unreachable. */
export async function getCall(id: string): Promise<EarningsCall | "not-found" | null> {
  if (!isCallId(id)) return "not-found";
  const result = await getJson<EarningsCall>(`/earnings/call?id=${encodeURIComponent(id)}`);
  if (!result) return null;
  if (result.status === 404) return "not-found";
  return result.data;
}
