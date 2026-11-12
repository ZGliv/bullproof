import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ResearchError } from "@/lib/live-research";
import { getPacket } from "@/lib/earnings/sec";
import { GET } from "./route";

vi.mock("@/lib/earnings/sec", () => ({ getPacket: vi.fn() }));

const packet = vi.mocked(getPacket);
const get = (query: string) => GET(new NextRequest(`https://example.test/api/earnings/packet?${query}`));

afterEach(() => packet.mockReset());

describe("GET /api/earnings/packet", () => {
  it("rejects asOf values that are not UTC instants or are far from now", async () => {
    const far = new Date(Date.now() + 3 * 86_400_000).toISOString();
    for (const asOf of ["1", "2026", "2026-11-12", far, "2099-01-01T00:00:00Z"]) {
      expect((await get(`ticker=CSCO&asOf=${encodeURIComponent(asOf)}`)).status).toBe(400);
    }
    expect(packet).not.toHaveBeenCalled();
  });

  it("answers 503 when SEC fails, so the worker retries instead of recording a skip", async () => {
    packet.mockRejectedValue(new ResearchError("SEC returned HTTP 429 for https://www.sec.gov/x."));
    const response = await get(`ticker=CSCO&asOf=${new Date().toISOString()}`);
    expect(response.status).toBe(503);
  });

  it("answers 200 for a definite refusal", async () => {
    packet.mockResolvedValue({ ok: false, ticker: "URBN", reason: "stale-release", detail: "" });
    const response = await get(`ticker=URBN&asOf=${new Date().toISOString()}`);
    expect(response.status).toBe(200);
    expect((await response.json()).reason).toBe("stale-release");
  });
});
