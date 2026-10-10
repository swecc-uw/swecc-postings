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
export const AI_ML_DATA_CATEGORIES = new Set(["AI/ML/Data", "Data Science, AI & Machine Learning"]);
export const INTERNSHIP_TERM_YEAR = "2027";

const ML_TITLE_ALLOW = [
  /machine\s*learning/i,
  /\bml\b/i,
  /\bai\b/i,
  /data\s*scien/i,
  /data\s*engineer/i,
  /data\s*analytics\s*engineer/i,
  /applied\s*scientist/i,
  /research\s*(?:scientist|intern|er)/i,
  /\bintern\b.*\bresearch\b/i,
  /\bresearch\b.*\bintern\b/i,
  /computer\s*vision/i,
  /\bnlp\b/i,
  /\bllm\b/i,
  /deep\s*learning/i,
];

const ML_TITLE_BLOCK = [
  /annotator/i,
  /annotation/i,
  /help\s*improve\s*ai/i,
  /talent\s*acquisition/i,
  /recruiting/i,
];

export function isMLTitle(title: string): boolean {
  if (ML_TITLE_BLOCK.some((re) => re.test(title))) return false;
  return ML_TITLE_ALLOW.some((re) => re.test(title));
}

const isActive = (l: Listing) => l.active && l.visible;
const isSoftware = (l: Listing) => SOFTWARE_CATEGORIES.has(l.category) && isActive(l);
const isAIMLData = (l: Listing) => AI_ML_DATA_CATEGORIES.has(l.category) && isActive(l) && isMLTitle(l.title);

export const SOURCES: Source[] = [
  {
    id: "simplify-internships",
    webhook: "DISCORD_WEBHOOK_INTERNSHIPS",
    url: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
    color: 0x5865f2,
    matches: (l) => (isSoftware(l) || isAIMLData(l)) && l.terms.some((t) => t.includes(INTERNSHIP_TERM_YEAR)),
  },
  {
    id: "simplify-new-grad",
    webhook: "DISCORD_WEBHOOK_NEW_GRAD",
    url: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
    color: 0x57f287,
    matches: (l) => isSoftware(l) || isAIMLData(l),
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
