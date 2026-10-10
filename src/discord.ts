import type { Listing, Source } from "./sources.ts";

export type Embed = { color: number; description: string };
export type WebhookPayload = { embeds: [Embed]; allowed_mentions: { parse: never[] } };

const MAX_ENTRIES = 10;
const MAX_DESCRIPTION = 4096;
const MAX_LINK_TEXT = 200;
const SHOWN_LOCATIONS = 3;
const MAX_RATE_LIMIT_RETRIES = 5;
const ENTRY_SEPARATOR = "\n\n";

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const escapeMarkdown = (s: string) => s.replace(/[\\[\]*_`~|]/g, "\\$&");

function formatLocations(locations: string[]): string {
  const shown = locations.slice(0, SHOWN_LOCATIONS).join(" · ");
  const extra = locations.length - SHOWN_LOCATIONS;
  return extra > 0 ? `${shown} · +${extra} more` : shown;
}

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
  return `**[${text}](${l.url})**\n${details.filter(Boolean).join(" · ")}`;
}

// One embed holds the whole batch: Discord sizes each embed to its own content, so a stack of
// per-listing embeds renders at ragged widths.
export function buildPayloads(listings: Listing[], source: Source): WebhookPayload[] {
  const batches: string[][] = [];
  let size = 0;
  for (const entry of listings.map(buildEntry)) {
    const batch = batches.at(-1);
    if (!batch || batch.length === MAX_ENTRIES || size + ENTRY_SEPARATOR.length + entry.length > MAX_DESCRIPTION) {
      batches.push([entry]);
      size = entry.length;
    } else {
      batch.push(entry);
      size += ENTRY_SEPARATOR.length + entry.length;
    }
  }
  return batches.map((batch) => ({
    embeds: [{ color: source.color, description: batch.join(ENTRY_SEPARATOR) }],
    allowed_mentions: { parse: [] },
  }));
}

export async function postPayload(webhookUrl: string, payload: WebhookPayload): Promise<void> {
  const url = `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}wait=true`;
  const send = () =>
    fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

  // A full run sends several messages per webhook in quick succession, which can trip Discord's rate limit.
  let res = await send();
  for (let retries = 0; res.status === 429 && retries < MAX_RATE_LIMIT_RETRIES; retries++) {
    const { retry_after } = (await res.json().catch(() => ({}))) as { retry_after?: number };
    await new Promise((r) => setTimeout(r, Math.ceil((retry_after ?? 1) * 1000)));
    res = await send();
  }
  if (!res.ok) throw new Error(`Discord webhook failed: ${res.status} ${await res.text()}`);
}
