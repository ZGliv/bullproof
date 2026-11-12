import type { Direction, LegResult, OverUnder, Reaction } from "@/lib/earnings/types";
import { RESULT_LETTER } from "./format";
import s from "./marks.module.css";

const RESULT_NAME: Record<LegResult | "void", string> = { win: "Win", loss: "Loss", push: "Push", void: "Void" };

/** `null` is a leg that does not exist (no line); `"pending"` is a leg not graded yet. */
export function ResultMark({ result, leg }: { result: LegResult | "void" | "pending" | null; leg: string }) {
  if (result === "pending") return <span className={`${s.mark} ${s.pending}`} aria-label={`${leg} pending`} />;
  if (result === null) return <span className={`${s.mark} ${s.none}`} aria-label={`${leg} none`} />;
  return (
    <span
      className={`${s.mark} ${s[result]}`}
      aria-label={`${leg} ${RESULT_NAME[result]}`}
      title={`${leg} ${RESULT_NAME[result]}`}
    >
      {RESULT_LETTER[result]}
    </span>
  );
}

export function DirectionCall({ direction, large = false }: { direction: Direction; large?: boolean }) {
  return (
    <span className={`${s.direction} ${direction === "up" ? s.up : s.down} ${large ? s.large : ""}`}>
      <svg className={s.triangle} viewBox="0 0 10 9" aria-hidden="true">
        <path d={direction === "up" ? "M5 0 10 9H0Z" : "M0 0h10L5 9Z"} />
      </svg>
      {direction === "up" ? "UP" : "DOWN"}
    </span>
  );
}

export function OverUnderCall({ value, large = false }: { value: OverUnder | null; large?: boolean }) {
  return (
    <span className={`${s.overUnder} ${large ? s.large : ""} ${value ? "" : s.muted}`}>
      {value ? value.toUpperCase() : "—"}
    </span>
  );
}

export function Pips({ value }: { value: number }) {
  return (
    <span className={s.pips} role="img" aria-label={`Confidence ${value} of 5`} title={`Confidence ${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? s.pipOn : s.pip} />
      ))}
    </span>
  );
}

const STRIP = { slots: 8, pitch: 9, bar: 6, height: 24 };

/**
 * Signed bars of the last reactions, oldest on the left, with the ±line as two dotted hairlines.
 * Each strip is scaled to its own largest move or line, whichever is bigger, so every bar reads
 * against its own line.
 */
export function ReactionStrip({ reactions, line }: { reactions: Reaction[]; line: number | null }) {
  const width = STRIP.slots * STRIP.pitch - (STRIP.pitch - STRIP.bar);
  const mid = STRIP.height / 2;
  const max = Math.max(...reactions.map((r) => Math.abs(r.movePct)), line ?? 0, 0.01);
  const scale = (value: number) => (Math.abs(value) / max) * (mid - 1);
  const offset = (STRIP.slots - reactions.length) * STRIP.pitch;
  return (
    <svg
      className={s.strip}
      width={width}
      height={STRIP.height}
      viewBox={`0 0 ${width} ${STRIP.height}`}
      aria-hidden="true"
    >
      <line x1={0} x2={width} y1={mid} y2={mid} className={s.axis} />
      {line !== null
        ? [mid - scale(line), mid + scale(line)].map((y) => (
            <line key={y} x1={0} x2={width} y1={y} y2={y} className={s.lineTick} />
          ))
        : null}
      {reactions.map((r, i) => {
        const h = Math.max(1, scale(r.movePct));
        return (
          <rect
            key={r.session}
            x={offset + i * STRIP.pitch}
            width={STRIP.bar}
            y={r.movePct >= 0 ? mid - h : mid}
            height={h}
            className={r.movePct >= 0 ? s.barUp : s.barDown}
          />
        );
      })}
    </svg>
  );
}
