export const TERMINAL_KEY = "bullproof:terminal:v1";
export type TerminalShelf = {
  version: 1;
  watchlist: string[];
  seen: string[];
  notes: Record<string, string>;
};
export const emptyTerminal: TerminalShelf = {
  version: 1,
  watchlist: [],
  seen: [],
  notes: {},
};
const validTicker = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Z][A-Z0-9.\-]{0,11}$/.test(v);
export function parseTerminal(raw: string | null): TerminalShelf {
  if (!raw) return emptyTerminal;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1) return emptyTerminal;
    const tickers = (v: unknown) =>
      Array.isArray(v) ? [...new Set(v.filter(validTicker))].slice(0, 100) : [];
    const notes: Record<string, string> = {};
    if (
      parsed.notes &&
      typeof parsed.notes === "object" &&
      !Array.isArray(parsed.notes)
    )
      for (const [key, value] of Object.entries(parsed.notes).slice(0, 100)) {
        if (validTicker(key) && typeof value === "string")
          notes[key] = value.slice(0, 5000);
      }
    return {
      version: 1,
      watchlist: tickers(parsed.watchlist),
      seen: tickers(parsed.seen),
      notes,
    };
  } catch {
    return emptyTerminal;
  }
}
