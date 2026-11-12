"use client";

import { useLinkStatus } from "next/link";
import t from "./call-table.module.css";

/** A mint edge on a row while its call page loads; /call/[id] renders per request. */
export function RowPending() {
  const { pending } = useLinkStatus();
  return <span className={pending ? `${t.pendingEdge} ${t.pendingOn}` : t.pendingEdge} aria-hidden="true" />;
}
