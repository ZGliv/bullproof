import Link from "next/link";
import type { EarningsCall } from "@/lib/earnings/types";
import {
  callHref,
  etClock,
  groupBySession,
  lineLabel,
  marketCap,
  movePct,
  sessionLabel,
  timingLabel,
  VOID_LABEL,
} from "./format";
import { DirectionCall, OverUnderCall, Pips, ReactionStrip, ResultMark } from "./marks";
import { StateRow } from "./shell";
import t from "./call-table.module.css";

type Mode = "slate" | "results";

export function CallTable({ calls, mode, label }: { calls: EarningsCall[]; mode: Mode; label: string }) {
  const groups = groupBySession(calls);
  return (
    <section className={t.section} aria-label={label}>
      <h2 className={t.title}>{label}</h2>
      {groups.length === 0 ? <StateRow>—</StateRow> : <HeaderRow mode={mode} />}
      {groups.map((group) => (
        <div key={group.session} className={t.group}>
          <h3 className={t.groupHead}>
            <time dateTime={group.session}>{sessionLabel(group.session)}</time>
          </h3>
          {group.calls.map((call) => (
            <CallRow key={call.id} call={call} mode={mode} />
          ))}
        </div>
      ))}
    </section>
  );
}

function HeaderRow({ mode }: { mode: Mode }) {
  return (
    <div className={`${t.row} ${t[mode]} ${t.head}`} aria-hidden="true">
      <span>Company</span>
      <span />
      <span>Time</span>
      <span className={t.num}>Mkt cap</span>
      <span className={t.num}>Line</span>
      <span>Last 8</span>
      <span>Call</span>
      <span />
      <span>Conf</span>
      {mode === "slate" ? (
        <span className={t.num}>Status</span>
      ) : (
        <>
          <span className={t.num}>Move</span>
          <span className={t.center}>Dir</span>
          <span className={t.center}>O/U</span>
        </>
      )}
    </div>
  );
}

function CallRow({ call, mode }: { call: EarningsCall; mode: Mode }) {
  return (
    <Link href={callHref(call.id)} className={`${t.row} ${t[mode]}`}>
      <span className={t.id}>
        <span className={t.ticker}>{call.ticker}</span>
        <span className={t.name}>{call.name}</span>
      </span>
      <span className={t.meta}>
        <span className={t.timing}>{timingLabel(call.timing)}</span>
        <span className={`${t.num} ${t.cap}`} title="Approximate market cap">
          {marketCap(call.marketCap)}
        </span>
        <span className={`${t.num} ${t.line}`} title="Typical earnings-day move">
          {lineLabel(call.line.value)}
        </span>
        <span className={t.strip}>
          <ReactionStrip reactions={call.line.reactions} />
        </span>
      </span>
      <span className={t.call}>
        <DirectionCall direction={call.direction} />
        <OverUnderCall value={call.overUnder} />
        <Pips value={call.confidence} />
      </span>
      {mode === "slate" ? <LockedStatus call={call} /> : <Outcome call={call} />}
    </Link>
  );
}

function LockedStatus({ call }: { call: EarningsCall }) {
  return (
    <span className={t.outcome}>
      <span className={t.status}>
        <span className={t.statusLabel}>Locked</span> {etClock(call.publishedAt)}
      </span>
    </span>
  );
}

function Outcome({ call }: { call: EarningsCall }) {
  if (call.status === "locked") {
    return (
      <span className={t.outcome}>
        <span className={`${t.num} ${t.move} ${t.pending}`}>Locked</span>
        <ResultMark result="pending" leg="Direction" />
        <ResultMark result="pending" leg="Over/under" />
      </span>
    );
  }
  if (call.status === "void") {
    return (
      <span className={t.outcome} title={call.voidReason ? VOID_LABEL[call.voidReason] : undefined}>
        <span className={`${t.num} ${t.move} ${t.pending}`}>Void</span>
        <ResultMark result="void" leg="Direction" />
        <ResultMark result={call.overUnder ? "void" : null} leg="Over/under" />
      </span>
    );
  }
  const grade = call.grade;
  return (
    <span className={t.outcome}>
      <span
        className={`${t.num} ${t.move} ${grade && grade.movePct > 0 ? t.up : grade && grade.movePct < 0 ? t.down : ""}`}
      >
        {grade ? movePct(grade.movePct) : "—"}
      </span>
      <ResultMark result={grade?.direction ?? null} leg="Direction" />
      <ResultMark result={grade?.overUnder ?? null} leg="Over/under" />
    </span>
  );
}
