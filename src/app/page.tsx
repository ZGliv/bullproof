import { CallTable } from "@/components/calls/call-table";
import { RecordStrip } from "@/components/calls/record-strip";
import { Shell, StateRow } from "@/components/calls/shell";
import { getBoard } from "@/lib/earnings/board";
import type { BoardResponse } from "@/lib/earnings/types";

export const revalidate = 30;

/** Lock time of the current slate: the latest publish among calls still awaiting a grade. */
function slateLockedAt(board: BoardResponse): string | null {
  const times = board.slate.map((call) => call.publishedAt).sort();
  return times.at(-1) ?? null;
}

export default async function SlatePage() {
  const board = await getBoard();
  if (!board) {
    return (
      <Shell active="slate">
        <StateRow>Unavailable</StateRow>
      </Shell>
    );
  }
  return (
    <Shell active="slate" lockedAt={slateLockedAt(board)}>
      <RecordStrip record={board.record} />
      <CallTable calls={board.slate} mode="slate" label="Slate" />
      <CallTable calls={board.recent} mode="results" label="Results" />
    </Shell>
  );
}
