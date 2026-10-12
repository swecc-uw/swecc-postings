import { buildPayloads, buildSinglePayload, postPayload, DiscordClientError } from "./discord.ts";
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
    const before = prev[source.id];
    let postedCount = 0;
    let skippedCount = 0;
    let sourceError: unknown = null;

    try {
      const webhookUrl = webhooks[source.webhook];
      if (!webhookUrl) throw new Error(`${source.webhook} is not set`);
      const result = await fetchListings(source, before?.etag);
      if (!result) continue;
      const { fresh, seen, deferred } = selectNew(result.listings, source, before, now);

      const batches = buildPayloads(fresh, source);
      for (const { payload, listings } of batches) {
        try {
          await postPayload(webhookUrl, payload);
          for (const l of listings) seen[l.id] = l.datePosted;
          postedCount += listings.length;
        } catch (err) {
          if (err instanceof DiscordClientError) {
            console.warn(`${source.id}: batch failed with ${err.status}, retrying individually`);
            for (const listing of listings) {
              const singlePayload = buildSinglePayload(listing, source);
              if (!singlePayload) {
                skippedCount++;
                seen[listing.id] = listing.datePosted;
                continue;
              }
              try {
                await postPayload(webhookUrl, singlePayload);
                seen[listing.id] = listing.datePosted;
                postedCount++;
              } catch (retryErr) {
                if (retryErr instanceof DiscordClientError) {
                  console.warn(`${source.id}: skipping listing ${listing.id} due to client error`);
                  seen[listing.id] = listing.datePosted;
                  skippedCount++;
                } else {
                  sourceError = retryErr;
                  break;
                }
              }
            }
            if (sourceError) break;
          } else {
            sourceError = err;
            break;
          }
        }
      }

      const seedRun = !before;
      const etag = deferred ? (before?.etag ?? "") : result.etag;
      state[source.id] = { etag, seen };

      if (sourceError) throw sourceError;

      const skippedMsg = skippedCount > 0 ? `, ${skippedCount} skipped` : "";
      console.log(`${source.id}: posted ${postedCount}${skippedMsg}${seedRun ? " (seed run)" : ""}`);
    } catch (err) {
      console.error(`${source.id} failed:`, err);
      errors.push(err);
    }
  }
  return { state, errors };
}
