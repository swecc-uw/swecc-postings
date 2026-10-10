import { describe, expect, it } from "vitest";
import { buildEntry, buildPayloads } from "../src/discord.ts";
import { SOURCES } from "../src/sources.ts";
import { listing } from "./fixtures.ts";

const internships = SOURCES.find((s) => s.id === "simplify-internships")!;
const newGrad = SOURCES.find((s) => s.id === "simplify-new-grad")!;
const entryCounts = (payloads: ReturnType<typeof buildPayloads>) =>
  payloads.map((p) => p.embeds[0].description.split("\n\n").length);

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
});

describe("buildPayloads", () => {
  it("puts a batch in one embed coloured by source", () => {
    const ls = [listing({ id: "1", company: "Acme", datePosted: 1 }), listing({ id: "2", company: "Globex", datePosted: 2 })];
    expect(buildPayloads(ls, newGrad)).toEqual([
      {
        embeds: [
          {
            color: 0x57f287,
            description:
              "**[Acme · Software Engineer Intern](https://example.com/a)**\nAustin, TX · Summer 2027 · Bachelor's · <t:1:R>\n\n" +
              "**[Globex · Software Engineer Intern](https://example.com/a)**\nAustin, TX · Summer 2027 · Bachelor's · <t:2:R>",
          },
        ],
        allowed_mentions: { parse: [] },
      },
    ]);
  });

  it("splits 23 listings into messages of 10, 10 and 3", () => {
    const ls = Array.from({ length: 23 }, (_, i) => listing({ id: `id${i}` }));
    expect(entryCounts(buildPayloads(ls, internships))).toEqual([10, 10, 3]);
  });

  it("starts a new message before the description passes 4096 characters", () => {
    const ls = Array.from({ length: 6 }, (_, i) => listing({ id: `id${i}`, url: `https://example.com/${"x".repeat(900)}` }));
    const payloads = buildPayloads(ls, internships);
    expect(entryCounts(payloads)).toEqual([4, 2]);
    expect(payloads.every((p) => p.embeds[0].description.length <= 4096)).toBe(true);
  });

  it("returns nothing for no listings", () => {
    expect(buildPayloads([], internships)).toEqual([]);
  });
});
