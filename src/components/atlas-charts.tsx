"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { scaleLinear, scaleSymlog, scaleUtc } from "d3-scale";
import { Delaunay } from "d3-delaunay";
import { line } from "d3-shape";
import type {
  CompanyResearchLive,
  FinancialQuarter,
} from "@/lib/live-research-types";
import {
  amount,
  chartPoint,
  fullDate,
  isNumber,
  metricLabels,
  numericDomain,
  percent,
  priorQuarter,
  type FinancialMetric,
} from "@/lib/research-view";
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(200, Math.round(entry.contentRect.width))),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
export function AtlasMap({
  companies,
  selected,
  onSelect,
  compressed,
}: {
  companies: CompanyResearchLive[];
  selected: string | undefined;
  onSelect: (c: CompanyResearchLive) => void;
  compressed: boolean;
}) {
  const { ref, width } = useWidth(),
    id = useId();
  const [hovered, setHovered] = useState<string | null>(null);
  const height = width < 500 ? 330 : 400,
    left = width < 500 ? 48 : 64,
    right = 24,
    top = 30,
    bottom = 46;
  const points = useMemo(
    () =>
      companies
        .map(chartPoint)
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [companies],
  );
  const x = (compressed ? scaleSymlog().constant(10) : scaleLinear())
    .domain(
      numericDomain(
        points.map((p) => p.x),
        10,
      ),
    )
    .range([left, width - right]);
  const y = (compressed ? scaleSymlog().constant(2) : scaleLinear())
    .domain(
      numericDomain(
        points.map((p) => p.y),
        2,
      ),
    )
    .range([height - bottom, top]);
  const mapped = points.map((p) => ({ ...p, cx: x(p.x), cy: y(p.y) }));
  const delaunay = Delaunay.from(
    mapped,
    (p) => p.cx,
    (p) => p.cy,
  );
  const highlighted = mapped.find(
    (p) => p.company.ticker === (hovered ?? selected),
  );
  const pick = (
    event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>,
  ) => {
    if (!mapped.length) return;
    const b = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - b.left) * width) / b.width,
      py = ((event.clientY - b.top) * height) / b.height;
    const p = mapped[delaunay.find(px, py)];
    return p && Math.hypot(p.cx - px, p.cy - py) <= 34 ? p : undefined;
  };
  return (
    <div className="r-map" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="group"
        aria-labelledby={id}
        onPointerMove={(e) => setHovered(pick(e)?.company.ticker ?? null)}
        onPointerLeave={() => setHovered(null)}
        onClick={(e) => {
          if (e.detail === 0) return;
          const p = pick(e);
          if (p) onSelect(p.company);
        }}
      >
        <title id={id}>
          Sales growth and operating margin change. Select a company to inspect
          its financial evidence. {points.length} comparable companies.
        </title>
        <text x={left} y={14}>
          Margin change (pp)
        </text>
        {x.ticks(width < 500 ? 3 : 5).map((v) => (
          <g key={`x${v}`}>
            <line
              className={v === 0 ? "r-zero" : "r-grid"}
              x1={x(v)}
              x2={x(v)}
              y1={top}
              y2={height - bottom}
            />
            <text x={x(v)} y={height - bottom + 20} textAnchor="middle">
              {percent(v)}
            </text>
          </g>
        ))}
        {y.ticks(5).map((v) => (
          <g key={`y${v}`}>
            <line
              className={v === 0 ? "r-zero" : "r-grid"}
              x1={left}
              x2={width - right}
              y1={y(v)}
              y2={y(v)}
            />
            <text x={left - 9} y={y(v) + 4} textAnchor="end">
              {percent(v, "")}
            </text>
          </g>
        ))}
        <text x={(left + width - right) / 2} y={height - 3} textAnchor="middle">
          Sales growth · year over year (%)
        </text>
        {mapped.map((p, i) => {
          const active = p.company.ticker === selected,
            hover = p.company.ticker === hovered;
          const pressure = p.y < -0.05;
          const crowded = mapped.some(
            (o, j) =>
              j < i && Math.abs(p.cx - o.cx) < 65 && Math.abs(p.cy - o.cy) < 25,
          );
          return (
            <g
              key={p.company.cik}
              className="r-point"
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`${p.company.ticker}: sales ${percent(p.x)}, margin ${percent(p.y, " points")}. Select company.`}
              data-ticker={p.company.ticker}
              onFocus={() => setHovered(p.company.ticker)}
              onBlur={() => setHovered(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(p.company);
                }
                if (
                  e.key === "ArrowRight" ||
                  e.key === "ArrowDown" ||
                  e.key === "ArrowLeft" ||
                  e.key === "ArrowUp"
                ) {
                  e.preventDefault();
                  const step =
                    e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
                  const nodes =
                    e.currentTarget.parentElement?.querySelectorAll<SVGGElement>(
                      ".r-point",
                    );
                  nodes?.[(i + step + mapped.length) % mapped.length]?.focus();
                }
              }}
            >
              <title>
                {p.company.name}: sales {percent(p.x)}, margin{" "}
                {percent(p.y, " pp")}
              </title>
              {active || hover ? (
                <circle
                  cx={p.cx}
                  cy={p.cy}
                  r={12}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1.5}
                />
              ) : null}
              {pressure ? (
                <rect
                  className="r-dot-negative"
                  x={p.cx - 5}
                  y={p.cy - 5}
                  width={10}
                  height={10}
                />
              ) : (
                <circle className="r-dot-positive" cx={p.cx} cy={p.cy} r={5} />
              )}
              <circle cx={p.cx} cy={p.cy} r={19} fill="transparent" />
              {(!crowded && mapped.length <= 18) || active || hover ? (
                <text
                  className="r-dot-label"
                  x={p.cx > width - 90 ? p.cx - 12 : p.cx + 12}
                  y={p.cy + 4}
                  textAnchor={p.cx > width - 90 ? "end" : "start"}
                >
                  {p.company.ticker}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="r-map-readout" aria-live="off">
        {highlighted ? (
          <>
            <strong>{highlighted.company.ticker}</strong>
            <span>Sales {percent(highlighted.x)}</span>
            <span>Margin {percent(highlighted.y, " pp")}</span>
          </>
        ) : (
          <span>Hover, tap, or use arrow keys to explore the companies.</span>
        )}
      </div>
      <div className="r-map-legend">
        <span>
          <i className="r-circle" /> Margin stable / expanding
        </span>
        <span>
          <i className="r-square" /> Margin contracting
        </span>
        <span>
          {compressed
            ? "Symmetric log scale · non-linear distances"
            : "Linear scale · all plotted values included"}
        </span>
      </div>
      {companies.length > points.length ? (
        <p className="r-chart-note">
          {companies.length - points.length}{" "}
          {companies.length - points.length === 1
            ? "company lacks"
            : "companies lack"}{" "}
          a comparable coordinate. Still available in the table.
        </p>
      ) : null}
      {!points.length ? (
        <p className="r-chart-note">
          No companies with both comparable sales growth and margin change in
          this selection.
        </p>
      ) : null}
    </div>
  );
}
export function GrowthRanking({
  companies,
  selected,
  onSelect,
}: {
  companies: CompanyResearchLive[];
  selected: string | undefined;
  onSelect: (c: CompanyResearchLive) => void;
}) {
  const { ref, width } = useWidth();
  const rows = companies
    .filter((c) => isNumber(c.signals[0]?.revenueGrowth))
    .sort((a, b) => b.signals[0].revenueGrowth! - a.signals[0].revenueGrowth!);
  const x = scaleLinear()
    .domain(
      numericDomain(
        rows.map((c) => c.signals[0].revenueGrowth),
        10,
      ),
    )
    .range([76, width - 70]);
  const h = Math.max(130, rows.length * 42 + 38);
  return (
    <div ref={ref} className="r-rank">
      <svg
        viewBox={`0 0 ${width} ${h}`}
        height={h}
        role="group"
        aria-label="Companies ranked by reported year-over-year sales growth"
      >
        <line className="r-zero" x1={x(0)} x2={x(0)} y1={12} y2={h - 30} />
        {rows.map((c, i) => {
          const v = c.signals[0].revenueGrowth!,
            cy = 25 + i * 42;
          return (
            <g
              key={c.cik}
              role="button"
              tabIndex={0}
              className="r-rank-row"
              aria-pressed={selected === c.ticker}
              aria-label={`${c.ticker}, sales growth ${percent(v)}`}
              onClick={() => onSelect(c)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(c);
                }
              }}
            >
              <rect
                x={0}
                y={cy - 19}
                width={width}
                height={38}
                fill={selected === c.ticker ? "var(--subtle)" : "transparent"}
              />
              <text x={0} y={cy + 4} className="r-dot-label">
                {c.ticker}
              </text>
              <rect
                x={Math.min(x(0), x(v))}
                y={cy - 5}
                width={Math.max(1, Math.abs(x(v) - x(0)))}
                height={10}
                fill={v < 0 ? "var(--negative)" : "var(--accent)"}
              />
              <text
                x={width - 4}
                y={cy + 4}
                textAnchor="end"
                className="r-dot-label"
              >
                {percent(v)}
              </text>
            </g>
          );
        })}
        {x.ticks(width < 450 ? 3 : 5).map((v) => (
          <text key={v} x={x(v)} y={h - 8} textAnchor="middle">
            {percent(v)}
          </text>
        ))}
      </svg>
      <p className="r-chart-note">
        Sales growth, same fiscal quarter year over year. Unavailable
        comparisons excluded.
      </p>
    </div>
  );
}
export function QuarterHistory({
  quarters,
  field,
  activeEnd,
  onInspect,
  small = false,
}: {
  quarters: FinancialQuarter[];
  field: FinancialMetric;
  activeEnd?: string;
  onInspect?: (end: string) => void;
  small?: boolean;
}) {
  const { ref, width } = useWidth(),
    id = useId();
  const [hover, setHover] = useState<string | null>(null);
  const n = quarters.length;
  const shown =
    quarters.find((q) => q.end === (hover ?? activeEnd)) ?? quarters.at(-1);
  const vals = quarters.map((q) => q[field]).filter(isNumber);
  const height = small ? 155 : 235,
    left = small ? 48 : 60,
    right = 12,
    top = 14,
    bottom = 30;
  const time = (s: string) => new Date(s + "T12:00:00Z");
  const start = quarters[0] ? time(quarters[0].end) : new Date(0),
    end = quarters.at(-1) ? time(quarters.at(-1)!.end) : new Date(86400000);
  const pad = 40 * 86400000;
  const x = scaleUtc()
    .domain([new Date(+start - pad), new Date(+end + pad)])
    .range([left, width - right]);
  const lo = Math.min(0, ...vals),
    hi = Math.max(0, ...vals);
  const y = scaleLinear()
    .domain(lo === hi ? [lo, hi + 1] : [lo, hi])
    .nice(4)
    .range([height - bottom, top]);
  const bw = Math.max(
    3,
    Math.min(32, x(new Date(+start + 75 * 86400000)) - x(start)),
  );
  const segments: FinancialQuarter[][] = [];
  for (const q of quarters) {
    const prev = segments.at(-1)?.at(-1);
    if (!isNumber(q[field])) {
      segments.push([]);
      continue;
    }
    if (!prev || Date.parse(q.end) - Date.parse(prev.end) > 125 * 86400000)
      segments.push([q]);
    else segments.at(-1)!.push(q);
  }
  const path = line<FinancialQuarter>()
    .x((q) => x(time(q.end)))
    .y((q) => y(q[field]!));
  return (
    <div ref={ref} className={`r-history ${small ? "r-history-small" : ""}`}>
      <div className="r-chart-readout">
        <strong>{amount(shown?.[field], field)}</strong>
        <span>{shown ? fullDate(shown.end) : "No reported quarters"}</span>
      </div>
      {vals.length ? (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby={id}
          onPointerMove={(e) => {
            const b = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - b.left) * width) / b.width;
            const nearest = quarters.reduce(
              (a, q) =>
                Math.abs(x(time(q.end)) - px) < Math.abs(x(time(a.end)) - px)
                  ? q
                  : a,
              quarters[0],
            );
            if (nearest) setHover(nearest.end);
          }}
          onPointerLeave={() => setHover(null)}
          onClick={() => {
            if (shown) onInspect?.(shown.end);
          }}
        >
          <title id={id}>
            {metricLabels[field]} in{" "}
            {field === "operatingMargin" ? "percent" : "USD"}.{" "}
            {quarters
              .map((q) => `${q.end}: ${amount(q[field], field)}`)
              .join("; ")}
          </title>
          {y.ticks(small ? 2 : 4).map((v) => (
            <g key={v}>
              <line
                className={v === 0 ? "r-zero" : "r-grid"}
                x1={left}
                x2={width - right}
                y1={y(v)}
                y2={y(v)}
              />
              <text x={left - 7} y={y(v) + 4} textAnchor="end">
                {amount(v, field)}
              </text>
            </g>
          ))}
          {field === "operatingMargin"
            ? segments
                .filter((s) => s.length > 1)
                .map((segment, i) => (
                  <path
                    key={i}
                    d={path(segment) ?? ""}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2}
                  />
                ))
            : null}
          {quarters.map((q) => {
            const v = q[field];
            if (!isNumber(v)) return null;
            const current = q.end === shown?.end;
            return field === "operatingMargin" ? (
              <circle
                key={q.end}
                cx={x(time(q.end))}
                cy={y(v)}
                r={current ? 5 : 3}
                fill={v < 0 ? "var(--negative)" : "var(--accent)"}
              />
            ) : (
              <rect
                key={q.end}
                x={x(time(q.end)) - bw / 2}
                y={Math.min(y(v), y(0))}
                width={bw}
                height={Math.max(1, Math.abs(y(v) - y(0)))}
                fill={v < 0 ? "var(--negative)" : "var(--accent)"}
                opacity={current ? 1 : 0.35}
                rx={1}
              />
            );
          })}
          {x.ticks(width < 350 ? 2 : 4).map((d) => (
            <text key={+d} x={x(d)} y={height - 7} textAnchor="middle">
              {d.toLocaleDateString("en-US", {
                month: "short",
                year: "2-digit",
                timeZone: "UTC",
              })}
            </text>
          ))}
        </svg>
      ) : (
        <p className="r-empty-chart">
          No supported {metricLabels[field].toLowerCase()} series. Missing
          values are not treated as zero.
        </p>
      )}
      <div className="r-chart-note">
        {n} reported quarters ·{" "}
        {field === "operatingMargin" ? "GAAP margin" : "USD · GAAP"} · calendar
        spacing preserves gaps
      </div>
      {!small && shown ? (
        <a
          className="r-chart-source"
          target="_blank"
          rel="noopener noreferrer"
          href={
            shown.sources[
              field === "operatingMargin" ? "operatingIncome" : field
            ]?.sourceUrl ?? shown.sourceUrl
          }
        >
          Source for {fullDate(shown.end)}
        </a>
      ) : null}
    </div>
  );
}
export function MarginComparison({
  quarters,
  end,
}: {
  quarters: FinancialQuarter[];
  end?: string;
}) {
  const { ref, width } = useWidth();
  const latest = quarters.find((q) => q.end === end) ?? quarters.at(-1),
    prior = priorQuarter(quarters, latest?.end);
  const a = prior?.operatingMargin,
    b = latest?.operatingMargin;
  const valid = isNumber(a) && isNumber(b);
  const x = scaleLinear()
    .domain(numericDomain([a, b], 4))
    .range([22, width - 22]);
  return (
    <div className="r-margin" ref={ref}>
      <div className="r-margin-label">
        <h3>Operating margin, one year apart</h3>
        <strong className={valid && b < a ? "negative" : "positive"}>
          {valid ? percent(b - a, " pp") : "Comparable period unavailable"}
        </strong>
      </div>
      {valid ? (
        <>
          <div className="r-margin-values">
            <span>
              <i className="r-ring" /> {fullDate(prior!.end)}{" "}
              <strong>{a.toFixed(1)}%</strong>
            </span>
            <span>
              <i className="r-circle" /> {fullDate(latest!.end)}{" "}
              <strong>{b.toFixed(1)}%</strong>
            </span>
          </div>
          <svg
            viewBox={`0 0 ${width} 63`}
            height={63}
            role="img"
            aria-label={`Operating margin changed from ${a.toFixed(1)} percent to ${b.toFixed(1)} percent.`}
          >
            <line className="r-grid" x1={22} x2={width - 22} y1={20} y2={20} />
            <line
              x1={x(a)}
              x2={x(b)}
              y1={20}
              y2={20}
              stroke={b < a ? "var(--negative)" : "var(--accent)"}
              strokeWidth={3}
            />
            <circle
              cx={x(a)}
              cy={20}
              r={5}
              fill="var(--paper)"
              stroke="var(--muted)"
              strokeWidth={1.5}
            />
            <circle
              cx={x(b)}
              cy={20}
              r={5}
              fill={b < a ? "var(--negative)" : "var(--accent)"}
            />
            {x.ticks(width < 350 ? 3 : 5).map((v) => (
              <text key={v} x={x(v)} y={50} textAnchor="middle">
                {v.toFixed(1)}%
              </text>
            ))}
          </svg>
        </>
      ) : (
        <p className="r-chart-note">
          A matching prior-year quarter with operating margin is required for
          this comparison.
        </p>
      )}
    </div>
  );
}
