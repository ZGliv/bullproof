import type { LegRecord, SeasonRecord } from "@/lib/earnings/types";
import { recordLine } from "./format";
import r from "./record-table.module.css";

const LEGS: { key: "direction" | "overUnder"; label: string }[] = [
  { key: "direction", label: "Direction" },
  { key: "overUnder", label: "Over/under" },
];

export function RecordTable({ record }: { record: SeasonRecord }) {
  const showPct = LEGS.some(({ key }) => record[key].pct !== null);
  const showInterval = LEGS.some(({ key }) => record[key].interval !== null);
  return (
    <section className={r.section} aria-label="Season record">
      <div className={r.scroll}>
        <table className={r.table}>
          <thead>
            <tr>
              <th scope="col" className={r.season}>
                {record.season}
              </th>
              <th scope="col">W</th>
              <th scope="col">L</th>
              <th scope="col">P</th>
              <th scope="col">N</th>
              {showPct ? <th scope="col">Win</th> : null}
              {showInterval ? <th scope="col">95%</th> : null}
              <th scope="col" className={r.base}>
                Base
              </th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {LEGS.map(({ key, label }) => (
              <LegRow key={key} label={label} leg={record[key]} showPct={showPct} showInterval={showInterval} />
            ))}
          </tbody>
        </table>
      </div>
      <p className={r.voids}>
        <span className={r.voidLabel}>Void</span> <span className={r.voidValue}>{record.voids}</span>
      </p>
    </section>
  );
}

function LegRow({
  label,
  leg,
  showPct,
  showInterval,
}: {
  label: string;
  leg: LegRecord;
  showPct: boolean;
  showInterval: boolean;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className={r.strong}>{leg.win}</td>
      <td className={r.strong}>{leg.loss}</td>
      <td>{leg.push}</td>
      <td>{leg.n}</td>
      {showPct ? <td className={r.strong}>{leg.pct === null ? "—" : `${leg.pct.toFixed(1)}%`}</td> : null}
      {showInterval ? (
        <td>{leg.interval ? `${leg.interval[0].toFixed(1)}–${leg.interval[1].toFixed(1)}` : "—"}</td>
      ) : null}
      <td className={r.base}>{leg.base.label}</td>
      <td>{recordLine(leg.base.win, leg.base.loss, leg.base.push)}</td>
    </tr>
  );
}
