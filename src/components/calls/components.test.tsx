import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Reaction, SeasonRecord } from "@/lib/earnings/types";
import { chartDomain, ReactionChart } from "./reaction-chart";
import { RecordStrip } from "./record-strip";

const leg = (win: number, loss: number, push: number, label: string) => ({
  win,
  loss,
  push,
  n: win + loss,
  pct: null,
  interval: null,
  base: { label, win, loss, push },
});

// Fixture season: 9 graded calls, one over/under push (AAPL −1.90% against ±1.9), one void.
const record: SeasonRecord = {
  season: "2026 Q4",
  direction: leg(6, 3, 0, "Always down"),
  overUnder: leg(5, 3, 1, "Always over"),
  voids: 1,
  last: [],
};

describe("RecordStrip", () => {
  it("shows each leg's own N, matching the record table", () => {
    const text = renderToStaticMarkup(<RecordStrip record={record} />).replace(/<[^>]+>/g, " ");
    expect(text.replace(/\s+/g, " ")).toContain("Dir 6–3–0 N 9");
    expect(text.replace(/\s+/g, " ")).toContain("O/U 5–3–1 N 8");
  });
});

// CBRS: two real reactions, both down, and no line.
const cbrs: Reaction[] = [
  { session: "2026-05-15", movePct: -19.6, timing: "amc", mapping: "accepted", accession: "a" },
  { session: "2026-08-14", movePct: -11.8, timing: "amc", mapping: "accepted", accession: "b" },
];

describe("ReactionChart", () => {
  it("drops the empty half when every move is on one side and there is no line", () => {
    const { hi, lo } = chartDomain(
      cbrs.map((r) => r.movePct),
      null,
    );
    expect(hi).toBe(0);
    expect(lo).toBeLessThan(-19.6);
  });

  it("keeps both sides of the line in range", () => {
    // QCOM-like history with a ±5.7 line: the +5.7 hairline must stay on the plot.
    const { hi, lo } = chartDomain([-0.1, -3.7, -8.9, -2.6], 5.7);
    expect(hi).toBeGreaterThan(5.7);
    expect(lo).toBeLessThan(-8.9);
  });

  it("plots a graded move next to the history and hides duplicate value labels from readers", () => {
    const html = renderToStaticMarkup(
      <ReactionChart reactions={cbrs} line={null} result={{ session: "2026-11-13", movePct: -4.21 }} />,
    );
    expect(html).toContain("−4.21");
    expect(html).toMatch(/<th scope="row">2026-11-13<\/th><td>−4.21%<\/td>/);
    const labels = html.match(/<span[^>]*style="left[^"]*"[^>]*>/g) ?? [];
    expect(labels).toHaveLength(3);
    for (const label of labels) expect(label).toContain('aria-hidden="true"');
  });
});
