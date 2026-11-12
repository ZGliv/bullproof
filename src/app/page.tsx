import { CallTable } from "@/components/calls/call-table";
import { RecordStrip } from "@/components/calls/record-strip";
import { latestLock } from "@/components/calls/format";
import { Shell, StateRow } from "@/components/calls/shell";
import { getBoard } from "@/lib/earnings/board";

export const revalidate = 30;

export default async function SlatePage() {
  const board = await getBoard();
  if (!board) {
    return (
      <Shell active="slate">
        <StateRow>Unavailable</StateRow>
      </Shell>
    );
  }
  // The header shows the latest lock; a report day locked on an earlier night carries its own.
  const lockedAt = latestLock(board.slate);
  return (
    <Shell active="slate" lockedAt={lockedAt}>
      <RecordStrip record={board.record} />
      <CallTable calls={board.slate} mode="slate" label="Slate" lockedAt={lockedAt} />
      <CallTable calls={board.recent} mode="results" label="Results" />
    </Shell>
  );
}
