import { describe, expect, it } from "vitest";
import { getFallbackSnapshot } from "./fallback-data";
import { createResearchCase, isReviewDue, parseNotebook, revisionChanges, safeSourceUrl, serializeNotebook, upsertResearchCase, validateEvidence, type SourceEvidence } from "./research-notebook";

function fixture() {
  const snapshot = getFallbackSnapshot("1D");
  return createResearchCase(snapshot.winners[0], snapshot, new Date("2026-10-23T12:00:00Z"));
}

describe("research notebook", () => {
  it("retains source, timestamp, and sample provenance through a storage round trip", () => {
    const item = { ...fixture(), hypothesis: "A question", evidence: "Source notes", reviewDate: "2026-10-25" };
    expect(parseNotebook(serializeNotebook([item]))).toEqual([item]);
    expect(item.observation.isSample).toBe(true);
    expect(item.observation.marketDate).toContain("not current market data");
  });
  it("rejects corrupt and incompatible data instead of silently erasing it", () => {
    expect(parseNotebook(null)).toEqual([]);
    expect(() => parseNotebook("{bad")).toThrow();
    expect(() => parseNotebook('{"version":99,"cases":[]}')).toThrow();
    expect(() => parseNotebook('{"version":1,"cases":[{"id":"x"}]}')).toThrow();
    expect(() => parseNotebook(serializeNotebook([{ ...fixture(), observation: { ...fixture().observation, price: NaN } }]))).toThrow();
  });
  it("updates an existing case without duplicating it or changing its original observation", () => {
    const original = fixture();
    const other = { ...fixture(), id: "other" };
    const edited = { ...original, hypothesis: "Revised", createdAt: "changed", observation: { ...original.observation, price: 999 } };
    const result = upsertResearchCase([original, other], edited, original.updatedAt);
    expect(result).toHaveLength(2);
    expect(result[0].hypothesis).toBe("Revised");
    expect(result[0].observation.price).toBe(original.observation.price);
    expect(result[0].createdAt).toBe(original.createdAt);
    expect(result[1]).toEqual(other);
  });
  it("rejects a stale edit when another tab has already saved the same case", () => {
    const original = fixture();
    const newer = { ...original, hypothesis: "Another tab's work", updatedAt: "2026-10-23T13:00:00Z" };
    const staleDraft = { ...original, hypothesis: "My unsaved work" };
    expect(() => upsertResearchCase([newer], staleDraft, original.updatedAt)).toThrow("updated in another tab");
    expect(newer.hypothesis).toBe("Another tab's work");
    expect(staleDraft.hypothesis).toBe("My unsaved work");
  });
  it("finds overdue and today's reviews, excludes closed and unscheduled cases", () => {
    const item = { ...fixture(), reviewDate: "2026-10-23" };
    expect(isReviewDue(item, "2026-10-23")).toBe(true);
    expect(isReviewDue(item, "2026-10-24")).toBe(true);
    expect(isReviewDue(item, "2026-10-22")).toBe(false);
    expect(isReviewDue({ ...item, status: "closed" }, "2026-10-24")).toBe(false);
    expect(isReviewDue(fixture(), "2026-10-24")).toBe(false);
  });
  it("never turns an unsafe stored source into an executable link", () => {
    expect(safeSourceUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeSourceUrl("#methodology")).toBeUndefined();
    expect(safeSourceUrl("https://example.com/source")).toBe("https://example.com/source");
  });
});

const source: SourceEvidence = { id: "source-1", sourceTitle: "Practice source", sourceUrl: "https://example.com/release", publishedOn: "2026-10-22", claim: "A manually entered claim", excerpt: "Short source excerpt", stance: "supports" };

