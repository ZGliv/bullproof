export const SHELF_KEY = "bullproof:discovery-shelf:v1";
export type ShelfEntry = { saved: boolean; following: boolean; note: string; verdict: "interesting" | "pass" | null };
export type Shelf = Record<string, ShelfEntry>;
export const emptyEntry: ShelfEntry = { saved: false, following: false, note: "", verdict: null };
export function parseShelf(raw: string | null): Shelf {
  try {
    const value = JSON.parse(raw || "{}");
    if (value.version !== 1 || !value.entries || typeof value.entries !== "object" || Array.isArray(value.entries)) return {};
    const result: Shelf = {};
    for (const [key, v] of Object.entries(value.entries).slice(0, 200)) {
      if (!/^[a-z0-9-]{1,60}$/.test(key) || !v || typeof v !== "object") continue;
      const entry = v as Record<string, unknown>;
      result[key] = { saved: entry.saved === true || entry.following === true, following: entry.following === true, note: typeof entry.note === "string" ? entry.note.slice(0, 4000) : "", verdict: entry.verdict === "interesting" || entry.verdict === "pass" ? entry.verdict : null };
    }
    return result;
  } catch { return {}; }
}
export function encodeShelf(entries: Shelf) { return JSON.stringify({ version: 1, entries }); }
