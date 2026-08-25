import { useMemo, useState } from "react";
import { ArrowLeftRight, Trash2 } from "lucide-react";

import type { FlowMessage } from "@/lib/flow.server";
import { sanitizeHtml, textToHtml } from "@/lib/rich-text";
import { cn, timeAgo } from "@/lib/utils";
import { MessageEditor } from "./message";
import { TagLink } from "./tag-chip";

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
  onSaveEdit,
  onMoveToStream,
  onDelete,
}: {
  notes: FlowMessage[];
  isPending?: boolean;
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
            <h2 className="font-mono text-micro uppercase tracking-[0.14em] text-ai">
              {group.label}
            </h2>
            <span className="font-mono text-micro tabular-nums text-ai-muted">
              {group.notes.length}
            </span>
            <span aria-hidden className="h-px flex-1 bg-border/60" />
          </div>
          <div className="flow-row-stack">
            {group.notes.map((note) => (
              <ReferenceRow
                key={`${group.key}-${note.id}`}
                note={note}
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

const iconClass = "h-4 w-4 [stroke-width:1.3]";
const actionButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-150 hover:text-foreground sm:h-6 sm:w-6";

function ReferenceRow({
  note,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onMoveToStream,
  onDelete,
}: {
  note: FlowMessage;
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
        "flow-row group relative flex flex-wrap gap-3 rounded-md transition-colors duration-200 flow-row-pad sm:flex-nowrap sm:gap-4",
        !isEditing && "cursor-text",
        isEditing && "bg-surface",
      )}
    >
      {/* The same quiet left margin the stream uses, revealed on hover. */}
      <div
        className="flow-meta hidden w-24 shrink-0 flex-row items-center gap-2 sm:flex"
        style={{ height: "26.4px" }}
      >
        <div className="font-mono text-micro leading-none tabular-nums tracking-[0.01em] whitespace-nowrap text-ai-muted">
          <time dateTime={note.updated_at}>{timeAgo(note.updated_at)}</time>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {isEditing ? (
          <MessageEditor initialHtml={html} onCancel={onCancelEdit} onSave={onSaveEdit} />
        ) : (
          <>
            <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-micro tabular-nums tracking-[0.01em] text-ai-muted sm:hidden">
              <time dateTime={note.updated_at}>{timeAgo(note.updated_at)}</time>
            </div>

            <div className="flow-prose min-w-0" dangerouslySetInnerHTML={{ __html: html }} />

            {note.tags.length > 0 && (
              <div className="flow-tagwrap">
                <div>
                  <div className="flex flex-wrap items-center gap-3 pt-1.5">
                    {note.tags.map((tag) => (
                      <TagLink key={tag.id} tag={tag} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!isEditing && (
        <div className="flow-acts flow-acts-anchor flex w-full items-center gap-1 sm:absolute sm:right-1 sm:w-auto sm:gap-2">

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              event.currentTarget.blur();
              onMoveToStream();
            }}
            aria-label="Move to Stream"
            title="Move to Stream"
            className={actionButton}
          >
            <ArrowLeftRight className={iconClass} />
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
            className={cn(actionButton, "hover:text-destructive")}
          >
            <Trash2 className={iconClass} />
          </button>
        </div>
      )}
    </article>
  );
}
