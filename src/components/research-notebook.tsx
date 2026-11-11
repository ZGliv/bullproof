"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, Download, ExternalLink, Plus, X } from "lucide-react";
import { isReviewDue, revisionChanges, safeSourceUrl, serializeNotebook, validateEvidence, type CaseStatus, type EvidenceStance, type SourceEvidence, type ResearchCase } from "@/lib/research-notebook";

const statusLabels: Record<CaseStatus, string> = { investigating: "Investigating", monitoring: "Monitoring", closed: "Closed" };

export function ResearchNotebook({ cases, onOpen, error, onTrySample }: {
  cases: ResearchCase[]; onOpen: (item: ResearchCase) => void; error: string; onTrySample: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const visible = cases.filter((item) => (filter === "all" || (filter === "due" ? isReviewDue(item) : item.status === filter))
    && `${item.symbol} ${item.name} ${item.hypothesis}`.toLowerCase().includes(query.toLowerCase()));
  function exportNotebook() {
    const url = URL.createObjectURL(new Blob([serializeNotebook(cases)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "bullproof-research.json"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section id="notebook" className="notebook-section" aria-labelledby="notebook-title">
      <div className="section-heading">
        <div><p className="section-kicker">Your research desk</p><h2 id="notebook-title">A move is the beginning.</h2>
          <p>Keep the claim, the evidence, and what would change your mind. Come back with better questions.</p></div>
        <button className="refresh-button" type="button" disabled={!cases.length} onClick={exportNotebook}><Download size={15} /> Export notebook</button>
      </div>
      <div className="notebook-toolbar">
        <label>Show <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter research cases">
          <option value="all">All cases ({cases.length})</option><option value="due">Review due ({cases.filter((item) => isReviewDue(item)).length})</option>
          <option value="investigating">Investigating</option><option value="monitoring">Monitoring</option><option value="closed">Closed</option>
        </select></label>
        <input aria-label="Search research cases" placeholder="Find a ticker or thesis" value={query} onChange={(event) => setQuery(event.target.value)} />
        <span>Saved in this browser · JSON export available</span>
      </div>
      {error && <p className="data-warning" role="alert">{error}</p>}
      {visible.length ? <div className="case-list">{visible.map((item) => (
        <button className="case-row" key={item.id} onClick={() => onOpen(item)} type="button">
          <div className="case-ticker"><strong>{item.symbol}</strong><span>{item.observation.isSample ? "Sample case" : `${item.observation.period} observation`}</span></div>
          <div className="case-summary"><strong>{item.hypothesis}</strong><span>Observed {item.observation.marketDate} · {item.sources.length} sources · {item.revisions.length} revisions</span></div>
          <div className="case-state"><span>{statusLabels[item.status]}</span><small className={isReviewDue(item) ? "review-due" : ""}>{item.reviewDate ? `${isReviewDue(item) ? "Review due" : "Review"} ${item.reviewDate}` : "No review scheduled"}</small></div>
          <ArrowRight size={17} />
        </button>
      ))}</div> : <div className="notebook-empty"><BookOpen size={27} /><div><h3>{cases.length ? "No matching cases" : "Turn your next question into a case."}</h3><p>{cases.length ? "Try a different filter or search." : "Open a company in the movers table, then choose Start research case. Your original observation stays attached, even when the market changes."}</p><div className="notebook-empty-actions"><a className="text-button" href="#movers">Explore the movers <ArrowRight size={15} /></a><button className="text-button" type="button" onClick={onTrySample}>Try a sample case <ArrowRight size={15} /></button></div></div></div>}
    </section>
  );
}

const stanceLabels: Record<EvidenceStance, string> = { supports: "Supports", contradicts: "Contradicts", unclear: "Unclear" };
const caseSections = ["Thesis", "Evidence", "Review", "History"] as const;
type CaseSection = typeof caseSections[number];
function formatSavedAt(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : value;
}

export function ResearchEditor({ initialCase, onSave, onClose }: {
  initialCase: ResearchCase; onSave: (item: ResearchCase) => string | null; onClose: () => void;
}) {
  const [draft, setDraft] = useState(initialCase);
  const [section, setSection] = useState<CaseSection>("Thesis");
  const [sourceDraft, setSourceDraft] = useState<SourceEvidence | null>(null);
  const [sourceError, setSourceError] = useState("");
  const [removedSource, setRemovedSource] = useState<SourceEvidence | null>(null);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialCase) || sourceDraft !== null;
  const sourceUrl = safeSourceUrl(draft.observation.sourceUrl);
  const counts = { supports: draft.sources.filter((item) => item.stance === "supports").length, contradicts: draft.sources.filter((item) => item.stance === "contradicts").length, unclear: draft.sources.filter((item) => item.stance === "unclear").length };
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function showSection(next: CaseSection) { setSection(next); dialogRef.current?.scrollTo({ top: 0, behavior: "instant" }); }
  function requestClose() { if (dirty) setConfirmClose(true); else onClose(); }
  function update(key: "hypothesis" | "evidence" | "counterEvidence" | "falsifier" | "reviewDate" | "conclusion", value: string) {
    setDraft((current) => ({ ...current, [key]: value })); setConfirmClose(false);
  }
  function save() {
    if (sourceDraft) { showSection("Evidence"); setSourceError("Add or cancel the source card before saving the case."); return; }
    if (!draft.hypothesis.trim()) { showSection("Thesis"); setError("Add a research question or hypothesis before saving."); return; }
    const result = onSave({ ...draft, hypothesis: draft.hypothesis.trim(), updatedAt: new Date().toISOString() });
    if (result) setError(result); else onClose();
  }
  function editSource(value: SourceEvidence) { setSourceDraft({ ...value }); setSourceError(""); setConfirmClose(false); }
  function addSource() { editSource({ id: crypto.randomUUID(), sourceTitle: "", sourceUrl: "", publishedOn: "", claim: "", excerpt: "", stance: "supports" }); }
  return <dialog ref={dialogRef} className="research-dialog research-workspace" aria-labelledby="research-title" onCancel={(event) => { event.preventDefault(); requestClose(); }} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input, textarea, select, summary, [tabindex]"))
      .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
    const first = controls[0]; const last = controls[controls.length - 1];
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  }}>
    <div className="workspace-header"><div><p className="drawer-label">Personal investigation / {draft.observation.isSample ? "Fictional practice case" : "Captured market observation"}</p><h2 id="research-title">{draft.symbol} <span>Follow the evidence.</span></h2></div><button className="icon-button" type="button" onClick={requestClose} aria-label="Close research case"><X size={19} /></button></div>
    <details className="observation-record"><summary><span><strong>${draft.observation.price.toFixed(2)}</strong> {draft.observation.changePercent > 0 ? "+" : ""}{draft.observation.changePercent.toFixed(1)}% · {draft.observation.period}</span><span>{draft.observation.isSample ? "Illustrative sample · not market evidence" : "Original observation · not a current quote"}</span></summary>
      <p>Observed: {draft.observation.marketDate}<br />Source: {draft.observation.sourceName}<br />Retrieved: {draft.observation.retrievedAt}</p>{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">Provider documentation ↗</a>}<p>This observation stays unchanged through every revision. Price and volume alone do not establish a catalyst.</p>
    </details>
    <nav className="case-tabs" aria-label="Case sections">{caseSections.map((tab) => <button key={tab} type="button" aria-pressed={section === tab} onClick={() => showSection(tab)}>{tab}{tab === "Evidence" && <span>{draft.sources.length}</span>}{tab === "History" && <span>{draft.revisions.length}</span>}</button>)}</nav>
    <div className="case-content">
      {section === "Thesis" && <section aria-labelledby="thesis-section-title">
        <div className="case-section-heading"><div><p className="section-kicker">The working explanation</p><h3 id="thesis-section-title">Make a claim you can challenge.</h3></div><button className="evidence-jump" type="button" onClick={() => showSection("Evidence")}>{draft.sources.length} source cards <ArrowRight size={14} /></button></div>
        <label className="research-field"><span>Your question or hypothesis <small>Required</small></span><textarea maxLength={4000} rows={3} value={draft.hypothesis} onChange={(event) => update("hypothesis", event.target.value)} placeholder="What could explain this move? Phrase it as a claim you can investigate." /></label>
        <label className="research-field"><span>Counterevidence & unknowns</span><textarea maxLength={8000} rows={3} value={draft.counterEvidence} onChange={(event) => update("counterEvidence", event.target.value)} placeholder="What contradicts the story? What have you not checked yet?" /></label>
        <label className="research-field"><span>What would change your mind?</span><textarea maxLength={4000} rows={2} value={draft.falsifier} onChange={(event) => update("falsifier", event.target.value)} placeholder="Name an observable result that would make this explanation fail." /></label>
        <div className="research-next"><span>Revisiting this case?</span><button type="button" className="evidence-jump" onClick={() => showSection("Review")}>Record what changed <ArrowRight size={14} /></button></div>
      </section>}
      {section === "Evidence" && <section aria-labelledby="evidence-section-title">
        <div className="case-section-heading"><div><p className="section-kicker">The evidence board</p><h3 id="evidence-section-title">Separate the source from the story.</h3></div><button type="button" className="research-save" onClick={addSource} disabled={sourceDraft !== null}><Plus size={16} /> Add source</button></div>
        <p className="research-local-note">Your source notes and interpretations. Bullproof does not fetch or verify the linked page. {draft.observation.isSample && "This is a fictional practice case; source cards do not make its market observation real."}</p>
        <div className="evidence-balance" aria-label="Evidence balance">{Object.entries(counts).map(([key, count]) => <span key={key} className={`stance-${key}`}><strong>{count}</strong> {stanceLabels[key as EvidenceStance]}</span>)}<small>Counts, not confidence scores</small></div>
        {sourceDraft && <form className="source-composer" onSubmit={(event) => {
          event.preventDefault(); const problem = validateEvidence(sourceDraft); if (problem) { setSourceError(problem); return; }
          const clean = { ...sourceDraft, sourceTitle: sourceDraft.sourceTitle.trim(), sourceUrl: sourceDraft.sourceUrl.trim(), claim: sourceDraft.claim.trim() };
          setDraft((current) => ({ ...current, sources: current.sources.some((item) => item.id === clean.id) ? current.sources.map((item) => item.id === clean.id ? clean : item) : [...current.sources, clean] }));
          setSourceDraft(null); setSourceError("");
        }} noValidate>
          <h4>{draft.sources.some((item) => item.id === sourceDraft.id) ? "Edit source card" : "New source card"}</h4>
          <div className="source-form-row"><label>Source name<input value={sourceDraft.sourceTitle} maxLength={300} onChange={(event) => setSourceDraft({ ...sourceDraft, sourceTitle: event.target.value })} placeholder="Company filing, release, or research source" /></label><label>Published on<input type="date" value={sourceDraft.publishedOn} onChange={(event) => setSourceDraft({ ...sourceDraft, publishedOn: event.target.value })} /></label></div>
          <label>Source URL<input type="url" value={sourceDraft.sourceUrl} maxLength={2000} onChange={(event) => setSourceDraft({ ...sourceDraft, sourceUrl: event.target.value })} placeholder="https://…" /></label>
          <label>Specific claim<textarea rows={2} maxLength={4000} value={sourceDraft.claim} onChange={(event) => setSourceDraft({ ...sourceDraft, claim: event.target.value })} placeholder="What does this source actually establish? Keep your interpretation specific." /></label>
          <label>Excerpt (optional)<textarea rows={2} maxLength={4000} value={sourceDraft.excerpt} onChange={(event) => setSourceDraft({ ...sourceDraft, excerpt: event.target.value })} placeholder="A short passage you copied from the source. Not fetched or checked by Bullproof." /></label>
          <label>Relationship to thesis<select value={sourceDraft.stance} onChange={(event) => setSourceDraft({ ...sourceDraft, stance: event.target.value as EvidenceStance })}>{Object.entries(stanceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {sourceError && <p role="alert" className="source-error">{sourceError}</p>}
          <div className="source-form-actions"><button type="button" className="outline-button" onClick={() => { setSourceDraft(null); setSourceError(""); }}>Cancel source edit</button><button type="submit" className="research-save">Add to case <ArrowRight size={15} /></button></div>
        </form>}
        {!draft.sources.length && !sourceDraft && <div className="source-empty"><BookOpen size={24} /><h4>No source cards yet.</h4><p>Add the original source, publication date, and a specific claim. Mark whether it supports or challenges your thesis.</p></div>}
        <div className="source-board">{draft.sources.map((item) => <article className="source-card" key={item.id}>
          <div className="source-card-meta"><span className={`evidence-stance stance-${item.stance}`}>{stanceLabels[item.stance]}</span><time dateTime={item.publishedOn}>{item.publishedOn}</time></div>
          <h4><a href={safeSourceUrl(item.sourceUrl)} target="_blank" rel="noreferrer">{item.sourceTitle} <ExternalLink size={14} /></a></h4><p className="source-claim">{item.claim}</p>
          {item.excerpt && <blockquote>{item.excerpt}<cite>Your excerpt · not verified</cite></blockquote>}
          <div className="source-card-actions"><span>{new URL(item.sourceUrl).hostname}</span><button type="button" disabled={sourceDraft !== null} onClick={() => editSource(item)}>Edit</button><button type="button" disabled={sourceDraft !== null} onClick={() => { setRemovedSource(item); setDraft((current) => ({ ...current, sources: current.sources.filter((source) => source.id !== item.id) })); }}>Remove</button></div>
        </article>)}</div>
        {removedSource && <div className="source-undo" role="status"><span>Source removed from this draft. Saved history keeps earlier versions.</span><button type="button" onClick={() => { setDraft((current) => ({ ...current, sources: [...current.sources, removedSource] })); setRemovedSource(null); }}>Undo</button></div>}
        <details className="legacy-notes"><summary>Research notes {draft.evidence ? "· existing notes preserved" : "· optional"}</summary><label className="research-field"><span>Evidence and source notes</span><textarea maxLength={12000} rows={4} value={draft.evidence} onChange={(event) => update("evidence", event.target.value)} placeholder="Additional context or earlier free-form notes. Add source cards above for attributable claims." /></label></details>
      </section>}
      {section === "Review" && <section aria-labelledby="review-section-title">
        <div className="case-section-heading"><div><p className="section-kicker">Close the research loop</p><h3 id="review-section-title">What do you think now?</h3></div></div>
        <div className="review-thesis"><span>Your current hypothesis</span><p>{draft.hypothesis || "Write your initial hypothesis in the Thesis section."}</p></div>
        <label className="research-field"><span>Review conclusion</span><textarea maxLength={8000} rows={5} value={draft.conclusion} onChange={(event) => update("conclusion", event.target.value)} placeholder="What changed after reviewing the evidence? Was the hypothesis supported, weakened, or still unresolved? Name the sources that changed your thinking." /></label>
        <div className="research-controls"><label>Review on<input type="date" value={draft.reviewDate} onChange={(event) => update("reviewDate", event.target.value)} /></label><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as CaseStatus })}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
        <p className="research-local-note">Each changed save creates a dated revision. Earlier hypotheses, source cards, and conclusions remain in History. Review dates are an in-app queue, not notifications.</p>
      </section>}
      {section === "History" && <section aria-labelledby="history-section-title"><div className="case-section-heading"><div><p className="section-kicker">Your thinking over time</p><h3 id="history-section-title">Keep the reasoning, not just the answer.</h3></div></div><p className="research-local-note">Saved revisions are read-only in the app. Every comparison is against the preceding saved revision. Your original market observation remains unchanged.</p>
        {!draft.revisions.length && <div className="source-empty"><BookOpen size={24} /><h4>Your first save starts the timeline.</h4><p>Add a hypothesis and save this case. Future changes will appear here with before-and-after comparisons.</p></div>}
        <div className="revision-timeline">{draft.revisions.map((revision, index) => ({ revision, index })).reverse().map(({ revision, index }) => <details className="revision-entry" key={revision.id}>
          <summary><span className="revision-number">{String(index + 1).padStart(2, "0")}</span><span><strong>{index === 0 ? "Initial research record" : revision.conclusion !== draft.revisions[index - 1].conclusion ? "Review conclusion updated" : "Research revised"}</strong><time dateTime={revision.savedAt}>{formatSavedAt(revision.savedAt)}</time></span><span className="revision-status">{statusLabels[revision.status]}</span></summary>
          <div className="revision-diff">{revisionChanges(draft.revisions[index - 1], revision).map((change) => <div className="revision-change" key={change.label}><h4>{change.label}</h4><div className="revision-comparison"><div><span>Before</span><p>{change.before}</p></div><div><span>{index === 0 ? "Initial record" : "After"}</span><p>{change.after}</p></div></div></div>)}</div>
        </details>)}</div>
      </section>}
    </div>
    <div className="workspace-footer">{error && <p className="data-warning" role="alert">{error}</p>}{confirmClose && <div className="discard-confirm" role="alert"><span>You have unsaved edits.</span><button type="button" onClick={() => setConfirmClose(false)}>Keep editing</button><button type="button" onClick={onClose}>Discard edits</button></div>}
      <div className="research-actions"><span>{sourceDraft ? "Finish the source card before saving" : dirty ? "Unsaved changes · save creates a revision" : `${draft.revisions.length} saved revisions · browser only`}</span><button type="button" onClick={save} className="research-save">Save research case <ArrowRight size={16} /></button></div></div>
  </dialog>;
}
