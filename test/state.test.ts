import { describe, expect, it } from "vitest";
import { decodeState, encodeState } from "../src/state.ts";

const A = "8fc02634-7bf1-4c6c-9d32-78f048f7e7e6";
const B = "00000000-0000-4000-8000-0000000000ff";

describe("state format", () => {
  it("encodes an empty state as version and zero sources", () => {
    expect([...encodeState({})]).toEqual([1, 0]);
    expect(decodeState(Uint8Array.of(1, 0))).toEqual({});
  });

  it("writes the documented byte layout", () => {
    const bytes = encodeState({ s: { etag: "e1", seen: { [B]: 258 } } });
    expect([...bytes]).toEqual([
      1, 1,
      1, 0x73,
      2, 0x65, 0x31,
      0, 1,
      0, 0, 0, 0, 0, 0, 0x40, 0, 0x80, 0, 0, 0, 0, 0, 0, 0xff,
      0, 0, 1, 2,
      0, 0,
    ]);
  });

  it("round-trips sources, etags, UUID ids and other ids", () => {
    const state = {
      "simplify-internships": { etag: 'W/"faaa22acd7ac090e5f7b40fd442d6f83"', seen: { [A]: 1791504000, [B]: 1791560446 } },
      "simplify-new-grad": { etag: "", seen: { "not-a-uuid": 4294967295, "ünï": 0 } },
    };
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it("stores a UUID listing in 20 bytes", () => {
    const one = encodeState({ s: { etag: "", seen: { [A]: 1 } } }).length;
    const two = encodeState({ s: { etag: "", seen: { [A]: 1, [B]: 2 } } }).length;
    expect(two - one).toBe(20);
  });

  it("encodes the same state to the same bytes regardless of key order", () => {
    const forward = { x: { etag: "e", seen: { [A]: 5, [B]: 5 } }, y: { etag: "f", seen: {} } };
    const reversed = { y: { etag: "f", seen: {} }, x: { etag: "e", seen: { [B]: 5, [A]: 5 } } };
    expect([...encodeState(reversed)]).toEqual([...encodeState(forward)]);
  });

  it("rejects an unknown version, truncated data and trailing bytes", () => {
    const good = encodeState({ s: { etag: "e", seen: { [A]: 1 } } });
    expect(() => decodeState(Uint8Array.of(2, 0))).toThrow("Unsupported state format version 2");
    expect(() => decodeState(good.subarray(0, good.length - 3))).toThrow();
    expect(() => decodeState(Uint8Array.of(...good, 0))).toThrow("1 unexpected trailing bytes");
  });

  it("refuses values that do not fit the format", () => {
    expect(() => encodeState({ s: { etag: "e".repeat(256), seen: {} } })).toThrow("Etag is too long");
  });
});
