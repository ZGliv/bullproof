import type { MarketSnapshot, StockMover } from "./types";

// Keep the storage key so existing notebooks migrate in place on their next save.
export const NOTEBOOK_KEY = "bullproof-research:v1";
export type CaseStatus = "investigating" | "monitoring" | "closed";
export type EvidenceStance = "supports" | "contradicts" | "unclear";
export interface SourceEvidence {
  id: string;
  sourceTitle: string;
  sourceUrl: string;
  publishedOn: string;
  claim: string;
  excerpt: string;
  stance: EvidenceStance;
}
export interface ThesisSnapshot {
  hypothesis: string;
  evidence: string;
  counterEvidence: string;
  falsifier: string;
  reviewDate: string;
  status: CaseStatus;
  conclusion: string;
  sources: SourceEvidence[];
}
export interface ThesisRevision extends ThesisSnapshot {
  id: string;
  savedAt: string;
}
export interface ResearchCase extends ThesisSnapshot {
  id: string;
  symbol: string;
  name: string;
  observation: {
    price: number;
    changePercent: number;
    volume: number;
    period: "1D" | "1W";
    marketDate: string;
    retrievedAt: string;
    sourceName: string;
    sourceUrl: string;
    isSample: boolean;
  };
  createdAt: string;
  updatedAt: string;
  revisions: ThesisRevision[];
}

