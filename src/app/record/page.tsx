import type { Metadata } from "next";
import { CallTable } from "@/components/calls/call-table";
import { RecordTable } from "@/components/calls/record-table";
import { Shell, StateRow } from "@/components/calls/shell";
import { getLedger } from "@/lib/earnings/board";

export const revalidate = 30;
export const metadata: Metadata = { title: "Record" };

export default async function RecordPage() {
  const ledger = await getLedger();
  if (!ledger) {
    return (
      <Shell active="record">
        <StateRow>Unavailable</StateRow>
      </Shell>
    );
  }
  return (
    <Shell active="record">
      <RecordTable record={ledger.record} />
      <CallTable calls={ledger.calls} mode="results" label="Ledger" />
    </Shell>
  );
}
