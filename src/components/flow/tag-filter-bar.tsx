import type { FlowTagDetail } from "@/lib/flow.server";
import type { FilterMode } from "@/lib/tag-filter";
import { tagAccent } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";

/**
 * A filter layer over the one conversation — always reachable while scrolling.
 * "All" is the resting state and is never more than one click away.
 */
export function TagFilterBar({
  tags,
  selected,
  mode,
  onToggle,
  onClear,
  onModeChange,
}: {
  tags: FlowTagDetail[];
  selected: string[];
  mode: FilterMode;
  onToggle: (id: string) => void;
  onClear: () => void;
  onModeChange: (mode: FilterMode) => void;
}) {
  const active = new Set(selected);
  const activeTags = tags.filter((tag) => active.has(tag.id));

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto w-full max-w-[46rem] px-5 sm:px-8">
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={onClear}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-[12px] transition-colors duration-150",
              active.size === 0
                ? "border-border-strong bg-elevated text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            All
          </button>

          {tags.map((tag) => {
            const isActive = active.has(tag.id);
            const accent = tagAccent(tag.color);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggle(tag.id)}
                aria-pressed={isActive}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors duration-150",
                  isActive
                    ? "text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                  !tag.is_enabled && "opacity-55",
                )}
                style={
                  isActive
                    ? {
                        borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`,
                        backgroundColor: `color-mix(in oklab, ${accent} 12%, transparent)`,
                      }
                    : undefined
                }
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: accent }}
                />
                {tag.name}
                <span className="text-muted-foreground/60">{tag.message_count}</span>
              </button>
            );
          })}
        </div>

        {activeTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-[11px] text-muted-foreground">
            <span>
              {activeTags.map((tag) => tag.name).join(mode === "and" ? " + " : " · ")} ·{" "}
              {activeTags.length === 1
                ? `${activeTags[0]?.message_count ?? 0} messages`
                : "filtered view"}
            </span>
            {activeTags.length > 1 && (
              <span className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onModeChange("or")}
                  className={cn(
                    "rounded px-1.5 py-0.5 transition-colors",
                    mode === "or" ? "bg-elevated text-foreground" : "hover:text-foreground",
                  )}
                >
                  Any
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange("and")}
                  className={cn(
                    "rounded px-1.5 py-0.5 transition-colors",
                    mode === "and" ? "bg-elevated text-foreground" : "hover:text-foreground",
                  )}
                >
                  All of
                </button>
              </span>
            )}
            <button type="button" onClick={onClear} className="transition-colors hover:text-foreground">
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
