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
 * Reference notes are grouped by their primary tag (the first tag in the
 * note's own tags array), alphabetically, with untagged notes last — the same
 * convention the sidebar uses for ungrouped tags. A note's remaining tags
 * still render as chips on its row, but they no longer create extra groups.
 */
export function groupReferenceNotes(notes: FlowMessage[]): Group[] {
  const byTag = new Map<string, Group>();
  const general: FlowMessage[] = [];

  for (const note of notes) {
    const primary = note.tags[0];
    if (!primary) {
      general.push(note);
      continue;
    }
    const group = byTag.get(primary.id) ?? { key: primary.id, label: primary.name, notes: [] };
    group.notes.push(note);
    byTag.set(primary.id, group);
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
    <div className="space-y-7">
      {groups.map((group) => (
        <section key={group.key}>
          <div className="mb-1.5 flex items-center gap-3">
            <h2 className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground/55">
              {group.label}
            </h2>
            <span className="text-[10.5px] tabular-nums text-muted-foreground/40">
              {group.notes.length}
            </span>
            <span aria-hidden className="h-px flex-1 bg-border/60" />
          </div>
          <div className="flow-row-stack">
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
        "group relative -mx-3 rounded-md px-3 transition-colors duration-200 flow-row-pad",
        !isEditing && "cursor-text hover:bg-surface/55",
        isEditing && "bg-surface",
      )}
    >
      <div className="flex gap-3 sm:gap-4">
        {/* Same quiet left gutter as the stream, so both views share a spine. */}
        <div className="hidden w-12 shrink-0 pt-[0.15rem] text-right text-[11px] leading-5 tracking-wide whitespace-nowrap text-muted-foreground/55 sm:block">
          <time dateTime={note.updated_at}>{timeAgo(note.updated_at)}</time>
        </div>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <MessageEditor initialHtml={html} onCancel={onCancelEdit} onSave={onSaveEdit} />
          ) : (
            <>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] tracking-wide text-muted-foreground/55 sm:hidden">
                <time dateTime={note.updated_at}>{timeAgo(note.updated_at)}</time>
              </div>

              <div className="flex items-start gap-4">
                <div
                  className="flow-prose min-w-0 flex-1"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
                {note.tags.length > 0 && (
                  <span className="hidden max-w-[34%] shrink-0 flex-wrap items-center justify-end gap-1.5 pt-[0.2rem] transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0 sm:flex">
                    {note.tags.map((tag) => (
                      <TagChip key={tag.id} tag={tag} style={tagStyle} />
                    ))}
                  </span>
                )}
              </div>

              {note.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
                  {note.tags.map((tag) => (
                    <TagChip key={tag.id} tag={tag} style={tagStyle} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {!isEditing && (
        <div className="absolute right-2 top-1.5 flex items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
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
      )}
    </article>
  );
}

