import type { Listing } from "../src/sources.ts";

export function listing(over: Partial<Listing> = {}): Listing {
  return {
    id: "a",
    company: "Acme",
    title: "Software Engineer Intern",
    url: "https://example.com/a",
    locations: ["Austin, TX"],
    terms: ["Summer 2027"],
    degrees: ["Bachelor\'s"],
    category: "Software",
    sponsorship: "Other",
    datePosted: 1_000_000,
    active: true,
    visible: true,
    ...over,
  };
}

export function rawEntry(id: string, over: Record<string, unknown> = {}) {
  return {
    source: "Simplify",
    category: "Software",
    company_name: "Acme",
    id,
    title: "Engineer",
    active: true,
    terms: ["Summer 2027"],
    date_updated: 1,
    date_posted: 1_000_000,
    url: `https://example.com/${id}`,
    locations: ["Austin, TX"],
    company_url: "https://simplify.jobs/c/Acme",
    is_visible: true,
    sponsorship: "Other",
    degrees: ["Bachelor's"],
    ...over,
  };
}
