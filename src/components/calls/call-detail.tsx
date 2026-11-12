import type { EarningsCall, EvidencePoint, Grade } from "@/lib/earnings/types";
import {
  etClock,
  etDay,
  filedDate,
  lineLabel,
  marketCap,
  movePct,
  price,
  sessionLabel,
  sessionTick,
  timingLabel,
  VOID_LABEL,
} from "./format";
import { DirectionCall, OverUnderCall, Pips, ResultMark } from "./marks";
import { ReactionChart } from "./reaction-chart";
import d from "./call-detail.module.css";

export function CallDetail({ call }: { call: EarningsCall }) {
  return (
    <article className={d.article}>
      <header className={d.head}>
        <h1 className={d.title}>
          <span className={d.ticker}>{call.ticker}</span>
          <span className={d.name}>{call.name}</span>
        </h1>
        <p className={d.meta}>
          <time dateTime={call.session}>{sessionLabel(call.session)}</time>
          <span>{timingLabel(call.timing)}</span>
          {call.marketCap === null ? null : <span title="Approximate market cap">{marketCap(call.marketCap)}</span>}
          <span>
            Locked{" "}
            <time dateTime={call.publishedAt}>
              {etDay(call.publishedAt)} {etClock(call.publishedAt)}
            </time>
          </span>
          <span title={call.hash}>#{call.hash.slice(0, 8)}</span>
        </p>
      </header>

      <Legs call={call} />
      {call.status === "graded" && call.grade ? <Result grade={call.grade} /> : null}
      {call.status === "void" && call.voidReason ? (
        <p className={d.void}>
          <span className={d.voidMark}>Void</span>
          <span>{VOID_LABEL[call.voidReason]}</span>
        </p>
      ) : null}

      <section className={d.section} aria-label="Line">
        <h2 className={d.sectionTitle}>
          Line <span className={d.sectionValue}>{lineLabel(call.line.value)}</span>
          <span className={d.sectionNote}>{call.line.reactions.length} reactions</span>
        </h2>
        <ReactionChart reactions={call.line.reactions} line={call.line.value} />
      </section>

      <section className={d.evidence} aria-label="Evidence">
        <Evidence label="Bull" point={call.bull} />
        <Evidence label="Bear" point={call.bear} />
      </section>

      <dl className={d.notes}>
        <div className={d.note}>
          <dt>Thesis</dt>
          <dd>{call.thesis}</dd>
        </div>
        <div className={d.note}>
          <dt>Wrong if</dt>
          <dd>{call.wrongIf}</dd>
        </div>
      </dl>
    </article>
  );
}

function Legs({ call }: { call: EarningsCall }) {
  const grade = call.grade;
  const isVoid = call.status === "void";
  return (
    <section className={d.legs} aria-label="Call">
      <div className={d.leg}>
        <span className={d.legLabel}>Direction</span>
        <span className={d.legValue}>
          <DirectionCall direction={call.direction} large />
          {isVoid ? (
            <ResultMark result="void" leg="Direction" />
          ) : grade ? (
            <ResultMark result={grade.direction} leg="Direction" />
          ) : null}
        </span>
      </div>
      <div className={d.leg}>
        <span className={d.legLabel}>Over/under{call.line.value === null ? "" : ` ${lineLabel(call.line.value)}`}</span>
        <span className={d.legValue}>
          <OverUnderCall value={call.overUnder} large />
          {call.overUnder === null ? null : isVoid ? (
            <ResultMark result="void" leg="Over/under" />
          ) : grade ? (
            <ResultMark result={grade.overUnder} leg="Over/under" />
          ) : null}
        </span>
      </div>
      <div className={d.leg}>
        <span className={d.legLabel}>Confidence</span>
        <span className={d.legValue}>
          <Pips value={call.confidence} />
          <span className={d.confidence}>{call.confidence}/5</span>
        </span>
      </div>
    </section>
  );
}

function Result({ grade }: { grade: Grade }) {
  const tone = grade.movePct > 0 ? d.up : grade.movePct < 0 ? d.down : "";
  return (
    <section className={d.result} aria-label="Result">
      <span className={d.resultItem}>
        <span className={d.legLabel}>Prior close {sessionTick(grade.baseDate)}</span>
        <span className={d.resultValue}>{price(grade.baseClose)}</span>
      </span>
      <span className={d.arrow} aria-hidden="true">
        →
      </span>
      <span className={d.resultItem}>
        <span className={d.legLabel}>Close {sessionTick(grade.resultDate)}</span>
        <span className={d.resultValue}>{price(grade.resultClose)}</span>
      </span>
      <span className={d.resultItem}>
        <span className={d.legLabel}>Move</span>
        <span className={`${d.resultValue} ${tone}`}>{movePct(grade.movePct)}</span>
      </span>
      {grade.releaseAt ? (
        <span className={d.resultItem}>
          <span className={d.legLabel}>Release {grade.releaseSource}</span>
          <span className={d.resultSub}>
            {etDay(grade.releaseAt)} {etClock(grade.releaseAt)}
          </span>
        </span>
      ) : null}
    </section>
  );
}

function Evidence({ label, point }: { label: string; point: EvidencePoint }) {
  return (
    <div className={d.side}>
      <h2 className={d.sideTitle}>{label}</h2>
      <p className={d.point}>{point.point}</p>
      <blockquote className={d.quote} cite={point.url}>
        <p>{point.quote}</p>
      </blockquote>
      <a className={d.source} href={point.url} target="_blank" rel="noreferrer">
        {point.form} · filed {filedDate(point.filedAt)}
      </a>
    </div>
  );
}
