import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  applyTagSuggestion,
  ignoreTagSuggestion,
  listTagSuggestions,
  resolveAllTagSuggestions,
} from "@/lib/flow.functions";
import { LEARN_MODES, type LearnMode, type TagSuggestion } from "@/lib/suggestions";
import { tagsKey } from "@/lib/use-tags";
import { useActiveNotepadId } from "@/lib/use-notepad";
import { cn } from "@/lib/utils";

export const SUGGESTIONS_KEY = ["tag-suggestions"] as const;

/**
 * The quiet half of organizing: anything Flow is unsure about waits here.
 * Nothing in this panel has changed the user's tags yet.
 */
export function SuggestionsBell() {
  const queryClient = useQueryClient();
  const notepadId = useActiveNotepadId();
  const fetchSuggestions = useServerFn(listTagSuggestions);
  const apply = useServerFn(applyTagSuggestion);
  const ignore = useServerFn(ignoreTagSuggestion);
  const resolveAll = useServerFn(resolveAllTagSuggestions);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const suggestions = useQuery({
    queryKey: [...SUGGESTIONS_KEY, notepadId ?? "none"],
    queryFn: () => fetchSuggestions({ data: { notepadId } }),
    refetchInterval: 90_000,
    enabled: Boolean(notepadId),
  });

  const list = suggestions.data ?? [];
  const count = list.length;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
    void queryClient.invalidateQueries({ queryKey: tagsKey(notepadId) });
    void queryClient.invalidateQueries({ queryKey: ["stream"] });
  }

  async function handleApply(suggestion: TagSuggestion, learnMode: LearnMode) {
    setBusy(true);
    try {
      const { applied } = await apply({ data: { id: suggestion.id, learnMode, notepadId } });
      toast.success(
        `${suggestion.name} applied to ${applied} ${applied === 1 ? "note" : "notes"}`,
      );
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply that suggestion");
    } finally {
      setBusy(false);
    }
  }

  async function handleIgnore(suggestion: TagSuggestion) {
    setBusy(true);
    try {
      await ignore({ data: { id: suggestion.id } });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleAll(action: "apply" | "ignore") {
    setBusy(true);
    try {
      const { resolved } = await resolveAll({ data: { notepadId, action, learnMode: "suggest" } });
      toast.success(
        action === "apply" ? `Applied ${resolved} suggestions` : `Dismissed ${resolved} suggestions`,
      );
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={count ? `${count} tag suggestions` : "Tag suggestions"}
        className="relative inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-foreground"
      >
        <Bell className="h-3.5 w-3.5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[1rem] rounded-full bg-primary px-1 text-center text-[10px] font-medium leading-4 text-primary-foreground">
            {count}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[21rem] p-0">
        <div className="flex items-center justify-between border-b border-border/70 px-3.5 py-2.5">
          <div>
            <p className="text-[13px] font-medium">New tags</p>
            <p className="text-[11px] text-muted-foreground">Approve to add these to your tags.</p>
          </div>
          {count > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleAll("apply")}
                className="hover:text-foreground"
              >
                Apply all
              </button>
              <span aria-hidden>·</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleAll("ignore")}
                className="hover:text-foreground"
              >
                Ignore all
              </button>
            </div>
          )}
        </div>

        <div className="max-h-[24rem] overflow-y-auto">
          {count === 0 && (
            <p className="px-3.5 py-6 text-[13px] leading-relaxed text-muted-foreground">
              No new tags to review. Flow only proposes one when a topic keeps coming back and none
              of your tags covers it. Tags you already have are confirmed on the note itself.
            </p>
          )}

          {list.map((suggestion) => (
            <SuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              busy={busy}
              onApply={handleApply}
              onIgnore={handleIgnore}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SuggestionRow({
  suggestion,
  busy,
  onApply,
  onIgnore,
}: {
  suggestion: TagSuggestion;
  busy: boolean;
  onApply: (suggestion: TagSuggestion, learnMode: LearnMode) => Promise<void>;
  onIgnore: (suggestion: TagSuggestion) => Promise<void>;
}) {
  const [choosing, setChoosing] = useState(false);

  return (
    <div className="border-b border-border/50 px-3.5 py-3 last:border-b-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-foreground">{suggestion.name}</p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground/80">
            {`New tag${suggestion.concept_kind !== "other" ? ` (${suggestion.concept_kind})` : ""} · `}
            {suggestion.message_count} {suggestion.message_count === 1 ? "note" : "notes"}
            {suggestion.suggested_group_name ? ` · group: ${suggestion.suggested_group_name}` : ""}
          </p>
          {suggestion.reason && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              {suggestion.reason}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => setChoosing((value) => !value)}
            aria-label={`Apply ${suggestion.name}`}
            className="rounded p-1 text-muted-foreground hover:bg-elevated hover:text-foreground"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onIgnore(suggestion)}
            aria-label={`Ignore ${suggestion.name}`}
            className="rounded p-1 text-muted-foreground hover:bg-elevated hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Accepting is also a chance to teach Flow how to treat this next time. */}
      {choosing && (
        <div className="mt-2.5 space-y-1">
          {LEARN_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              disabled={busy}
              onClick={() => {
                setChoosing(false);
                void onApply(suggestion, mode.value);
              }}
              className={cn(
                "w-full rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors",
                "hover:bg-elevated",
              )}
            >
              <span className="font-medium text-foreground">{mode.label}</span>
              <span className="block text-[11px] text-muted-foreground">{mode.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
