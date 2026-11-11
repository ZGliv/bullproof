import { describe, expect, it } from "vitest";
import { encodeShelf, parseShelf } from "./discovery-shelf";

describe("discovery shelf durability", () => {
  it("retains notes and following across serialization", () => {
    const entries = { gxo: {saved:true, following:true, note:"Check contract economics", verdict:"interesting" as const} };
    expect(parseShelf(encodeShelf(entries))).toEqual(entries);
  });
  it("handles damaged or incompatible storage without crashing", () => {
    for(const raw of [null, "broken", "null", "[]", '{"version":2,"entries":{}}']) expect(parseShelf(raw)).toEqual({});
  });
  it("bounds note size and normalizes malformed entries", () => {
    const result = parseShelf(JSON.stringify({version:1,entries:{gxo:{following:true,note:"x".repeat(5000),verdict:"buy"},bad:null}}));
    expect(result.gxo).toMatchObject({saved:true,following:true,verdict:null});
    expect(result.gxo.note).toHaveLength(4000);
    expect(result.bad).toBeUndefined();
  });
});
