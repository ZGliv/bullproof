import type { Direction, LegResult, OverUnder, Reaction } from "@/lib/earnings/types";
import { RESULT_LETTER } from "./format";
import s from "./marks.module.css";

const RESULT_NAME: Record<LegResult | "void", string> = { win: "Win", loss: "Loss", push: "Push", void: "Void" };

/** `null` is a leg that does not exist (no line); `"pending"` is a leg not graded yet. */
export function ResultMark({ result, leg }: { result: LegResult | "void" | "pending" | null; leg: string }) {
  if (result === "pending") return <span className={s.mark} aria-hidden="true" />;
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

/** Signed bars of the last reactions, oldest on the left, scaled to the largest move in the row. */
export function ReactionStrip({ reactions }: { reactions: Reaction[] }) {
  const width = 8 * 9 - 3;
  const height = 22;
  const mid = height / 2;
  const max = Math.max(...reactions.map((r) => Math.abs(r.movePct)), 0.01);
  const offset = (8 - reactions.length) * 9;
  return (
    <svg
      className={s.strip}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={reactions.length ? `Last ${reactions.length} reactions` : "No past reactions"}
    >
      <line x1={0} x2={width} y1={mid} y2={mid} className={s.axis} />
      {reactions.map((r, i) => {
        const h = Math.max(1, (Math.abs(r.movePct) / max) * (mid - 1));
        return (
          <rect
            key={r.session}
            x={offset + i * 9}
            width={6}
            y={r.movePct >= 0 ? mid - h : mid}
            height={h}
            className={r.movePct >= 0 ? s.barUp : s.barDown}
          />
        );
      })}
    </svg>
  );
}
