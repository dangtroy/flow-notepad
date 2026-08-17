/** Shared, client-safe tag name normalization: one tag per concept. */
export function normalizeTag(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
