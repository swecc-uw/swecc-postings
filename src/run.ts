import { buildPayloads, postPayload } from "./discord.ts";
import { selectNew } from "./select.ts";
import { SOURCES, parseListing, type Listing, type Source, type State, type WebhookVar } from "./sources.ts";

export type Webhooks = Partial<Record<WebhookVar, string>>;

async function fetchListings(source: Source, etag: string | undefined) {
  const res = await fetch(source.url, { headers: etag ? { "If-None-Match": etag } : {} });
  if (res.status === 304) return null;
  if (!res.ok) throw new Error(`Fetching ${source.id} failed: ${res.status}`);
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) throw new Error(`Fetching ${source.id} failed: body is not an array`);
  const listings = raw.map(parseListing).filter((l): l is Listing => l !== null);
  return { etag: res.headers.get("etag") ?? "", listings };
}

// A failed source keeps its previous state so the next run retries it, while the others still advance.
export async function run(
  webhooks: Webhooks,
  prev: State,
  now = Math.floor(Date.now() / 1000),
): Promise<{ state: State; errors: unknown[] }> {
  const state: State = { ...prev };
  const errors: unknown[] = [];

  for (const source of SOURCES) {
    try {
      const webhookUrl = webhooks[source.webhook];
      if (!webhookUrl) throw new Error(`${source.webhook} is not set`);
      const before = prev[source.id];
      const result = await fetchListings(source, before?.etag);
      if (!result) continue;
      const { fresh, seen, deferred } = selectNew(result.listings, source, before, now);
      for (const payload of buildPayloads(fresh, source)) await postPayload(webhookUrl, payload);
      console.log(`${source.id}: posted ${fresh.length}${before ? "" : " (seed run)"}`);
      // Keeping the old etag forces a refetch next run, so listings held back by the cap are not stuck behind a 304.
      state[source.id] = { etag: deferred ? (before?.etag ?? "") : result.etag, seen };
    } catch (err) {
      console.error(`${source.id} failed:`, err);
      errors.push(err);
    }
  }
  return { state, errors };
}
