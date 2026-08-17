import type { FlowTag } from "@/lib/flow.server";
import { tagAccent } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";

/** Secondary to the message: a small pill with the tag color as a quiet accent. */
export function TagChip({ tag, className }: { tag: FlowTag; className?: string }) {
  const accent = tagAccent(tag.color);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[11px] leading-none text-muted-foreground",
        className,
      )}
      style={{ borderColor: `color-mix(in oklab, ${accent} 32%, transparent)` }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: accent }}
      />
      {tag.name}
    </span>
  );
}
