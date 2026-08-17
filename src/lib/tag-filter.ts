/** Same normalization as the server, kept client-safe. */
function normalizeTag(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type FilterMode = "or" | "and";

/**
 * The filter lives in the URL so the sidebar, the top filter bar, and a reload
 * can never disagree about what is being shown.
 */
export type StreamSearch = { tags?: string; mode?: FilterMode };

export function parseStreamSearch(search: Record<string, unknown>): {
  tags: string;
  mode: FilterMode;
} {
  const raw = typeof search["tags"] === "string" ? (search["tags"] as string) : "";
  const mode = search["mode"] === "and" ? "and" : "or";
  return { tags: raw, mode };
}

export function tagIdsFrom(tags: string | undefined): string[] {
  return (tags ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function tagsParam(ids: string[]): string | undefined {
  return ids.length ? ids.join(",") : undefined;
}

export function toggleTagId(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
}

/**
 * Discourages near-duplicate tags (Travel / Trips / Vacation Planning) by
 * suggesting an existing tag — the user always decides, nothing merges itself.
 */
export function findSimilarTag<T extends { id: string; name: string }>(
  name: string,
  tags: T[],
): T | null {
  const candidate = normalizeTag(name);
  if (!candidate) return null;

  for (const tag of tags) {
    const existing = normalizeTag(tag.name);
    if (!existing) continue;
    if (existing === candidate) return tag;
    if (existing.startsWith(candidate) || candidate.startsWith(existing)) return tag;
    if (singular(existing) === singular(candidate)) return tag;

    const shared = new Set(existing.split(" ").filter((w) => w.length > 3));
    if (candidate.split(" ").some((word) => word.length > 3 && shared.has(word))) return tag;
  }
  return null;
}

function singular(value: string): string {
  return value.endsWith("s") ? value.slice(0, -1) : value;
}
