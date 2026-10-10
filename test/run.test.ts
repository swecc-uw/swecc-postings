import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/run.ts";
import { SOURCES } from "../src/sources.ts";
import { rawEntry } from "./fixtures.ts";

const now = 10_000_000;
const [internships, newGrad] = SOURCES;
const internHook = "https://discord.test/api/webhooks/1/intern";
const gradHook = "https://discord.test/api/webhooks/2/grad";
const webhooks = { DISCORD_WEBHOOK_INTERNSHIPS: internHook, DISCORD_WEBHOOK_NEW_GRAD: gradHook };

function stubFetch(handlers: Record<string, () => Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const handler = handlers[url.split("?")[0]!];
    if (!handler) throw new Error(`unexpected fetch ${url}`);
    return handler();
  });
  return calls;
}

const file = (...ids: string[]) =>
  Response.json(
    ids.map((id) => rawEntry(id, { date_posted: now - 60 })),
    { headers: { etag: '"v2"' } },
  );
const unchanged = () => new Response(null, { status: 304 });
const accepted = () => new Response("{}", { status: 200 });
const descriptions = (calls: ReturnType<typeof stubFetch>, hook: string) =>
  calls.filter((c) => c.url.startsWith(hook)).map((c) => JSON.parse(c.init!.body as string).embeds[0].description);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("run", () => {
  it("seeds on first run without posting", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const calls = stubFetch({ [internships!.url]: () => file("a"), [newGrad!.url]: () => file("b") });
    const { state, errors } = await run(webhooks, {}, now);
    expect(calls.map((c) => c.url)).toEqual([internships!.url, newGrad!.url]);
    expect(errors).toEqual([]);
    expect(state).toEqual({
      "simplify-internships": { etag: '"v2"', seen: { a: now - 60 } },
      "simplify-new-grad": { etag: '"v2"', seen: { b: now - 60 } },
    });
  });

  it("posts each source's new listings to its own webhook and sends If-None-Match", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const prev = {
      "simplify-internships": { etag: '"v1"', seen: { a: now - 60 } },
      "simplify-new-grad": { etag: '"v1"', seen: {} },
    };
    const calls = stubFetch({
      [internships!.url]: () => file("a", "i"),
      [newGrad!.url]: () => file("g"),
      [internHook]: accepted,
      [gradHook]: accepted,
    });
    const { state } = await run(webhooks, prev, now);
    expect((calls[0]!.init!.headers as Record<string, string>)["If-None-Match"]).toBe('"v1"');
    expect(calls.find((c) => c.url.startsWith(internHook))!.url).toBe(`${internHook}?wait=true`);
    expect(descriptions(calls, internHook)).toHaveLength(1);
    expect(descriptions(calls, internHook)[0]).toContain("https://example.com/i)");
    expect(descriptions(calls, internHook)[0]).not.toContain("https://example.com/a)");
    expect(descriptions(calls, gradHook)).toHaveLength(1);
    expect(descriptions(calls, gradHook)[0]).toContain("https://example.com/g)");
    expect(state["simplify-internships"]).toEqual({ etag: '"v2"', seen: { a: now - 60, i: now - 60 } });
  });

  it("returns the previous state untouched when every source is unchanged", async () => {
    const prev = {
      "simplify-internships": { etag: '"v1"', seen: { a: now - 60 } },
      "simplify-new-grad": { etag: '"v1"', seen: {} },
    };
    stubFetch({ [internships!.url]: unchanged, [newGrad!.url]: unchanged });
    expect(await run(webhooks, prev, now)).toEqual({ state: prev, errors: [] });
  });

  it("advances the successful source and leaves the failed one as it was", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const prev = { "simplify-new-grad": { etag: '"old"', seen: { z: now - 5 } } };
    stubFetch({ [internships!.url]: () => file("a"), [newGrad!.url]: () => new Response("boom", { status: 500 }) });
    const { state, errors } = await run(webhooks, prev, now);
    expect(errors.map(String)).toEqual(["Error: Fetching simplify-new-grad failed: 500"]);
    expect(state).toEqual({
      "simplify-internships": { etag: '"v2"', seen: { a: now - 60 } },
      "simplify-new-grad": { etag: '"old"', seen: { z: now - 5 } },
    });
  });

  it("fails a source whose webhook is missing and still runs the other", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const prev = {
      "simplify-internships": { etag: '"v1"', seen: {} },
      "simplify-new-grad": { etag: '"v1"', seen: {} },
    };
    stubFetch({ [internships!.url]: () => file("i"), [internHook]: accepted });
    const { state, errors } = await run({ DISCORD_WEBHOOK_INTERNSHIPS: internHook }, prev, now);
    expect(errors.map(String)).toEqual(["Error: DISCORD_WEBHOOK_NEW_GRAD is not set"]);
    expect(state["simplify-internships"]!.seen).toEqual({ i: now - 60 });
    expect(state["simplify-new-grad"]).toEqual({ etag: '"v1"', seen: {} });
  });

  it("gives each source its own cap", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const prev = {
      "simplify-internships": { etag: '"v1"', seen: {} },
      "simplify-new-grad": { etag: '"v1"', seen: {} },
    };
    const ids = Array.from({ length: 30 }, (_, n) => `id${n}`);
    const calls = stubFetch({
      [internships!.url]: () => file(...ids),
      [newGrad!.url]: () => file("g1", "g2"),
      [internHook]: accepted,
      [gradHook]: accepted,
    });
    const { state } = await run(webhooks, prev, now);
    expect(Object.keys(state["simplify-internships"]!.seen)).toHaveLength(30);
    expect(descriptions(calls, internHook)).toHaveLength(3);
    expect(state["simplify-new-grad"]!.seen).toEqual({ g1: now - 60, g2: now - 60 });
    expect(descriptions(calls, gradHook)).toHaveLength(1);
  });

  it("keeps the old etag when the cap holds listings back", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const prev = {
      "simplify-internships": { etag: '"v1"', seen: {} },
      "simplify-new-grad": { etag: '"v1"', seen: {} },
    };
    const ids = Array.from({ length: 31 }, (_, n) => `id${n}`);
    stubFetch({ [internships!.url]: () => file(...ids), [newGrad!.url]: unchanged, [internHook]: accepted });
    const { state } = await run(webhooks, prev, now);
    expect(state["simplify-internships"]!.etag).toBe('"v1"');
    expect(Object.keys(state["simplify-internships"]!.seen)).toHaveLength(30);
  });
});
