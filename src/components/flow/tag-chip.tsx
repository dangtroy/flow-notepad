import { Link } from "@tanstack/react-router";

import type { FlowTag } from "@/lib/flow.server";
import type { TagStyle } from "@/lib/appearance";
import { tagAccent } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";

/**
 * The canonical stream tag. A tag is machine-written, so it speaks in the
 * machine voice: mono, in the AI tone. The entity's own colour appears only as
 * the dot — never as the text, never as a fill. Links to that tag's view.
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
        "inline-flex items-center gap-1.5 font-mono text-micro leading-none tracking-[0.01em] text-ai transition-opacity hover:opacity-80",
        className,
      )}
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

  // The one variant that deliberately trades the dot for colour-coded text.
  if (style === "text") {
    return (
      <span
        className={cn("font-mono text-micro leading-none tracking-[0.01em]", className)}
        style={{ color: `color-mix(in oklab, ${accent} 55%, var(--ai))` }}
      >
        {tag.name}
      </span>
    );
  }

  if (style === "dot") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono text-micro leading-none tracking-[0.01em] text-ai",
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
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-[2px] font-mono text-micro leading-none tracking-[0.01em] text-ai",
        className,
      )}
      style={{ borderColor: `color-mix(in oklab, ${accent} 32%, transparent)` }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      {tag.name}
    </span>
  );
}
