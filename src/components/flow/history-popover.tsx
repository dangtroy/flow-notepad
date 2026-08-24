import { useState } from "react";
import { History } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listMessageRevisions, revertMessage } from "@/lib/flow.functions";
import { htmlToText } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function replacedLabel(iso: string) {
  const then = new Date(iso).getTime();
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 36) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / (60 * 24))}d ago`;
}

/**
 * A note's past versions, newest first. History is captured in the database on
 * every content change, so this only reads and restores — restoring writes the
 * old text forward as a new version rather than rewinding.
 */
export function HistoryPopover({
  messageId,
  className,
  onOpenChange,
}: {
  messageId: string;
  className?: string;
  /** Lets the row keep its controls revealed while the panel is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  function change(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }
  const queryClient = useQueryClient();
  const loadRevisions = useServerFn(listMessageRevisions);
  const revert = useServerFn(revertMessage);

  const revisions = useQuery({
    queryKey: ["message-revisions", messageId] as const,
    queryFn: () => loadRevisions({ data: { id: messageId } }),
    enabled: open,
    staleTime: 0,
  });

  const restore = useMutation({
    mutationFn: (revision: number) => revert({ data: { id: messageId, revision } }),
    onSuccess: () => {
      change(false);
      void queryClient.invalidateQueries({ queryKey: ["message-revisions", messageId] });
      void queryClient.invalidateQueries({ queryKey: ["stream"] });
      void queryClient.invalidateQueries({ queryKey: ["pinned"] });
      void queryClient.invalidateQueries({ queryKey: ["reference"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const rows = revisions.data ?? [];

  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          aria-label="Version history"
          title="Version history"
          className={className}
        >
          <History className="h-4 w-4 [stroke-width:1.3]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        onClick={(event) => event.stopPropagation()}
        className="max-h-80 w-80 overflow-y-auto p-1 text-[12.5px]"
      >
        <div className="px-2 py-1.5 text-[11px] tracking-wide text-muted-foreground/70">
          Previous versions
        </div>

        {revisions.isLoading && (
          <div className="px-2 py-1.5 text-muted-foreground/70">Loading…</div>
        )}

        {!revisions.isLoading && rows.length === 0 && (
          <div className="px-2 py-1.5 text-muted-foreground/70">No earlier versions.</div>
        )}

        {rows.map((row) => {
          const text = row.content_html ? htmlToText(row.content_html) : row.content;
          return (
            <div key={row.id} className="rounded-md px-2 py-1.5 hover:bg-elevated">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] tabular-nums text-muted-foreground/60">
                  replaced {replacedLabel(row.created_at)}
                </span>
                <button
                  type="button"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(row.revision_number)}
                  className={cn(
                    "text-[11px] text-muted-foreground transition-colors hover:text-foreground",
                    restore.isPending && "opacity-50",
                  )}
                >
                  Restore
                </button>
              </div>
              <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-muted-foreground">
                {text}
              </p>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
