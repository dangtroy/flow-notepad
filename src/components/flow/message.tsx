import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Reply } from "lucide-react";

import type { FlowMessage } from "@/lib/flow.server";
import { sanitizeHtml, textToHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import { FlowEditorSurface, FlowToolbar, useFlowEditor } from "./rich-editor";
import { TagChip } from "./tag-chip";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** One thought in the stream: quiet text on the page, never a card. */
function MessageRowBase({
  message,
  isEditing,
  isReply,
  isReplyTarget,
  showTags = true,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleComplete,
  onDeleteNow,
  onReply,
}: {
  message: FlowMessage;
  isEditing: boolean;
  isReply?: boolean;
  isReplyTarget?: boolean;
  showTags?: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (html: string) => void;
  onToggleComplete: () => void;
  onDeleteNow: () => void;
  onReply: () => void;
}) {
  const html = useMemo(
    () => sanitizeHtml(message.content_html ?? textToHtml(message.content)),
    [message.content_html, message.content],
  );

  // A single click marks done; a second click within the moment deletes for good.
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (doneTimer.current) clearTimeout(doneTimer.current);
  }, []);

  function handleDoneClick() {
    if (doneTimer.current) {
      clearTimeout(doneTimer.current);
      doneTimer.current = null;
      onDeleteNow();
      return;
    }
    doneTimer.current = setTimeout(() => {
      doneTimer.current = null;
      onToggleComplete();
    }, 260);
  }

  /** The note itself is the editor: clicking the text opens it in place. */
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
        "group relative -mx-3.5 rounded-lg px-3.5 py-2.5 transition-colors duration-200",
        !isEditing && "cursor-text hover:bg-surface/70",
        isEditing && "bg-surface",
        isReplyTarget && "bg-surface/70",
        isReply && "ml-5 border-l border-border pl-4",
      )}
    >
      <div className="flex gap-3 sm:gap-4">
        {/* Time lives in a quiet left gutter, never under the note. */}
        <div className="hidden w-12 shrink-0 pt-0.5 text-right text-[11px] leading-5 tracking-wide text-muted-foreground/60 sm:block">
          <time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
          {message.edited_at && <div className="text-muted-foreground/45">edited</div>}
          {message.is_completed && <div className="text-muted-foreground/45">done</div>}
        </div>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <MessageEditor initialHtml={html} onCancel={onCancelEdit} onSave={onSaveEdit} />
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flow-prose min-w-0 flex-1 transition-opacity duration-200",
                    message.is_completed && "text-muted-foreground line-through decoration-1",
                  )}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
                {/* Tags sit alongside the note and step aside for the hover actions. */}
                {showTags && message.tags.length > 0 && (
                  <span className="hidden max-w-[40%] shrink-0 flex-wrap items-center justify-end gap-1.5 pt-0.5 transition-opacity duration-150 group-hover:opacity-0 sm:flex">
                    {message.tags.map((tag) => (
                      <TagChip key={tag.id} tag={tag} />
                    ))}
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] tracking-wide text-muted-foreground/60 sm:hidden">
                <time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
                {message.edited_at && <span>edited</span>}
                {showTags &&
                  message.tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}
              </div>
            </>
          )}
        </div>
      </div>

      {!isEditing && (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onReply();
            }}
            aria-label="Reply"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-foreground"
          >
            <Reply className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStartEdit();
            }}
            aria-label="Edit"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleDoneClick();
            }}
            aria-label={message.is_completed ? "Mark as not done" : "Mark as done"}
            title="Click to mark done · double-click to delete now"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 hover:bg-elevated hover:text-foreground",
              message.is_completed ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </article>
  );
}


function MessageEditor({
  initialHtml,
  onSave,
  onCancel,
}: {
  initialHtml: string;
  onSave: (html: string) => void;
  onCancel: () => void;
}) {
  const [isEmpty, setIsEmpty] = useState(false);
  const editor = useFlowEditor({
    initialHtml,
    autoFocus: true,
    onEmptyChange: setIsEmpty,
    onSubmit: onSave,
    onCancel,
  });

  if (!editor) return null;

  return (
    <div>
      <FlowEditorSurface editor={editor} isEmpty={isEmpty} placeholder="Write anything…" />
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <FlowToolbar editor={editor} />
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
          <button type="button" onClick={onCancel} className="transition-colors hover:text-foreground">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(editor.getHTML())}
            disabled={isEmpty}
            className="text-primary transition-opacity hover:brightness-110 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export const MessageRow = memo(MessageRowBase);
