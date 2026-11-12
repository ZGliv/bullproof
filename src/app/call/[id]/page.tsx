import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CallDetail } from "@/components/calls/call-detail";
import { callHref, callTitle } from "@/components/calls/format";
import { Shell, StateRow } from "@/components/calls/shell";
import { getCall } from "@/lib/earnings/board";

export const revalidate = 30;

type Params = { params: Promise<{ id: string }> };

async function callId(params: Params["params"]): Promise<string> {
  const { id } = await params;
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const call = await getCall(await callId(params));
  if (!call || call === "not-found") return { title: "Call" };
  const title = callTitle(call);
  const url = callHref(call.id);
  return {
    title,
    description: call.thesis,
    alternates: { canonical: url },
    openGraph: { title, description: call.thesis, url, type: "article" },
  };
}

export default async function CallPage({ params }: Params) {
  const call = await getCall(await callId(params));
  if (call === "not-found") notFound();
  if (!call) {
    return (
      <Shell active="call">
        <StateRow>Unavailable</StateRow>
      </Shell>
    );
  }
  return (
    <Shell active="call">
      <CallDetail call={call} />
    </Shell>
  );
}
