import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEntry, buildPayloads, postPayload, DiscordClientError } from "../src/discord.ts";
import { SOURCES } from "../src/sources.ts";
import { listing } from "./fixtures.ts";

const internships = SOURCES.find((s) => s.id === "simplify-internships")!;
const newGrad = SOURCES.find((s) => s.id === "simplify-new-grad")!;
const entryCounts = (payloads: ReturnType<typeof buildPayloads>) =>
  payloads.map((p) => p.payload.embeds[0].description.split("\n\n").length);

describe("buildEntry", () => {
  it("links the company and role, then lists every known detail", () => {
    const l = listing({
      company: "Johnson Controls",
      title: "Software Engineer Co-op",
      url: "https://example.com/j",
      locations: ["Burlington, MA"],
      terms: ["Winter 2027"],
      sponsorship: "Offers Sponsorship",
      datePosted: 1791504000,
    });
    expect(buildEntry(l)).toBe(
      "**[Johnson Controls · Software Engineer Co-op](https://example.com/j)**\n" +
        "Burlington, MA · Winter 2027 · Bachelor's · Offers Sponsorship · <t:1791504000:R>",
    );
  });

  it("omits empty details and unknown sponsorship, and summarizes many locations", () => {
    const l = listing({ terms: [], degrees: [], locations: ["A", "B", "C", "D", "E"], datePosted: 5 });
    expect(buildEntry(l).split("\n")[1]).toBe("A · B · C · +2 more · <t:5:R>");
  });

  it("escapes markdown in the link text", () => {
    const l = listing({ company: "A*B", title: "Intern [Remote]", url: "https://e.com/x" });
    expect(buildEntry(l).split("\n")[0]).toBe("**[A\\*B · Intern \\[Remote\\]](https://e.com/x)**");
  });

  it("escapes closing parentheses in URLs to avoid breaking markdown links", () => {
    const l = listing({ url: "https://example.com/job(123)" });
    expect(buildEntry(l)).toContain("https://example.com/job(123%29");
  });
});

describe("buildPayloads", () => {
  it("puts a batch in one embed coloured by source", () => {
    const ls = [listing({ id: "1", company: "Acme", datePosted: 1 }), listing({ id: "2", company: "Globex", datePosted: 2 })];
    const batches = buildPayloads(ls, newGrad);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.payload).toEqual({
      embeds: [
        {
          color: 0x57f287,
          description:
            "**[Acme · Software Engineer Intern](https://example.com/a)**\nAustin, TX · Summer 2027 · Bachelor's · <t:1:R>\n\n" +
            "**[Globex · Software Engineer Intern](https://example.com/a)**\nAustin, TX · Summer 2027 · Bachelor's · <t:2:R>",
        },
      ],
      allowed_mentions: { parse: [] },
    });
    expect(batches[0]!.listings).toEqual(ls);
  });

  it("splits 23 listings into messages of 10, 10 and 3", () => {
    const ls = Array.from({ length: 23 }, (_, i) => listing({ id: `id${i}` }));
    expect(entryCounts(buildPayloads(ls, internships))).toEqual([10, 10, 3]);
  });

  it("starts a new message before the description passes 4096 characters", () => {
    const ls = Array.from({ length: 6 }, (_, i) => listing({ id: `id${i}`, url: `https://example.com/${"x".repeat(900)}` }));
    const payloads = buildPayloads(ls, internships);
    expect(entryCounts(payloads)).toEqual([4, 2]);
    expect(payloads.every((p) => p.payload.embeds[0].description.length <= 4096)).toBe(true);
  });

  it("returns nothing for no listings", () => {
    expect(buildPayloads([], internships)).toEqual([]);
  });

  it("truncates an oversized entry to fit within the 4096 character limit (bug 2)", () => {
    const longUrl = `https://example.com/${"x".repeat(4000)}`;
    const l = listing({ id: "oversized", url: longUrl });
    const batches = buildPayloads([l], internships);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.payload.embeds[0].description.length).toBeLessThanOrEqual(4096);
  });

  it("skips entries that cannot be truncated to fit (bug 2)", () => {
    const extremeUrl = `https://example.com/${"x".repeat(5000)}`;
    const l = listing({ id: "extreme", url: extremeUrl });
    const batches = buildPayloads([l], internships);
    // Entry is too long even after truncation, so it's skipped
    expect(batches).toHaveLength(0);
  });

  it("continues processing normal entries after skipping an oversized one", () => {
    const extremeUrl = `https://example.com/${"x".repeat(5000)}`;
    const badListing = listing({ id: "extreme", url: extremeUrl });
    const goodListing = listing({ id: "normal", url: "https://example.com/normal" });
    const batches = buildPayloads([badListing, goodListing], internships);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.listings).toHaveLength(1);
    expect(batches[0]!.listings[0]!.id).toBe("normal");
  });
});

describe("postPayload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const testPayload = {
    embeds: [{ color: 0x5865f2, description: "test" }] as [{ color: number; description: string }],
    allowed_mentions: { parse: [] as never[] },
  };

  it("throws DiscordClientError for 4xx responses (except 429)", async () => {
    vi.stubGlobal("fetch", async () => new Response("Bad Request", { status: 400 }));
    await expect(postPayload("https://discord.test/hook", testPayload)).rejects.toBeInstanceOf(DiscordClientError);
  });

  it("throws regular Error for 5xx responses", async () => {
    vi.stubGlobal("fetch", async () => new Response("Internal Server Error", { status: 500 }));
    const err = await postPayload("https://discord.test/hook", testPayload).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(DiscordClientError);
  });

  it("caps rate limit wait time to 60 seconds", async () => {
    vi.useFakeTimers();
    let callCount = 0;
    vi.stubGlobal("fetch", async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ retry_after: 120 }), { status: 429 });
      }
      return new Response("{}", { status: 200 });
    });
    const promise = postPayload("https://discord.test/hook", testPayload);
    // Advance time by 60 seconds (the cap), not 120
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;
    expect(callCount).toBe(2);
    vi.useRealTimers();
  });
});