describe("source evidence and revision history", () => {
  it("migrates a version-one notebook without losing notes, dates, or its first observation", () => {
    const current = { ...fixture(), hypothesis: "Original explanation", evidence: "My earlier notes" };
    const legacy = Object.fromEntries(Object.entries(current).filter(([key]) => !["conclusion", "sources", "revisions"].includes(key)));
    const migrated = parseNotebook(JSON.stringify({ version: 1, cases: [legacy] }))[0];
    expect(migrated.evidence).toBe("My earlier notes");
    expect(migrated.observation).toEqual(legacy.observation);
    expect(migrated.sources).toEqual([]);
    expect(migrated.revisions).toHaveLength(1);
    expect(migrated.revisions[0].hypothesis).toBe("Original explanation");
    expect(migrated.revisions[0].savedAt).toBe(legacy.updatedAt);
    expect(parseNotebook(serializeNotebook([migrated]))).toEqual([migrated]);
  });
  it("rejects unsafe links and impossible publication dates", () => {
    expect(validateEvidence(source)).toBeNull();
    expect(validateEvidence({ ...source, sourceUrl: "javascript:alert(1)" })).toContain("http");
    expect(validateEvidence({ ...source, publishedOn: "2026-02-30" })).toContain("date");
    expect(validateEvidence({ ...source, claim: "  " })).toContain("claim");
    expect(() => parseNotebook(serializeNotebook([{ ...fixture(), sources: [{ ...source, sourceUrl: "data:text/html,hi" }] }]))).toThrow();
  });
  it("captures each meaningful revision and retains earlier source claims after edits or removal", () => {
    const first = upsertResearchCase([], { ...fixture(), hypothesis: "Original hypothesis", sources: [source] }, fixture().updatedAt)[0];
    const second = upsertResearchCase([first], { ...first, hypothesis: "Revised hypothesis", sources: [{ ...source, stance: "contradicts", claim: "Changed interpretation" }], conclusion: "Initial explanation weakened", updatedAt: "2026-10-23T13:00:00Z" }, first.updatedAt)[0];
    const third = upsertResearchCase([second], { ...second, sources: [], updatedAt: "2026-10-23T14:00:00Z" }, second.updatedAt)[0];
    expect(third.revisions).toHaveLength(3);
    expect(third.revisions[0].hypothesis).toBe("Original hypothesis");
    expect(third.revisions[0].sources[0].claim).toBe(source.claim);
    expect(third.revisions[1].sources[0].stance).toBe("contradicts");
    expect(third.revisions[2].sources).toEqual([]);
    expect(third.observation).toEqual(first.observation);
    expect(parseNotebook(serializeNotebook([third]))[0].revisions).toEqual(third.revisions);
    expect(first.revisions).toHaveLength(1);
  });
  it("does not append history or change timestamps when nothing changed", () => {
    const saved = upsertResearchCase([], fixture(), fixture().updatedAt)[0];
    const resaved = upsertResearchCase([saved], { ...saved, updatedAt: "2026-10-23T16:00:00Z" }, saved.updatedAt)[0];
    expect(resaved.revisions).toHaveLength(1);
    expect(resaved.updatedAt).toBe(saved.updatedAt);
  });
  it("ignores rewritten history from a draft and keeps revision timestamps distinct", () => {
    const saved = upsertResearchCase([], fixture(), fixture().updatedAt)[0];
    const forged = { ...saved, hypothesis: "Changed", revisions: [] };
    const result = upsertResearchCase([saved], forged, saved.updatedAt)[0];
    expect(result.revisions[0]).toEqual(saved.revisions[0]);
    expect(result.revisions).toHaveLength(2);
    expect(result.updatedAt).not.toBe(saved.updatedAt);
  });
  it("provides human-readable before-and-after changes", () => {
    const previous = { ...fixture(), sources: [source], hypothesis: "Before" };
    const revised = { ...previous, hypothesis: "After", sources: [{ ...source, stance: "contradicts" as const }], conclusion: "Needs more evidence" };
    const changes = revisionChanges(previous, revised);
    expect(changes.find((change) => change.label === "Hypothesis")).toEqual({ label: "Hypothesis", before: "Before", after: "After" });
    expect(changes.find((change) => change.label === "Source evidence")?.after).toContain("CONTRADICTS");
    expect(changes.find((change) => change.label === "Review conclusion")?.after).toBe("Needs more evidence");
  });
});
