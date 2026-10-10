import { describe, expect, it } from "vitest";
import { SOURCES, parseListing } from "../src/sources.ts";
import { listing, rawEntry } from "./fixtures.ts";

const internships = SOURCES.find((s) => s.id === "simplify-internships")!;
const newGrad = SOURCES.find((s) => s.id === "simplify-new-grad")!;

describe("parseListing", () => {
  it("maps a real entry", () => {
    expect(parseListing(rawEntry("x1", { sponsorship: "Offers Sponsorship" }))).toEqual({
      id: "x1",
      company: "Acme",
      title: "Engineer",
      url: "https://example.com/x1",
      locations: ["Austin, TX"],
      terms: ["Summer 2027"],
      degrees: ["Bachelor's"],
      category: "Software",
      sponsorship: "Offers Sponsorship",
      datePosted: 1_000_000,
      active: true,
      visible: true,
    });
  });

  it("drops malformed entries", () => {
    expect(parseListing(null)).toBeNull();
    expect(parseListing("nope")).toBeNull();
    expect(parseListing({ id: "x", url: "u" })).toBeNull();
    expect(parseListing(rawEntry("x", { date_posted: "yesterday" }))).toBeNull();
  });

  it("tolerates missing optional fields", () => {
    const l = parseListing({ id: "x", url: "https://u.com", date_posted: 5 });
    expect(l).toMatchObject({ locations: [], terms: [], active: false, visible: false, company: "" });
  });

  it("rejects non-https URLs", () => {
    expect(parseListing({ id: "x", url: "http://u.com", date_posted: 5 })).toBeNull();
    expect(parseListing({ id: "x", url: "ftp://u.com", date_posted: 5 })).toBeNull();
    expect(parseListing({ id: "x", url: "u", date_posted: 5 })).toBeNull();
  });
});

describe("registry filters", () => {
  it("matches a Software Summer 2027 internship", () => {
    expect(internships.matches(listing())).toBe(true);
  });
  it("rejects Hardware", () => {
    expect(internships.matches(listing({ category: "Hardware" }))).toBe(false);
  });
  it("rejects Summer 2026-only terms", () => {
    expect(internships.matches(listing({ terms: ["Summer 2026"] }))).toBe(false);
  });
  it("rejects inactive and hidden listings", () => {
    expect(internships.matches(listing({ active: false }))).toBe(false);
    expect(internships.matches(listing({ visible: false }))).toBe(false);
  });
  it("matches new grad Software without terms", () => {
    expect(newGrad.matches(listing({ terms: [] }))).toBe(true);
    expect(newGrad.matches(listing({ terms: [], category: "Quant" }))).toBe(false);
  });
});
