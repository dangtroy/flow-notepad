import { PanelRight, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export type StreamView = "all" | "today" | "tasks" | "pinned" | "reference";

export const STREAM_VIEWS: Array<{ value: StreamView; label: string }> = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "tasks", label: "Tasks" },
  { value: "pinned", label: "Pinned" },
  { value: "reference", label: "Reference" },
];

/**
 * One header row above the stream: search within the active view and the four
 * view tabs with their counts. The attention rail hides itself from its own
 * header on wide screens, so the only trigger here is the small-screen one.
 */
export function StreamTopBar({
  view,
  onViewChange,
  counts,
  query,
  onQueryChange,
  attentionCount,
  onOpenPanel,
}: {
  view: StreamView;
  onViewChange: (view: StreamView) => void;
  counts: Record<StreamView, number>;
  query: string;
  onQueryChange: (query: string) => void;
  /** Reminders + pinned: shown on the small-screen panel trigger. */
  attentionCount: number;
  onOpenPanel: () => void;
}) {
  return (
    <div className="border-b border-border bg-surface/40 px-5 py-3 sm:px-8">
      <div className="flow-shell flex flex-wrap items-center gap-3">
        <div className="relative order-1 min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search notes, tags..."
            aria-label="Search notes"
            className="w-full rounded-md border border-border bg-background/50 py-1.5 pl-8 pr-14 text-[12.5px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/50"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        <div className="order-3 flex items-center gap-1 sm:order-2">
          {STREAM_VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onViewChange(option.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10.5px] uppercase tracking-[0.14em] transition-colors duration-150",
                view === option.value
                  ? "border-transparent bg-accent-quiet text-primary"
                  : "border-transparent text-muted-foreground/60 hover:text-foreground",
              )}
            >
              {option.label}
              <span className="rounded-full bg-elevated px-1.5 py-0.5 font-mono text-micro tracking-normal tabular-nums text-ai-muted">
                {counts[option.value]}
              </span>
            </button>
          ))}
        </div>

        {/* Small screens have no rail, so this is the only way in. */}
        <button
          type="button"
          onClick={onOpenPanel}
          aria-label="Show attention panel"
          title="Needs attention"
          className="order-2 flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-[11px] text-muted-foreground/70 transition-colors duration-150 hover:text-foreground sm:order-3 lg:hidden"
        >
          <PanelRight className="h-3.5 w-3.5" />
          {attentionCount > 0 && (
            <span className="rounded-full bg-elevated px-1.5 py-0.5 font-mono text-micro tabular-nums text-ai-muted">
              {attentionCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
