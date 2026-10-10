import type { Listing, Source } from "./sources.ts";

export type Embed = { color: number; description: string };
export type WebhookPayload = { embeds: [Embed]; allowed_mentions: { parse: never[] } };
export type PayloadBatch = { payload: WebhookPayload; listings: Listing[] };

const MAX_ENTRIES = 10;
const MAX_DESCRIPTION = 4096;
const MAX_LINK_TEXT = 200;
const SHOWN_LOCATIONS = 3;
const MAX_RATE_LIMIT_RETRIES = 5;
const ENTRY_SEPARATOR = "\n\n";
const MAX_RATE_LIMIT_WAIT_MS = 60_000;

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const escapeMarkdown = (s: string) => s.replace(/[\\[\]*_`~|]/g, "\\$&");

function formatLocations(locations: string[]): string {
  const shown = locations.slice(0, SHOWN_LOCATIONS).join(" · ");
  const extra = locations.length - SHOWN_LOCATIONS;
  return extra > 0 ? `${shown} · +${extra} more` : shown;
}

const escapeMarkdownUrl = (url: string) => url.replace(/\)/g, "%29");

export function buildEntry(l: Listing): string {
  const details = [
    formatLocations(l.locations),
    l.terms.join(", "),
    l.degrees.join(", "),
    // Upstream marks unknown sponsorship as "Other", which carries no information.
    l.sponsorship === "Other" ? "" : l.sponsorship,
    `<t:${l.datePosted}:R>`,
  ];
  const text = escapeMarkdown(truncate(`${l.company} · ${l.title}`, MAX_LINK_TEXT));
  const url = escapeMarkdownUrl(l.url);
  return `**[${text}](${url})**\n${details.filter(Boolean).join(" · ")}`;
}

export function truncateEntry(entry: string, maxLen: number): string | null {
  if (entry.length <= maxLen) return entry;
  const lines = entry.split("\n");
  if (lines.length < 2) return null;
  const [linkLine, detailsLine] = lines;
  if (!linkLine || !detailsLine) return null;
  const overhead = linkLine.length + 1;
  if (overhead >= maxLen) return null;
  const truncatedDetails = truncate(detailsLine, maxLen - overhead);
  return `${linkLine}\n${truncatedDetails}`;
}

// One embed holds the whole batch: Discord sizes each embed to its own content, so a stack of
// per-listing embeds renders at ragged widths.
export function buildPayloads(listings: Listing[], source: Source): PayloadBatch[] {
  const batches: { entries: string[]; listings: Listing[] }[] = [];
  let size = 0;
  for (const listing of listings) {
    let entry = buildEntry(listing);
    if (entry.length > MAX_DESCRIPTION) {
      const truncated = truncateEntry(entry, MAX_DESCRIPTION);
      if (!truncated) continue;
      entry = truncated;
    }
    const batch = batches.at(-1);
    if (!batch || batch.entries.length === MAX_ENTRIES || size + ENTRY_SEPARATOR.length + entry.length > MAX_DESCRIPTION) {
      batches.push({ entries: [entry], listings: [listing] });
      size = entry.length;
    } else {
      batch.entries.push(entry);
      batch.listings.push(listing);
      size += ENTRY_SEPARATOR.length + entry.length;
    }
  }
  return batches.map((batch) => ({
    payload: {
      embeds: [{ color: source.color, description: batch.entries.join(ENTRY_SEPARATOR) }],
      allowed_mentions: { parse: [] },
    },
    listings: batch.listings,
  }));
}

export class DiscordClientError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DiscordClientError";
    this.status = status;
  }
}

export async function postPayload(webhookUrl: string, payload: WebhookPayload): Promise<void> {
  const url = `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}wait=true`;
  const send = () =>
    fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

  // A full run sends several messages per webhook in quick succession, which can trip Discord's rate limit.
  let res = await send();
  for (let retries = 0; res.status === 429 && retries < MAX_RATE_LIMIT_RETRIES; retries++) {
    const { retry_after } = (await res.json().catch(() => ({}))) as { retry_after?: number };
    const waitMs = Math.min(Math.ceil((retry_after ?? 1) * 1000), MAX_RATE_LIMIT_WAIT_MS);
    await new Promise((r) => setTimeout(r, waitMs));
    res = await send();
  }
  if (!res.ok) {
    const body = await res.text();
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new DiscordClientError(res.status, `Discord webhook client error: ${res.status} ${body}`);
    }
    throw new Error(`Discord webhook failed: ${res.status} ${body}`);
  }
}
