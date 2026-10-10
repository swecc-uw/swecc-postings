import type { Listing, Source, SourceState } from "./sources.ts";

export const WINDOW_SECONDS = 3 * 24 * 60 * 60;
export const MAX_POSTS_PER_RUN = 30;

export function selectNew(
  listings: Listing[],
  source: Source,
  prev: SourceState | undefined,
  now: number,
  budget: number = MAX_POSTS_PER_RUN,
): { fresh: Listing[]; seen: Record<string, number>; deferred: boolean } {
  const cutoff = now - WINDOW_SECONDS;
  const candidates = listings
    .filter((l) => source.matches(l) && l.datePosted >= cutoff)
    .sort((a, b) => a.datePosted - b.datePosted);

  const seen: Record<string, number> = {};
  for (const [id, posted] of Object.entries(prev?.seen ?? {})) {
    if (posted >= cutoff) seen[id] = posted;
  }

  if (!prev) {
    for (const l of candidates) seen[l.id] = l.datePosted;
    return { fresh: [], seen, deferred: false };
  }

  const unseen = candidates.filter((l) => !(l.id in seen));
  const fresh = unseen.slice(0, Math.max(0, budget));
  for (const l of fresh) seen[l.id] = l.datePosted;
  return { fresh, seen, deferred: fresh.length < unseen.length };
}
