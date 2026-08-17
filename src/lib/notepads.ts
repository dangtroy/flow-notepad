/** Client-safe notepad shapes. A notepad is one continuous, isolated stream. */

export type Notepad = {
  id: string;
  name: string;
  icon: string | null;
  accent: string;
  sort_order: number;
  is_pinned: boolean;
  completed_retention_days: number | null;
  created_at: string;
};

/** A small, quiet set — enough personality without becoming an icon picker. */
export const NOTEPAD_ICONS = [
  "notebook",
  "briefcase",
  "home",
  "lightbulb",
  "hammer",
  "music",
  "heart",
  "plane",
  "book",
  "sparkles",
  "target",
  "coffee",
] as const;

export type NotepadIcon = (typeof NOTEPAD_ICONS)[number];

export function isNotepadIcon(value: unknown): value is NotepadIcon {
  return typeof value === "string" && (NOTEPAD_ICONS as readonly string[]).includes(value);
}

/** Pinned first, then the user's manual order, then creation order. */
export function sortNotepads(notepads: Notepad[]): Notepad[] {
  return [...notepads].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at.localeCompare(b.created_at);
  });
}
