/**
 * Tag colors are stored on the tag row (a palette key, not a raw CSS value) so
 * appearance stays a data property the user can change, never hardcoded per tag.
 * The palette is deliberately muted — accents, not badges.
 */
export type TagColorKey =
  | "slate"
  | "orange"
  | "blue"
  | "green"
  | "purple"
  | "rose"
  | "amber"
  | "teal";

export const TAG_COLORS: Record<TagColorKey, { label: string; accent: string }> = {
  slate: { label: "Slate", accent: "oklch(0.68 0.02 250)" },
  orange: { label: "Orange", accent: "oklch(0.7 0.09 55)" },
  blue: { label: "Blue", accent: "oklch(0.68 0.08 245)" },
  green: { label: "Green", accent: "oklch(0.7 0.07 150)" },
  purple: { label: "Purple", accent: "oklch(0.68 0.07 300)" },
  rose: { label: "Rose", accent: "oklch(0.7 0.08 15)" },
  amber: { label: "Amber", accent: "oklch(0.75 0.08 85)" },
  teal: { label: "Teal", accent: "oklch(0.7 0.07 195)" },
};

export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS) as TagColorKey[];

export const DEFAULT_TAG_COLOR: TagColorKey = "slate";

export function tagColorKey(color: string | null | undefined): TagColorKey {
  return color && color in TAG_COLORS ? (color as TagColorKey) : DEFAULT_TAG_COLOR;
}

/** True when the stored value is a free-form CSS colour rather than a preset key. */
export function isCustomColor(color: string | null | undefined): color is string {
  if (!color) return false;
  if (color in TAG_COLORS) return false;
  const value = color.trim();
  return (
    /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ||
    /^(?:rgb|rgba|hsl|hsla|oklch|oklab|lch|lab|color)\(/i.test(value)
  );
}

/** Custom hex/CSS colours are honoured as-is; anything unknown falls back to the palette. */
export function tagAccent(color: string | null | undefined): string {
  if (isCustomColor(color)) return color.trim();
  return TAG_COLORS[tagColorKey(color)].accent;
}

/** A hex value suitable for <input type="color">, derived from the current colour. */
export function tagColorHex(color: string | null | undefined): string {
  if (isCustomColor(color) && color.trim().startsWith("#")) return color.trim().slice(0, 7);
  return "#8a8f98";
}

/** Stable, tasteful default so a brand-new tag never arrives colorless. */
export function pickDefaultTagColor(normalizedName: string): TagColorKey {
  let hash = 0;
  for (let i = 0; i < normalizedName.length; i++) {
    hash = (hash * 31 + normalizedName.charCodeAt(i)) % 100000;
  }
  return TAG_COLOR_KEYS[hash % TAG_COLOR_KEYS.length] ?? DEFAULT_TAG_COLOR;
}
