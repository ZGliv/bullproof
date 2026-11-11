"use client";
import { useId, useState } from "react";
import type { FinancialQuarter } from "@/lib/live-research-types";
export type FinancialKey =
  | "revenue"
  | "operatingIncome"
  | "netIncome"
  | "operatingMargin";
export const financialLabels: Record<FinancialKey, string> = {
  revenue: "Revenue",
  operatingIncome: "Operating income",
  netIncome: "Net income",
  operatingMargin: "Operating margin",
};
export function compactMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const n = Math.abs(value);
  const unit = n >= 1e9 ? "B" : n >= 1e6 ? "M" : n >= 1e3 ? "K" : "";
  const divisor = n >= 1e9 ? 1e9 : n >= 1e6 ? 1e6 : n >= 1e3 ? 1e3 : 1;
  return `${value < 0 ? "−" : ""}$${(n / divisor).toLocaleString("en-US", { maximumFractionDigits: n / divisor < 10 ? 2 : 1 })}${unit}`;
}
export function changeLabel(value: number | null, suffix = "%") {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${Math.abs(value) >= 0.05 && value > 0 ? "+" : ""}${(Math.abs(value) < 0.05 ? 0 : value).toFixed(1)}${suffix}`;
}
export function shortDate(value: string) {
  const date = new Date(value + "T12:00:00Z");
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(date);
}
export function quarterLabel(value: string) {
  const date = new Date(value + "T12:00:00Z");
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(date);
}
export function RevenueSpark({ quarters }: { quarters: FinancialQuarter[] }) {
  const id = useId();
  const values = quarters
    .map((q) => q.revenue)
    .filter((v): v is number => v !== null);
  if (values.length < 2)
    return <span className="t-no-spark">Limited history</span>;
  const min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1;
  const d = quarters
    .map((q, i) => {
      if (q.revenue === null) {
        return "";
      }
      const x = 2 + (i / Math.max(quarters.length - 1, 1)) * 88;
      const y = 27 - ((q.revenue - min) / range) * 23;
      const part = `${i > 0 && quarters[i - 1].revenue !== null ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
      return part;
    })
    .join(" ");
  return (
    <svg
      className="t-spark"
      viewBox="0 0 92 32"
      role="img"
      aria-labelledby={id}
    >
      <title id={id}>
        Reported revenue:{" "}
        {quarters
          .map((q) => `${quarterLabel(q.end)} ${compactMoney(q.revenue)}`)
          .join(", ")}
      </title>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
export function QuarterChart({
  quarters,
  field,
}: {
  quarters: FinancialQuarter[];
  field: FinancialKey;
}) {
  const id = useId();
  const [focus, setFocus] = useState<number | null>(null);
  const values = quarters
    .map((q) => q[field])
    .filter((v): v is number => v !== null);
  if (!values.length)
    return (
      <div className="t-chart-unavailable">
        No comparable standalone-quarter {financialLabels[field].toLowerCase()}{" "}
        series was reported using a supported tag.
      </div>
    );
  const max = Math.max(...values, 0),
    min = Math.min(...values, 0),
    range = max - min || 1;
  const y = (v: number) => 160 - ((v - min) / range) * 125;
  const n = quarters.length;
  const width = Math.min(40, 270 / n);
  const selected = quarters[focus ?? n - 1];
  const format = (v: number | null) =>
    field === "operatingMargin"
      ? v === null
        ? "—"
        : v.toFixed(1) + "%"
      : compactMoney(v);
  return (
    <div className="t-quarter-chart">
      <div className="t-chart-readout">
        <strong>{format(selected[field])}</strong>
        <span>
          Quarter ended {shortDate(selected.end)}, {selected.end.slice(0, 4)}
        </span>
      </div>
      <svg viewBox="0 0 380 205" role="img" aria-labelledby={id}>
        <title id={id}>
          {financialLabels[field]}.{" "}
          {quarters.map((q) => `${q.end}: ${format(q[field])}`).join("; ")}
        </title>
        {[min, (min + max) / 2, max]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((v) => (
            <g key={v}>
              <line
                x1="47"
                x2="377"
                y1={y(v)}
                y2={y(v)}
                className="t-chart-grid"
              />
              <text
                x="41"
                y={y(v) + 3}
                textAnchor="end"
                className="t-chart-axis"
              >
                {format(v)}
              </text>
            </g>
          ))}
        {quarters.map((q, i) => {
          const x = 47 + ((i + 0.5) * 330) / n;
          const v = q[field];
          return (
            <g
              key={q.end}
              onMouseEnter={() => setFocus(i)}
              onMouseLeave={() => setFocus(null)}
            >
              <rect
                x={x - width / 2 - 2}
                y="22"
                width={width + 4}
                height="153"
                fill="transparent"
              />
              {v !== null ? (
                <rect
                  x={x - width / 2}
                  y={Math.min(y(v), y(0))}
                  width={width}
                  height={Math.max(1, Math.abs(y(v) - y(0)))}
                  rx="2"
                  className={
                    v < 0
                      ? "t-chart-bar-negative"
                      : i === n - 1
                        ? "t-chart-bar-current"
                        : "t-chart-bar"
                  }
                  opacity={focus === null || focus === i ? 1 : 0.45}
                />
              ) : (
                <text
                  x={x}
                  y="150"
                  textAnchor="middle"
                  className="t-chart-axis"
                >
                  —
                </text>
              )}
              <text x={x} y="190" textAnchor="middle" className="t-chart-axis">
                {quarterLabel(q.end)}
              </text>
            </g>
          );
        })}
      </svg>
      <div
        className="t-quarter-select"
        role="group"
        aria-label={`${financialLabels[field]} quarter values`}
      >
        {quarters.map((q, i) => (
          <button
            key={q.end}
            aria-label={`Inspect ${financialLabels[field]} quarter ended ${q.end}`}
            aria-pressed={focus === i}
            onClick={() => setFocus(focus === i ? null : i)}
          >
            {quarterLabel(q.end)}
          </button>
        ))}
      </div>
      <div className="t-chart-foot">
        <span>
          Standalone quarters ·{" "}
          {field === "operatingMargin" ? "GAAP margin" : "USD · GAAP"}
        </span>
        <a
          href={
            selected.sources[
              field === "operatingMargin" ? "operatingIncome" : field
            ]?.sourceUrl ?? selected.sourceUrl
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          Original filing ↗
        </a>
      </div>
    </div>
  );
}
