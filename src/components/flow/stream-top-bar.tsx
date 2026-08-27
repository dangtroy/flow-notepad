import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
 * Views and search live in the sidebar, so the stream contributes only the
 * small-screen way into the attention panel — rendered into the app header's
 * right slot so phones keep one bare header instead of two stacked bars.
 */
export function StreamTopBar({
  attentionCount,
  onOpenPanel,
}: {
  /** Reminders + pinned: shown on the small-screen panel trigger. */
  attentionCount: number;
  onOpenPanel: () => void;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById("flow-header-right"));
  }, []);

  const trigger = (
    <button
      type="button"
      onClick={onOpenPanel}
      aria-label="Show attention panel"
      title="Needs attention"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-foreground"
    >
      <PanelRight className="h-4 w-4" />
      {attentionCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
      )}
    </button>
  );

  if (slot) return createPortal(trigger, slot);

  return <div className="flex justify-end px-4 pt-2 lg:hidden">{trigger}</div>;
}
