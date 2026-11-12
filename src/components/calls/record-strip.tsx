import Link from "next/link";
import type { LegRecord, RecordMark, SeasonRecord } from "@/lib/earnings/types";
import { callHref, recordLine, RESULT_LETTER } from "./format";
import r from "./record-strip.module.css";

const MARK_CLASS = { win: r.win, loss: r.loss, push: r.push, void: r.void } as const;

function markTitle(mark: RecordMark): string {
  const overUnder = mark.overUnder ? ` · O/U ${RESULT_LETTER[mark.overUnder]}` : "";
  return `${mark.ticker} ${mark.session} · Dir ${RESULT_LETTER[mark.direction]}${overUnder}`;
}

function Leg({ label, leg }: { label: string; leg: LegRecord }) {
  return (
    <span className={r.item}>
      <span className={r.label}>{label}</span>
      <span className={r.value}>{recordLine(leg.win, leg.loss, leg.push)}</span>
      <span className={r.label}>N</span>
      <span className={r.sub}>{leg.n}</span>
      {leg.pct !== null ? <span className={r.value}>{leg.pct.toFixed(1)}%</span> : null}
      {leg.interval ? (
        <span className={r.sub}>
          {leg.interval[0].toFixed(1)}–{leg.interval[1].toFixed(1)}
        </span>
      ) : null}
    </span>
  );
}

function Base({ leg }: { leg: LegRecord }) {
  return (
    <span className={r.item}>
      <span className={r.label}>{leg.base.label}</span>
      <span className={r.sub}>{recordLine(leg.base.win, leg.base.loss, leg.base.push)}</span>
    </span>
  );
}

export function RecordStrip({ record }: { record: SeasonRecord }) {
  // `last` is newest first; draw oldest on the left so the row reads forward in time.
  const marks = [...record.last].reverse();
  return (
    <section className={r.strip} aria-label="Season record">
      <span className={`${r.item} ${r.season}`}>{record.season}</span>
      <Leg label="Dir" leg={record.direction} />
      <Leg label="O/U" leg={record.overUnder} />
      {record.voids ? (
        <span className={r.item}>
          <span className={r.label}>Void</span>
          <span className={r.value}>{record.voids}</span>
        </span>
      ) : null}
      <Base leg={record.direction} />
      <Base leg={record.overUnder} />
      {marks.length ? (
        <span className={r.marks} aria-label="Last results">
          {marks.map((mark) => (
            // Out of the tab order: every mark repeats a row in the results table below.
            <Link
              key={mark.id}
              href={callHref(mark.id)}
              className={r.markLink}
              tabIndex={-1}
              title={markTitle(mark)}
              aria-label={markTitle(mark)}
            >
              <span className={`${r.dot} ${MARK_CLASS[mark.direction]}`} />
              <span className={`${r.dot} ${mark.overUnder ? MARK_CLASS[mark.overUnder] : r.empty}`} />
            </Link>
          ))}
        </span>
      ) : null}
    </section>
  );
}
