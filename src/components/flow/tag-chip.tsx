import { Link } from "@tanstack/react-router";

import type { FlowTag } from "@/lib/flow.server";
import type { TagStyle } from "@/lib/appearance";
import { tagAccent } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";

/**
 * The canonical stream tag: a small entity dot, then the name in the entity's
 * own colour. No pill, no border — and it links to that tag's filtered view.
 */
export function TagLink({ tag, className }: { tag: FlowTag; className?: string }) {
  const accent = tagAccent(tag.color);

  return (
    <Link
      to="/"
      search={{ tags: tag.id }}
      onClick={(event) => event.stopPropagation()}
      title={`Show only ${tag.name}`}
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[11px] leading-none tracking-tight transition-opacity hover:opacity-80",
        className,
      )}
      style={{ color: accent }}
    >
      <span
        aria-hidden
        className="h-[5px] w-[5px] shrink-0 rounded-full"
        style={{ backgroundColor: accent }}
      />
      {tag.name}
    </Link>
  );
}

/** Secondary to the message: the tag colour is a quiet accent, never a badge. */
export function TagChip({
  tag,
  style = "pill",
  className,
}: {
  tag: FlowTag;
  style?: TagStyle;
  className?: string;
}) {
  const accent = tagAccent(tag.color);

  if (style === "text") {
    return (
      <span
        className={cn("text-[11px] leading-none text-muted-foreground/80", className)}
        style={{ color: `color-mix(in oklab, ${accent} 55%, var(--muted-foreground))` }}
      >
        {tag.name}
      </span>
    );
  }

  if (style === "dot") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px] leading-none text-muted-foreground",
          className,
        )}
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

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[11px] leading-none text-muted-foreground",
        className,
      )}
      style={{ borderColor: `color-mix(in oklab, ${accent} 32%, transparent)` }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      {tag.name}
    </span>
  );
}