export function createResearchCase(stock: StockMover, snapshot: MarketSnapshot, now = new Date()): ResearchCase {
  return {
    id: `${snapshot.sourceKind}:${stock.symbol}:${snapshot.marketDate}:${snapshot.period}`,
    symbol: stock.symbol, name: stock.name,
    observation: {
      price: stock.price, changePercent: stock.changePercent, volume: stock.volume,
      period: snapshot.period, marketDate: snapshot.marketDate, retrievedAt: snapshot.fetchedAt,
      sourceName: snapshot.sourceName, sourceUrl: snapshot.sourceUrl, isSample: snapshot.isFallback,
    },
    hypothesis: "", evidence: "", counterEvidence: "", falsifier: "", reviewDate: "",
    conclusion: "", sources: [], revisions: [],
    status: "investigating", createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const stringFields = (value: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof value[key] === "string");
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateEvidence(item: SourceEvidence): string | null {
  if (!item.sourceTitle.trim() || !item.claim.trim()) return "Add a source name and the specific claim it supports or challenges.";
  if (!safeSourceUrl(item.sourceUrl)) return "Use a complete http:// or https:// source URL.";
  if (!validDate(item.publishedOn)) return "Add the source publication date.";
  return null;
}
function isSourceEvidence(value: unknown): value is SourceEvidence {
  return isRecord(value) && stringFields(value, ["id", "sourceTitle", "sourceUrl", "publishedOn", "claim", "excerpt"])
    && ["supports", "contradicts", "unclear"].includes(String(value.stance))
    && validateEvidence(value as unknown as SourceEvidence) === null;
}
function isThesisSnapshot(value: unknown): value is ThesisSnapshot {
  return isRecord(value) && stringFields(value, ["hypothesis", "evidence", "counterEvidence", "falsifier", "reviewDate", "conclusion"])
    && ["investigating", "monitoring", "closed"].includes(String(value.status))
    && Array.isArray(value.sources) && value.sources.every(isSourceEvidence);
}
function isLegacyCase(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.observation)) return false;
  const observation = value.observation;
  return stringFields(value, ["id", "symbol", "name", "hypothesis", "evidence", "counterEvidence", "falsifier", "reviewDate", "createdAt", "updatedAt"])
    && typeof value.id === "string" && value.id.length > 0
    && ["investigating", "monitoring", "closed"].includes(String(value.status))
    && ["price", "changePercent", "volume"].every((key) => typeof observation[key] === "number" && Number.isFinite(observation[key]))
    && stringFields(observation, ["marketDate", "retrievedAt", "sourceName", "sourceUrl"])
    && ["1D", "1W"].includes(String(observation.period)) && typeof observation.isSample === "boolean";
}
export function isResearchCase(value: unknown): value is ResearchCase {
  return isLegacyCase(value) && isRecord(value) && isThesisSnapshot(value)
    && Array.isArray(value.revisions) && value.revisions.every((revision) => isThesisSnapshot(revision)
      && isRecord(revision) && stringFields(revision, ["id", "savedAt"]));
}
export function thesisSnapshot(item: ThesisSnapshot): ThesisSnapshot {
  const { hypothesis, evidence, counterEvidence, falsifier, reviewDate, status, conclusion, sources } = item;
  return { hypothesis, evidence, counterEvidence, falsifier, reviewDate, status, conclusion, sources: sources.map((source) => ({ ...source })) };
}
function revisionFor(item: ResearchCase): ThesisRevision {
  return { ...thesisSnapshot(item), id: `${item.id}:${item.updatedAt}`, savedAt: item.updatedAt };
}
export function parseNotebook(raw: string | null): ResearchCase[] {
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || !Array.isArray(parsed.cases)) throw new Error("Saved notebook could not be read. Existing data has not been replaced.");
  if (parsed.version === 2 && parsed.cases.every(isResearchCase)) return parsed.cases;
  if (parsed.version === 1 && parsed.cases.every(isLegacyCase)) {
    return parsed.cases.map((legacy) => {
      const migrated = { ...legacy, conclusion: "", sources: [], revisions: [] } as ResearchCase;
      return { ...migrated, revisions: [revisionFor(migrated)] };
    });
  }
  throw new Error("Saved notebook format could not be read. Existing data has not been replaced.");
}
export function serializeNotebook(cases: ResearchCase[]): string {
  return JSON.stringify({ version: 2, cases }, null, 2);
}
export function upsertResearchCase(cases: ResearchCase[], incoming: ResearchCase, expectedUpdatedAt: string): ResearchCase[] {
  const existing = cases.find((item) => item.id === incoming.id);
  if (existing && existing.updatedAt !== expectedUpdatedAt) {
    throw new Error("This case was updated in another tab. Your draft is still open. Copy your edits, then close and reload to review the newer saved case.");
  }
  if (existing && JSON.stringify(thesisSnapshot(existing)) === JSON.stringify(thesisSnapshot(incoming))) return cases;
  // History and the first market observation come from persisted state, never an editable draft.
  const saved: ResearchCase = existing ? { ...incoming, observation: { ...existing.observation }, createdAt: existing.createdAt,
    updatedAt: new Date(Math.max(Date.parse(incoming.updatedAt), Date.parse(existing.updatedAt) + 1)).toISOString(),
    revisions: existing.revisions.length ? existing.revisions : [revisionFor(existing)] } : { ...incoming, revisions: [] };
  saved.sources = incoming.sources.map((item) => ({ ...item }));
  saved.revisions = [...saved.revisions, revisionFor(saved)];
  return [saved, ...cases.filter((item) => item.id !== saved.id)];
}
export function revisionChanges(previous: ThesisSnapshot | undefined, current: ThesisSnapshot): Array<{ label: string; before: string; after: string }> {
  const fields = [ ["hypothesis", "Hypothesis"], ["conclusion", "Review conclusion"], ["counterEvidence", "Counterevidence & unknowns"], ["falsifier", "What would change my mind"], ["evidence", "Research notes"], ["status", "Status"], ["reviewDate", "Review date"] ] as const;
  const changes: Array<{ label: string; before: string; after: string }> = fields.filter(([key]) => previous?.[key] !== current[key] && (previous || current[key])).map(([key, label]) => ({ label, before: previous?.[key] || "Not recorded", after: current[key] || "Not recorded" }));
  const describeSources = (items: SourceEvidence[]) => items.map((item) => `${item.stance.toUpperCase()} · ${item.sourceTitle} · ${item.publishedOn}\n${item.sourceUrl}\n${item.claim}${item.excerpt ? `\nExcerpt: ${item.excerpt}` : ""}`).join("\n\n") || "No source cards";
  if (JSON.stringify(previous?.sources ?? []) !== JSON.stringify(current.sources)) changes.push({ label: "Source evidence", before: describeSources(previous?.sources ?? []), after: describeSources(current.sources) });
  return changes;
}
export function localDateKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function isReviewDue(item: ResearchCase, today = localDateKey()): boolean {
  return item.status !== "closed" && Boolean(item.reviewDate) && item.reviewDate <= today;
}
export function safeSourceUrl(value: string): string | undefined {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
}
