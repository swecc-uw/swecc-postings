export type Listing = {
  id: string;
  company: string;
  title: string;
  url: string;
  locations: string[];
  terms: string[];
  degrees: string[];
  category: string;
  sponsorship: string;
  datePosted: number;
  active: boolean;
  visible: boolean;
};

export type WebhookVar = "DISCORD_WEBHOOK_INTERNSHIPS" | "DISCORD_WEBHOOK_NEW_GRAD";

export type Source = {
  id: string;
  webhook: WebhookVar;
  url: string;
  color: number;
  matches: (l: Listing) => boolean;
};

export type SourceState = { etag: string; seen: Record<string, number> };
export type State = Record<string, SourceState>;

export const SOFTWARE_CATEGORIES = new Set(["Software", "Software Engineering"]);
export const INTERNSHIP_TERM_YEAR = "2027";

const isSoftware = (l: Listing) => SOFTWARE_CATEGORIES.has(l.category) && l.active && l.visible;

export const SOURCES: Source[] = [
  {
    id: "simplify-internships",
    webhook: "DISCORD_WEBHOOK_INTERNSHIPS",
    url: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
    color: 0x5865f2,
    matches: (l) => isSoftware(l) && l.terms.some((t) => t.includes(INTERNSHIP_TERM_YEAR)),
  },
  {
    id: "simplify-new-grad",
    webhook: "DISCORD_WEBHOOK_NEW_GRAD",
    url: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
    color: 0x57f287,
    matches: isSoftware,
  },
];

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const isHttpsUrl = (s: string): boolean => s.startsWith("https://");

export function parseListing(raw: unknown): Listing | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const url = str(r.url);
  if (!id || !url || !isHttpsUrl(url) || typeof r.date_posted !== "number" || !Number.isFinite(r.date_posted))
    return null;
  return {
    id,
    company: str(r.company_name),
    title: str(r.title),
    url,
    locations: strs(r.locations),
    terms: strs(r.terms),
    degrees: strs(r.degrees),
    category: str(r.category),
    sponsorship: str(r.sponsorship),
    datePosted: r.date_posted,
    active: r.active === true,
    visible: r.is_visible === true,
  };
}
