import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NotepadGlyph } from "@/lib/notepad-icons";
import { STREAM_VIEWS } from "./stream-top-bar";
import { tagAccent } from "@/lib/tag-colors";
import { useNotepads } from "@/lib/use-notepad";
import { useTags } from "@/lib/use-tags";

/** Labels read in the user's voice; shortcuts and hints in the machine's. */
const itemClass =
  "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] aria-selected:bg-accent-quiet aria-selected:text-primary";
const hintClass = "ml-auto font-mono text-micro tracking-[0.01em] text-ai-muted";

/**
 * One way into everything: search the stream, jump to a tag, switch view, or
 * change notepad. Opened with ⌘K from anywhere in the app.
 */
export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const tags = useTags();
  const { notepads, activeId, switchTo } = useNotepads();
  const [term, setTerm] = useState("");

  // Every open starts from a clean prompt rather than the last thing typed.
  useEffect(() => {
    if (open) setTerm("");
  }, [open]);

  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  const trimmed = term.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-lg border-border bg-surface p-0 shadow-float">
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        <Command
          // Names are the point here; cmdk's fuzzy pass is too eager on them.
          filter={(value, search) =>
            value.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder="Search notes, jump to a tag, switch view…"
            className="text-[13px]"
          />
          <CommandList className="max-h-[22rem] p-2">
            <CommandEmpty className="px-2 py-6 text-center text-[13px] text-muted-foreground">
              Nothing matches that.
            </CommandEmpty>

            {/* Free text is always offered as a search, never filtered away. */}
            {trimmed && (
              <CommandGroup>
                <CommandItem
                  forceMount
                  value={`search ${trimmed}`}
                  // Search narrows whatever view is open, as the top bar does.
                  onSelect={() =>
                    run(() =>
                      void navigate({
                        to: "/",
                        search: (prev) => ({ ...prev, q: trimmed }),
                      }),
                    )
                  }
                  className={itemClass}
                >
                  <Search className="h-3.5 w-3.5 shrink-0 [stroke-width:1.5]" />
                  <span className="min-w-0 truncate">
                    Search notes for “{trimmed}”
                  </span>
                  <span className={hintClass}>enter</span>
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup heading="Views">
              {STREAM_VIEWS.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`view ${option.label}`}
                  // Same normalisation the view tabs use: "all" is the absence
                  // of a view, and everything else in the URL is kept.
                  onSelect={() =>
                    run(() =>
                      void navigate({
                        to: "/",
                        search: (prev) => ({
                          ...prev,
                          view: option.value === "all" ? undefined : option.value,
                        }),
                      }),
                    )
                  }
                  className={itemClass}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  <span className={hintClass}>view</span>
                </CommandItem>
              ))}
            </CommandGroup>

            {(tags.data ?? []).length > 0 && (
              <CommandGroup heading="Tags">
                {(tags.data ?? []).map((tag) => (
                  <CommandItem
                    key={tag.id}
                    value={`tag ${tag.name}`}
                    onSelect={() =>
                      run(() => void navigate({ to: "/", search: { tags: tag.id } }))
                    }
                    className={itemClass}
                  >
                    <span
                      aria-hidden
                      className="h-[5px] w-[5px] shrink-0 rounded-full"
                      style={{ backgroundColor: tagAccent(tag.color) }}
                    />
                    <span className="min-w-0 truncate font-mono text-micro tracking-[0.01em] text-ai">
                      {tag.name}
                    </span>
                    <span className={hintClass}>{tag.message_count}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {notepads.length > 1 && (
              <CommandGroup heading="Notepads">
                {notepads.map((notepad) => (
                  <CommandItem
                    key={notepad.id}
                    value={`notepad ${notepad.name}`}
                    onSelect={() => run(() => switchTo(notepad.id))}
                    className={itemClass}
                  >
                    <NotepadGlyph
                      icon={notepad.icon}
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: tagAccent(notepad.accent) }}
                    />
                    <span className="min-w-0 truncate">{notepad.name}</span>
                    {notepad.id === activeId && <span className={hintClass}>current</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** ⌘K from anywhere, without every view wiring up its own listener. */
export function useCommandMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen((value) => !value);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen };
}
