import type { Reaction, SessionDate } from "@/lib/earnings/types";
import { sessionMonth, signed } from "./format";
import c from "./reaction-chart.module.css";

const MIN_SLOTS = 8;
const PAD = 0.08;

/**
 * Vertical range of the plot in percent moves. Bars always start at zero; the range covers every
 * value plus the ±line, and is one-sided when everything sits on one side of zero.
 */
export function chartDomain(values: number[], line: number | null): { hi: number; lo: number } {
  const hi = Math.max(0, ...values, line ?? 0);
  const lo = Math.min(0, ...values, line === null ? 0 : -line);
  const pad = (hi - lo || 1) * PAD;
  return { hi: hi > 0 ? hi + pad : 0, lo: lo < 0 ? lo - pad : 0 };
}

type Bar = { session: SessionDate; movePct: number; result: boolean };

/**
 * Signed bar chart of past earnings-day reactions with the ±line as two dashed hairlines. A graded
 * call adds its own move as an outlined bar on the right. Bars are drawn in a stretched SVG; all
 * text is HTML positioned in percent, so labels keep their real font size at any width.
 */
export function ReactionChart({
  reactions,
  line,
  result = null,
}: {
  reactions: Reaction[];
  line: number | null;
  result?: { session: SessionDate; movePct: number } | null;
}) {
  if (reactions.length === 0 && !result) return <div className={c.empty}>—</div>;
  const bars: Bar[] = reactions.map((r) => ({ session: r.session, movePct: r.movePct, result: false }));
  if (result) bars.push({ ...result, result: true });
  const { hi, lo } = chartDomain(
    bars.map((bar) => bar.movePct),
    line,
  );
  const y = (value: number) => ((hi - value) / (hi - lo)) * 100;
  // At least eight history slots, newest on the right, so short histories read like full ones.
  const history = Math.max(MIN_SLOTS, reactions.length);
  const slots = history + (result ? 1 : 0);
  const slot = 100 / slots;
  const first = history - reactions.length;
  const barWidth = Math.min(slot * 0.5, 4);
  const x = (i: number) => slot * (first + i);
  return (
    <figure className={c.figure}>
      <div className={c.plot}>
        <svg className={c.svg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {line !== null ? (
            <>
              <line x1={0} x2={100} y1={y(line)} y2={y(line)} className={c.lineMark} />
              <line x1={0} x2={100} y1={y(-line)} y2={y(-line)} className={c.lineMark} />
            </>
          ) : null}
          <line x1={0} x2={100} y1={y(0)} y2={y(0)} className={c.axis} />
          {result ? (
            <line x1={x(reactions.length)} x2={x(reactions.length)} y1={0} y2={100} className={c.divider} />
          ) : null}
          {bars.map((bar, i) => {
            const top = Math.min(y(bar.movePct), y(0));
            const height = Math.max(Math.abs(y(bar.movePct) - y(0)), 0.4);
            const tone = bar.movePct >= 0 ? c.up : c.down;
            return (
              <rect
                key={bar.session}
                x={x(i) + (slot - barWidth) / 2}
                width={barWidth}
                y={top}
                height={height}
                className={bar.result ? `${tone} ${c.result}` : tone}
              />
            );
          })}
        </svg>
        {bars.map((bar, i) => (
          <span
            key={bar.session}
            aria-hidden="true"
            className={`${c.value} ${bar.movePct >= 0 ? c.above : c.below} ${bar.result ? c.resultValue : ""}`}
            style={{ left: `${x(i) + slot / 2}%`, top: `${y(bar.movePct)}%` }}
          >
            {signed(bar.movePct, bar.result ? 2 : 1)}
          </span>
        ))}
        {line !== null ? (
          <>
            <span className={c.lineLabel} style={{ top: `${y(line)}%` }} aria-hidden="true">
              +{line.toFixed(1)}
            </span>
            <span className={c.lineLabel} style={{ top: `${y(-line)}%` }} aria-hidden="true">
              {signed(-line, 1)}
            </span>
          </>
        ) : null}
      </div>
      <div className={c.ticks} aria-hidden="true">
        {Array.from({ length: first }, (_, i) => (
          <span key={`empty-${i}`} className={c.tick} />
        ))}
        {bars.map((bar) => (
          <span key={bar.session} className={bar.result ? `${c.tick} ${c.resultTick}` : c.tick}>
            <span>
              {sessionMonth(bar.session)}
              <span className={c.day}> {Number(bar.session.slice(8, 10))}</span>
            </span>
            <span>{bar.session.slice(0, 4)}</span>
          </span>
        ))}
      </div>
      <table className={c.srOnly}>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.session}>
              <th scope="row">{bar.session}</th>
              <td>{signed(bar.movePct, 2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
