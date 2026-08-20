import { useMemo, useState } from "react";
import { ArrowLeftRight, Pencil, Trash2 } from "lucide-react";

import type { TagStyle } from "@/lib/appearance";
import type { FlowMessage } from "@/lib/flow.server";
import { sanitizeHtml, textToHtml } from "@/lib/rich-text";
import { cn, timeAgo } from "@/lib/utils";
import { MessageEditor } from "./message";
import { TagChip } from "./tag-chip";

type Group = { key: string; label: string; notes: FlowMessage[] };

/**
 * Reference notes are grouped by tag, alphabetically, with untagged notes last —
 * the same convention the sidebar uses for ungrouped tags. A note with several
 * tags appears under each of them; it's never deduplicated away from a group.
 */
export function groupReferenceNotes(notes: FlowMessage[]): Group[] {
  const byTag = new Map<string, Group>();
  const general: FlowMessage[] = [];

  for (const note of notes) {
    if (!note.tags.length) {
      general.push(note);
      continue;
    }
    for (const tag of note.tags) {
      const group = byTag.get(tag.id) ?? { key: tag.id, label: tag.name, notes: [] };
      group.notes.push(note);
      byTag.set(tag.id, group);
    }
  }

  const groups = [...byTag.values()].sort((a, b) => a.label.localeCompare(b.label));
  for (const group of groups) group.notes.sort(recent);
  if (general.length) {
    general.sort(recent);
    groups.push({ key: "general", label: "General", notes: general });
  }
  return groups;
}

function recent(a: FlowMessage, b: FlowMessage) {
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

export function ReferenceList({
  notes,
  isPending,
  tagStyle = "dot",
  onSaveEdit,
  onMoveToStream,
  onDelete,
}: {
  notes: FlowMessage[];
  isPending?: boolean;
  tagStyle?: TagStyle | undefined;
  onSaveEdit: (id: string, html: string) => void;
  onMoveToStream: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const groups = useMemo(() => groupReferenceNotes(notes), [notes]);

  if (isPending) {
    return <p className="py-10 text-center text-[13px] text-muted-foreground/60">Loading…</p>;
  }

  if (!groups.length) {
    return (
      <p className="py-16 text-center text-[13px] leading-relaxed text-muted-foreground/70">
        Nothing kept here yet. Save a thought as Reference and it lives here, grouped by tag.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground/55">
            {group.label}
          </h2>
          <div className="divide-y divide-border/50 border-t border-border/50">
            {group.notes.map((note) => (
              <ReferenceRow
                key={`${group.key}-${note.id}`}
                note={note}
                tagStyle={tagStyle}
                isEditing={editingId === note.id}
                onStartEdit={() => setEditingId(note.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={(html) => {
                  setEditingId(null);
                  onSaveEdit(note.id, html);
                }}
                onMoveToStream={() => onMoveToStream(note.id)}
                onDelete={() => onDelete(note.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ReferenceRow({
  note,
  tagStyle,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onMoveToStream,
  onDelete,
}: {
  note: FlowMessage;
  tagStyle: TagStyle;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (html: string) => void;
  onMoveToStream: () => void;
  onDelete: () => void;
}) {
  const html = useMemo(
    () => sanitizeHtml(note.content_html ?? textToHtml(note.content)),
    [note.content_html, note.content],
  );

  function handleSurfaceClick(event: React.MouseEvent<HTMLElement>) {
    if (isEditing) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, label")) return;
    if (window.getSelection()?.toString()) return;
    onStartEdit();
  }

  return (
    <article
      onClick={handleSurfaceClick}
      className={cn(
        "group relative -mx-3 rounded-md px-3 py-2.5 transition-colors duration-200",
        !isEditing && "cursor-text hover:bg-surface/55",
        isEditing && "bg-surface",
      )}
    >
      {isEditing ? (
        <MessageEditor initialHtml={html} onCancel={onCancelEdit} onSave={onSaveEdit} />
      ) : (
        <>
          <div className="flow-prose min-w-0" dangerouslySetInnerHTML={{ __html: html }} />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] tracking-wide text-muted-foreground/55">
              Updated {timeAgo(note.updated_at)}
            </span>
            {note.tags.map((tag) => (
              <TagChip key={tag.id} tag={tag} style={tagStyle} />
            ))}
          </div>

          <div className="absolute right-2 top-1.5 flex items-center gap-0.5 rounded-md border border-border bg-popover/95 p-0.5 opacity-0 shadow-quiet backdrop-blur transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onStartEdit();
              }}
              aria-label="Edit"
              title="Edit"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                event.currentTarget.blur();
                onMoveToStream();
              }}
              aria-label="Move to Stream"
              title="Move to Stream"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-foreground"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                event.currentTarget.blur();
                onDelete();
              }}
              aria-label="Delete"
              title="Delete"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </article>
  );
}
