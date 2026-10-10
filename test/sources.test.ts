import { describe, expect, it } from "vitest";
import { SOURCES, parseListing, isMLTitle } from "../src/sources.ts";
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

  it("matches AI/ML/Data internships with ML-focused titles", () => {
    const mlIntern = listing({ category: "AI/ML/Data", title: "Machine Learning Engineer Intern" });
    expect(internships.matches(mlIntern)).toBe(true);
  });

  it("matches AI/ML/Data new grad with ML-focused titles", () => {
    const mlGrad = listing({ category: "AI/ML/Data", title: "Research Scientist New Grad", terms: [] });
    expect(newGrad.matches(mlGrad)).toBe(true);
  });

  it("rejects AI/ML/Data listings with non-ML titles", () => {
    const annotator = listing({ category: "AI/ML/Data", title: "Data Annotation Specialist" });
    expect(internships.matches(annotator)).toBe(false);
    expect(newGrad.matches(annotator)).toBe(false);
  });

  it("handles the older AI/ML category name", () => {
    const oldCat = listing({ category: "Data Science, AI & Machine Learning", title: "Data Science Intern" });
    expect(internships.matches(oldCat)).toBe(true);
  });
});

describe("isMLTitle - real titles from CSV", () => {
  const shouldPass = [
    "Summer Intern - Research - Post Training",
    "Research Intern - AV Planning",
    "Data Engineer 1",
    "Applied AI/ML Scientist Intern",
    "Research Scientist New Grad - Conversational AI",
    "Machine Learning Engineer Graduate - Conversational AI",
    "Entry Level Data Engineer",
    "Data Science Intern",
    "Research Intern - World Models and Synthetic Data for Autonomous Driving",
    "AI Research Intern - Embodied AI",
    "Summer Intern - Onboard Autonomy - Embodied AI",
    "Data Scaling Intern - Data Scaling - Embodied AI",
    "Machine Learning Engineer Intern",
    "Postdoctoral Researcher - AI for Earth System Sciences",
  ];

  const shouldFail = [
    "Founding Software Engineer",
    "Data Annotation Specialist - Computer Vision",
    "Talent Acquisition Assistant - Analytics",
    "General AI Data Annotator",
    "Marketing Data Analytics Engineer",
    "Developer – Credit Analytics",
    "Business Administration Co-op - Maintenance Excellence",
    "Panasonic Transformation Group Intern",
    "Flexible Work - Help Improve AI - English Speakers",
    "Category Insights Analyst",
    "IT Analyst Co-op",
    "Marketing Analyst - Early Careers Programme",
    "Strategic Insight and Analytics Co-op",
    "Marketing Intern - Marketing Analysis",
    "People Analytics Intern",
    "HR AI Data Science Intern",
    "Business New Grad - Data and Analytics",
    "Business Intelligence & AI Solutions Analyst - Single Family",
  ];

  it.each(shouldPass)("allows: %s", (title) => {
    expect(isMLTitle(title)).toBe(true);
  });

  it.each(shouldFail)("blocks: %s", (title) => {
    expect(isMLTitle(title)).toBe(false);
  });
});
