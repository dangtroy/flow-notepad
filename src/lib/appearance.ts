/**
 * Appearance is a curated set of choices, never raw CSS. Each choice maps to a
 * small number of CSS variables applied to <html>, so the whole app responds
 * without any component knowing the values.
 */

export type ThemeChoice = "light" | "dark" | "system";
export type AccentKey = "blue" | "teal" | "violet" | "amber" | "rose" | "graphite";
export type TextSize = "small" | "default" | "large";
export type Density = "compact" | "comfortable" | "spacious";
export type ContentWidth = "narrow" | "default" | "wide" | "full";
export type TagStyle = "pill" | "dot" | "text";
export type TagPosition = "right" | "below";
export type SidebarWidth = "narrow" | "default" | "wide";
export type ReplySpacing = "compact" | "comfortable" | "spacious";
export type BorderTone = "subtle" | "medium" | "strong" | "accent";
export type BorderThickness = "hairline" | "thin" | "medium" | "thick";
export type TagSortChoice = "alphabetical" | "most-used" | "manual";

export type Appearance = {
  theme: ThemeChoice;
  accent: AccentKey;
  textSize: TextSize;
  density: Density;
  contentWidth: ContentWidth;
  /** When on, row details stay revealed instead of waiting for hover. */
  alwaysShowDetails: boolean;
  sidebarWidth: SidebarWidth;
  replySpacing: ReplySpacing;
  borderTone: BorderTone;
  borderThickness: BorderThickness;
  tagSort: TagSortChoice;
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "dark",
  accent: "blue",
  textSize: "default",
  density: "comfortable",
  contentWidth: "default",
  alwaysShowDetails: false,
  sidebarWidth: "default",
  replySpacing: "comfortable",
  borderTone: "subtle",
  borderThickness: "hairline",
  tagSort: "alphabetical",
};


export const APPEARANCE_STORAGE_KEY = "flow-appearance";
export const APPEARANCE_EVENT = "flow-appearance";

/** Muted accents only — one quiet colour, tuned per theme. */
export const ACCENTS: Record<AccentKey, { label: string; light: string; dark: string }> = {
  blue: { label: "Blue", light: "oklch(0.53 0.09 232)", dark: "oklch(0.72 0.075 232)" },
  teal: { label: "Teal", light: "oklch(0.52 0.075 190)", dark: "oklch(0.72 0.07 190)" },
  violet: { label: "Violet", light: "oklch(0.52 0.095 295)", dark: "oklch(0.72 0.075 295)" },
  amber: { label: "Amber", light: "oklch(0.58 0.09 70)", dark: "oklch(0.76 0.08 80)" },
  rose: { label: "Rose", light: "oklch(0.55 0.1 18)", dark: "oklch(0.72 0.08 18)" },
  graphite: { label: "Graphite", light: "oklch(0.42 0.01 264)", dark: "oklch(0.78 0.005 264)" },
};

const TEXT_SIZES: Record<TextSize, string> = {
  small: "0.925rem",
  default: "0.9975rem",
  large: "1.075rem",
};

const DENSITY: Record<Density, { line: string; row: string; thread: string; gap: string }> = {
  compact: { line: "1.55", row: "0.3rem", thread: "0.55rem", gap: "0.1rem" },
  comfortable: { line: "1.72", row: "0.55rem", thread: "1.15rem", gap: "0.35rem" },
  spacious: { line: "1.85", row: "0.8rem", thread: "1.9rem", gap: "0.6rem" },
};

const REPLY_SPACING: Record<ReplySpacing, string> = {
  compact: "0.35rem",
  comfortable: "0.9rem",
  spacious: "1.6rem",
};

const BORDER_TONES: Record<BorderTone, { label: string; value: string }> = {
  subtle: { label: "Subtle", value: "var(--border)" },
  medium: { label: "Medium", value: "var(--border-strong)" },
  strong: { label: "Strong", value: "color-mix(in oklab, var(--foreground) 34%, transparent)" },
  accent: { label: "Accent", value: "color-mix(in oklab, var(--primary) 55%, transparent)" },
};

export const BORDER_TONE_LABELS = BORDER_TONES;

const BORDER_THICKNESS: Record<BorderThickness, string> = {
  hairline: "1px",
  thin: "1.5px",
  medium: "2px",
  thick: "3px",
};

const CONTENT_WIDTHS: Record<ContentWidth, string> = {
  narrow: "38rem",
  default: "46rem",
  wide: "58rem",
  full: "100%",
};

const SIDEBAR_WIDTHS: Record<SidebarWidth, string> = {
  narrow: "11.5rem",
  default: "13.5rem",
  wide: "17rem",
};


export function resolveTheme(theme: ThemeChoice): "light" | "dark" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readAppearance(): Appearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return migrateLegacy();
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return { ...DEFAULT_APPEARANCE, ...parsed };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** Earlier versions kept theme in its own key. */
function migrateLegacy(): Appearance {
  const next = { ...DEFAULT_APPEARANCE };
  const theme = window.localStorage.getItem("flow-theme");
  if (theme === "light" || theme === "dark") next.theme = theme;
  return next;
}

export function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  const mode = resolveTheme(appearance.theme);

  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;

  const accent = ACCENTS[appearance.accent] ?? ACCENTS.blue;
  const value = mode === "dark" ? accent.dark : accent.light;
  root.style.setProperty("--primary", value);
  root.style.setProperty("--sidebar-primary", value);
  root.style.setProperty("--ring", value);
  root.style.setProperty("--sidebar-ring", value);

  const density = DENSITY[appearance.density];
  root.style.setProperty("--flow-text-size", TEXT_SIZES[appearance.textSize]);
  root.style.setProperty("--flow-line-height", density.line);
  root.style.setProperty("--flow-row-pad", density.row);
  root.style.setProperty("--flow-thread-gap", density.thread);
  root.style.setProperty("--flow-row-gap", density.gap);
  root.style.setProperty("--flow-content-width", CONTENT_WIDTHS[appearance.contentWidth]);
  root.style.setProperty("--flow-reply-gap", REPLY_SPACING[appearance.replySpacing]);
  root.style.setProperty(
    "--flow-border-color",
    (BORDER_TONES[appearance.borderTone] ?? BORDER_TONES.subtle).value,
  );
  root.style.setProperty(
    "--flow-border-width",
    BORDER_THICKNESS[appearance.borderThickness] ?? BORDER_THICKNESS.hairline,
  );
  root.style.setProperty("--flow-sidebar-width", SIDEBAR_WIDTHS[appearance.sidebarWidth]);
}
