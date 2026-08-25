import { PanelRight } from "lucide-react";

export type StreamView = "all" | "today" | "tasks" | "pinned" | "reference";

export const STREAM_VIEWS: Array<{ value: StreamView; label: string }> = [
  { value: "all", label: "Notes" },
  { value: "today", label: "Today" },
  { value: "tasks", label: "Tasks" },
  { value: "pinned", label: "Pinned" },
  { value: "reference", label: "References" },
];

/**
 * Views and search now live in the sidebar, so the stream header carries only
 * the small-screen way into the attention panel.
 */
export function StreamTopBar({
  attentionCount,
  onOpenPanel,
}: {
  /** Reminders + pinned: shown on the small-screen panel trigger. */
  attentionCount: number;
  onOpenPanel: () => void;
}) {
  return (
    <div className="flex justify-end px-5 pt-3 sm:px-8 lg:hidden">
      <button
        type="button"
        onClick={onOpenPanel}
        aria-label="Show attention panel"
        title="Needs attention"
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground/70 transition-colors duration-150 hover:text-foreground"
      >
        <PanelRight className="h-3.5 w-3.5" />
        {attentionCount > 0 && (
          <span className="rounded-full bg-elevated px-1.5 py-0.5 font-mono text-micro tabular-nums text-ai-muted">
            {attentionCount}
          </span>
        )}
      </button>
    </div>
  );
}
