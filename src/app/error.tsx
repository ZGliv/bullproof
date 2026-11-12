"use client";

import { Shell, StateRow } from "@/components/calls/shell";

/** Render failures on the new pages keep the shell; /research has its own boundary. */
export default function ErrorPage() {
  return (
    <Shell active="none">
      <StateRow>Unavailable</StateRow>
    </Shell>
  );
}
