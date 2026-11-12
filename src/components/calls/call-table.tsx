import Link from "next/link";
import type { EarningsCall } from "@/lib/earnings/types";
import {
  callHref,
  groupByReport,
  lineLabel,
  lockLabel,
  marketCap,
  movePct,
  price,
  sessionLabel,
  timingLabel,
} from "./format";
import { DirectionCall, OverUnderCall, Pips, ReactionStrip, ResultMark } from "./marks";
import { RowPending } from "./row-pending";
import { StateRow } from "./shell";
import t from "./call-table.module.css";

type Mode = "slate" | "results";

/**
 * Calls grouped by the day the company reports. On the slate a day's heading carries its lock
 * time when it differs from `lockedAt` (the header's), which happens once the slate spans two
 * publish nights.
 */
export function CallTable({
  calls,
  mode,
  label,
  lockedAt = null,
}: {
  calls: EarningsCall[];
  mode: Mode;
  label: string;
  lockedAt?: string | null;
}) {
  const groups = groupByReport(calls, mode === "slate" ? "asc" : "desc");
  const headerLock = lockedAt ? lockLabel([lockedAt]) : null;
  return (
    <section className={t.section} aria-label={label}>
      <h2 className={t.title}>{label}</h2>
      {groups.length === 0 ? <StateRow>—</StateRow> : <HeaderRow mode={mode} />}
      {groups.map((group) => {
        const groupLock = mode === "slate" ? lockLabel(group.calls.map((call) => call.publishedAt)) : null;
        return (
          <div key={group.reportDate} className={t.group}>
            <h3 className={t.groupHead}>
              <time dateTime={group.reportDate}>{sessionLabel(group.reportDate)}</time>
              {groupLock && groupLock !== headerLock ? (
                <span className={t.groupLock}>Locked {groupLock}</span>
              ) : null}
            </h3>
            {group.calls.map((call) => (
              <CallRow key={call.id} call={call} mode={mode} />
            ))}
          </div>
        );
      })}
    </section>
  );
}

function HeaderRow({ mode }: { mode: Mode }) {
  return (
    <div className={`${t.row} ${t.head}`} aria-hidden="true">
      <span>Company</span>
      <span />
      <span>Time</span>
      <span className={t.num}>Mkt cap</span>
      <span className={t.num}>Close</span>
      <span className={t.num}>Line</span>
      <span>Last 8</span>
      <span>Call</span>
      <span />
      <span>Conf</span>
      <span className={t.num}>{mode === "slate" ? "" : "Move"}</span>
      <span className={t.center}>Dir</span>
      <span className={t.center}>O/U</span>
    </div>
  );
}

function CallRow({ call, mode }: { call: EarningsCall; mode: Mode }) {
  return (
    <Link href={callHref(call.id)} className={t.row}>
      <RowPending />
      <span className={t.id}>
        <span className={t.ticker}>{call.ticker}</span>
        <span className={t.name}>{call.name}</span>
      </span>
      <span className={t.meta}>
        <span className={t.timing}>{timingLabel(call.timing)}</span>
        <span className={`${t.num} ${t.cap}`}>{marketCap(call.marketCap)}</span>
        <span className={`${t.num} ${t.close}`}>{price(call.refClose)}</span>
        <span className={`${t.num} ${t.line}`}>{lineLabel(call.line.value)}</span>
        <span className={t.strip}>
          <ReactionStrip reactions={call.line.reactions} line={call.line.value} />
        </span>
      </span>
      <span className={t.call}>
        <DirectionCall direction={call.direction} />
        <OverUnderCall value={call.overUnder} />
        <Pips value={call.confidence} />
      </span>
      {mode === "slate" ? <Pending call={call} /> : <Outcome call={call} />}
    </Link>
  );
}

/** Ungraded legs as empty marks; a call with no line has no over/under leg at all. */
function Pending({ call, text = "" }: { call: EarningsCall; text?: string }) {
  return (
    <span className={t.outcome}>
      <span className={`${t.num} ${t.move} ${t.pending}`}>{text}</span>
      <ResultMark result="pending" leg="Direction" />
      <ResultMark result={call.overUnder ? "pending" : null} leg="Over/under" />
    </span>
  );
}

function Outcome({ call }: { call: EarningsCall }) {
  if (call.status === "locked") return <Pending call={call} text="Locked" />;
  if (call.status === "void") {
    return (
      <span className={t.outcome}>
        <span className={`${t.num} ${t.move} ${t.pending}`}>Void</span>
        <ResultMark result="void" leg="Direction" />
        <ResultMark result={call.overUnder ? "void" : null} leg="Over/under" />
      </span>
    );
  }
  const grade = call.grade;
  const tone = grade && grade.movePct > 0 ? t.up : grade && grade.movePct < 0 ? t.down : "";
  return (
    <span className={t.outcome}>
      <span className={`${t.num} ${t.move} ${tone}`}>{grade ? movePct(grade.movePct) : "—"}</span>
      <ResultMark result={grade?.direction ?? null} leg="Direction" />
      <ResultMark result={grade?.overUnder ?? null} leg="Over/under" />
    </span>
  );
}
