import { describe, expect, it } from "vitest";
import { MAX_POSTS_PER_RUN, WINDOW_SECONDS, selectNew } from "../src/select.ts";
import { SOURCES } from "../src/sources.ts";
import { listing } from "./fixtures.ts";

const source = SOURCES.find((s) => s.id === "simplify-internships")!;
const now = 10_000_000;
const recent = (id: string, ago: number) => listing({ id, datePosted: now - ago });

describe("selectNew", () => {
  it("seeds on first run: posts nothing and records candidates", () => {
    const r = selectNew([recent("a", 100), recent("b", 50), listing({ id: "old", datePosted: now - WINDOW_SECONDS - 1 })], source, undefined, now);
    expect(r.fresh).toEqual([]);
    expect(r.seen).toEqual({ a: now - 100, b: now - 50 });
  });

  it("second run posts only the new id, oldest first", () => {
    const prev = { etag: "e", seen: { a: now - 100 } };
    const r = selectNew([recent("a", 100), recent("c", 10), recent("b", 50)], source, prev, now);
    expect(r.fresh.map((l) => l.id)).toEqual(["b", "c"]);
    expect(r.deferred).toBe(false);
    expect(r.seen).toEqual({ a: now - 100, b: now - 50, c: now - 10 });
  });

  it("prunes seen entries older than the window", () => {
    const prev = { etag: "e", seen: { stale: now - WINDOW_SECONDS - 5, a: now - 100 } };
    const r = selectNew([recent("a", 100)], source, prev, now);
    expect(r.seen).toEqual({ a: now - 100 });
  });

  it("ignores non-matching listings", () => {
    const prev = { etag: "e", seen: {} };
    const r = selectNew([listing({ id: "hw", category: "Hardware", datePosted: now - 5 })], source, prev, now);
    expect(r.fresh).toEqual([]);
    expect(r.seen).toEqual({});
  });

  it("leaves overflow beyond the cap unseen", () => {
    const prev = { etag: "e", seen: {} };
    const listings = Array.from({ length: MAX_POSTS_PER_RUN + 2 }, (_, i) => recent(`id${i}`, 1000 - i));
    const r = selectNew(listings, source, prev, now);
    expect(r.fresh).toHaveLength(MAX_POSTS_PER_RUN);
    expect(Object.keys(r.seen)).toHaveLength(MAX_POSTS_PER_RUN);
    expect(r.seen).not.toHaveProperty(`id${MAX_POSTS_PER_RUN + 1}`);
    expect(r.deferred).toBe(true);
  });

  it("respects a smaller remaining budget", () => {
    const prev = { etag: "e", seen: {} };
    const r = selectNew([recent("a", 30), recent("b", 20), recent("c", 10)], source, prev, now, 1);
    expect(r.fresh.map((l) => l.id)).toEqual(["a"]);
    expect(r.seen).toEqual({ a: now - 30 });
  });
});
