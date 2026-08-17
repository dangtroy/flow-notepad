import { memo, useMemo, useState } from "react";
import { Check, Pencil } from "lucide-react";

import type { FlowMessage } from "@/lib/flow.server";
import { sanitizeHtml, textToHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import { FlowEditorSurface, FlowToolbar, useFlowEditor } from "./rich-editor";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** One thought in the stream: quiet text on the page, never a card. */
function MessageRowBase({
  message,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleComplete,
}: {
  message: FlowMessage;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (html: string) => void;
  onToggleComplete: () => void;
}) {
  const html = useMemo(
    () => sanitizeHtml(message.content_html ?? textToHtml(message.content)),
    [message.content_html, message.content],
  );

  return (
    <article
      className={cn(
        "group relative rounded-lg px-3.5 py-2.5 transition-colors duration-200 -mx-3.5",
        !isEditing && "hover:bg-surface/70",
        isEditing && "bg-surface",
      )}
    >
      {isEditing ? (
        <MessageEditor initialHtml={html} onCancel={onCancelEdit} onSave={onSaveEdit} />
      ) : (
        <div
          className={cn(
            "flow-prose transition-opacity duration-200",
            message.is_completed && "text-muted-foreground line-through decoration-1",
          )}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}

      <div className="mt-1.5 flex items-center gap-2 text-[11px] tracking-wide text-muted-foreground/70">
        <time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
        {message.edited_at && <span>edited</span>}
        {message.is_completed && message.completed_at && (
          <span>done {timeLabel(message.completed_at)}</span>
        )}
      </div>

      {!isEditing && (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={onStartEdit}
            aria-label="Edit"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleComplete}
            aria-label={message.is_completed ? "Mark as not done" : "Mark as done"}
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
