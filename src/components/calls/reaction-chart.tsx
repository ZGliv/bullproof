import type { Reaction } from "@/lib/earnings/types";
import { sessionMonth, signed } from "./format";
import c from "./reaction-chart.module.css";

/**
 * Signed bar chart of past earnings-day reactions with the ±line as two hairlines.
 * Bars are drawn in a stretched SVG; all text is HTML positioned in percent, so labels keep their
 * real font size at any width.
 */
export function ReactionChart({ reactions, line }: { reactions: Reaction[]; line: number | null }) {
  if (reactions.length === 0) return <div className={c.empty}>—</div>;
  const peak = Math.max(...reactions.map((r) => Math.abs(r.movePct)), line ?? 0) * 1.1;
  const y = (value: number) => 50 - (value / peak) * 50;
  // Always eight slots, newest on the right, so short histories read the same way as full ones.
  const slots = Math.max(8, reactions.length);
  const slot = 100 / slots;
  const first = slots - reactions.length;
  const barWidth = Math.min(slot * 0.5, 4);
  return (
    <figure
      className={c.figure}
      aria-label={`Past earnings reactions${line === null ? "" : `, line ±${line.toFixed(1)}%`}`}
    >
      <div className={c.plot}>
        <svg className={c.svg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1={0} x2={100} y1={50} y2={50} className={c.axis} />
          {line !== null ? (
            <>
              <line x1={0} x2={100} y1={y(line)} y2={y(line)} className={c.lineMark} />
              <line x1={0} x2={100} y1={y(-line)} y2={y(-line)} className={c.lineMark} />
            </>
          ) : null}
          {reactions.map((r, i) => {
            const top = r.movePct >= 0 ? y(r.movePct) : 50;
            const height = Math.max(Math.abs(y(r.movePct) - 50), 0.4);
            return (
              <rect
                key={r.session}
                x={slot * (first + i) + (slot - barWidth) / 2}
                width={barWidth}
                y={top}
                height={height}
                className={r.movePct >= 0 ? c.up : c.down}
              />
            );
          })}
        </svg>
        {reactions.map((r, i) => (
          <span
            key={r.session}
            className={`${c.value} ${r.movePct >= 0 ? c.above : c.below}`}
            style={{ left: `${slot * (first + i + 0.5)}%`, top: `${y(r.movePct)}%` }}
          >
            {signed(r.movePct, 1)}
          </span>
        ))}
        {line !== null ? (
          <>
            <span className={c.lineLabel} style={{ top: `${y(line)}%` }}>
              +{line.toFixed(1)}
            </span>
            <span className={c.lineLabel} style={{ top: `${y(-line)}%` }}>
              {signed(-line, 1)}
            </span>
          </>
        ) : null}
      </div>
      <div className={c.ticks} aria-hidden="true">
        {Array.from({ length: first }, (_, i) => (
          <span key={`empty-${i}`} className={c.tick} />
        ))}
        {reactions.map((r) => (
          <span key={r.session} className={c.tick}>
            <span>
              {sessionMonth(r.session)}
              <span className={c.day}> {Number(r.session.slice(8, 10))}</span>
            </span>
            <span>{r.session.slice(0, 4)}</span>
          </span>
        ))}
      </div>
      <table className={c.srOnly}>
        <tbody>
          {reactions.map((r) => (
            <tr key={r.session}>
              <th scope="row">{r.session}</th>
              <td>{signed(r.movePct, 2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
