import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pin, Plus } from "lucide-react";
import { toast } from "sonner";

import { NOTEPAD_ICONS, type NotepadIcon } from "@/lib/notepads";
import { NotepadGlyph } from "@/lib/notepad-icons";
import { TAG_COLOR_KEYS, tagAccent } from "@/lib/tag-colors";
import { useNotepads } from "@/lib/use-notepad";
import { cn } from "@/lib/utils";

/**
 * The quiet way between streams: name of the current notepad, one tap to change.
 * Nothing about switching asks the user to configure anything.
 */
export function NotepadSwitcher({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { notepads, activeId, active, switchTo, create } = useNotepads();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<NotepadIcon>("notebook");
  const [accent, setAccent] = useState<string>("slate");
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await create({ name: trimmed, icon, accent });
      setName("");
      setCreating(false);
      setOpen(false);
      onNavigate?.();
      toast.success(`${trimmed} is ready`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create that notepad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Switch notepad"
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: tagAccent(active?.accent ?? "slate") }}
        />
        <span className="min-w-0 flex-1 truncate text-left text-foreground">{active?.name ?? "Flow"}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-1 w-60 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl">
          <div className="max-h-64 overflow-y-auto">
            {notepads.map((notepad) => (
              <button
                key={notepad.id}
                type="button"
                onClick={() => {
                  switchTo(notepad.id);
                  setOpen(false);
                  onNavigate?.();
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  notepad.id === activeId && "text-foreground",
                )}
              >
                <NotepadGlyph
                  icon={notepad.icon}
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: tagAccent(notepad.accent) }}
                />
                <span className="min-w-0 flex-1 truncate">{notepad.name}</span>
                {notepad.is_pinned ? <Pin className="h-3 w-3 shrink-0 opacity-50" /> : null}
                {notepad.id === activeId ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            ))}
          </div>

          <div className="mt-1 border-t border-border pt-1">
            {creating ? (
              <div className="space-y-2 px-3 py-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleCreate();
                    if (event.key === "Escape") setCreating(false);
                  }}
                  placeholder="Notepad name"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-[13px] outline-none focus:border-ring"
                />
                <div className="flex flex-wrap gap-1">
                  {NOTEPAD_ICONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setIcon(option)}
                      aria-label={option}
                      aria-pressed={icon === option}
                      className={cn(
                        "rounded p-1 text-muted-foreground hover:text-foreground",
                        icon === option && "bg-sidebar-accent text-foreground",
                      )}
                    >
                      <NotepadGlyph icon={option} className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {TAG_COLOR_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAccent(key)}
                      aria-label={key}
                      aria-pressed={accent === key}
                      className={cn(
                        "h-4 w-4 rounded-full border border-transparent",
                        accent === key && "border-foreground/60",
                      )}
                      style={{ backgroundColor: tagAccent(key) }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  disabled={busy || !name.trim()}
                  onClick={() => void handleCreate()}
                  className="w-full rounded-md bg-primary px-2 py-1.5 text-[13px] text-primary-foreground disabled:opacity-50"
                >
                  Create notepad
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                New notepad
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
