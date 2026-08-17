import { useState } from "react";
import { ChevronDown, ChevronUp, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { NotepadGlyph } from "@/lib/notepad-icons";
import { NOTEPAD_ICONS } from "@/lib/notepads";
import { TAG_COLOR_KEYS, tagAccent } from "@/lib/tag-colors";
import { useNotepads } from "@/lib/use-notepad";
import { cn } from "@/lib/utils";

/**
 * Notepads are the top level of Flow: rename, reorder, pin, delete. Deleting one
 * takes its whole stream with it, so it asks first.
 */
export function NotepadsSettings() {
  const { notepads, activeId, switchTo, update, remove, reorder } = useNotepads();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function saveName(id: string) {
    const name = draftName.trim();
    setEditingId(null);
    if (!name) return;
    try {
      await update({ id, name });
    } catch {
      toast.error("Could not rename that notepad");
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const ids = notepads.map((notepad) => notepad.id);
    const index = ids.indexOf(id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    try {
      await reorder(ids);
    } catch {
      toast.error("Could not reorder your notepads");
    }
  }

  async function handleDelete(id: string, name: string) {
    setConfirmId(null);
    try {
      await remove(id);
      toast.success(`${name} deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete that notepad");
    }
  }

  return (
    <section className="mt-14">
      <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Notepads
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        Each notepad is its own continuous stream, with its own notes, tags and organizing rules.
      </p>

      <ul className="mt-5 space-y-2">
        {notepads.map((notepad, index) => (
          <li
            key={notepad.id}
            className={cn(
              "rounded-lg border border-border px-3 py-2.5",
              notepad.id === activeId && "border-primary/50",
            )}
          >
            <div className="flex items-center gap-2">
              <NotepadGlyph
                icon={notepad.icon}
                className="h-4 w-4 shrink-0"
                style={{ color: tagAccent(notepad.accent) }}
              />

              {editingId === notepad.id ? (
                <input
                  autoFocus
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={() => void saveName(notepad.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveName(notepad.id);
                    if (event.key === "Escape") setEditingId(null);
                  }}
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:border-ring"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(notepad.id);
                    setDraftName(notepad.name);
                  }}
                  className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
                >
                  {notepad.name}
                </button>
              )}

              <button
                type="button"
                onClick={() => switchTo(notepad.id)}
                className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground"
              >
                {notepad.id === activeId ? "Open" : "Switch"}
              </button>
              <button
                type="button"
                onClick={() => void update({ id: notepad.id, isPinned: !notepad.is_pinned })}
                aria-label={notepad.is_pinned ? "Unpin notepad" : "Pin notepad"}
                className="shrink-0 text-muted-foreground/70 hover:text-foreground"
              >
                {notepad.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => void move(notepad.id, -1)}
                disabled={index === 0}
                aria-label="Move up"
                className="shrink-0 text-muted-foreground/70 hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void move(notepad.id, 1)}
                disabled={index === notepads.length - 1}
                aria-label="Move down"
                className="shrink-0 text-muted-foreground/70 hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmId(notepad.id)}
                disabled={notepads.length <= 1}
                aria-label="Delete notepad"
                className="shrink-0 text-muted-foreground/70 hover:text-destructive disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1">
              {NOTEPAD_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => void update({ id: notepad.id, icon })}
                  aria-label={`Use ${icon} icon`}
                  aria-pressed={notepad.icon === icon}
                  className={cn(
                    "rounded p-1 text-muted-foreground/70 hover:text-foreground",
                    notepad.icon === icon && "bg-elevated text-foreground",
                  )}
                >
                  <NotepadGlyph icon={icon} className="h-3.5 w-3.5" />
                </button>
              ))}
              <span aria-hidden className="mx-1 h-4 w-px bg-border" />
              {TAG_COLOR_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void update({ id: notepad.id, accent: key })}
                  aria-label={`Use ${key} accent`}
                  aria-pressed={notepad.accent === key}
                  className={cn(
                    "h-4 w-4 rounded-full border border-transparent",
                    notepad.accent === key && "border-foreground/60",
                  )}
                  style={{ backgroundColor: tagAccent(key) }}
                />
              ))}
            </div>

            {confirmId === notepad.id && (
              <div className="mt-3 rounded-md border border-destructive/40 px-3 py-2 text-[13px] text-muted-foreground">
                Deleting <span className="text-foreground">{notepad.name}</span> permanently removes
                its notes, tags and rules.
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDelete(notepad.id, notepad.name)}
                    className="rounded-md bg-destructive px-3 py-1 text-destructive-foreground"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="rounded-md border border-border px-3 py-1"
                  >
                    Keep it
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
