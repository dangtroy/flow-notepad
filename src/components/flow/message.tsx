import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, Pencil, Pin, Reply, X } from "lucide-react";

import type { TagPosition, TagStyle } from "@/lib/appearance";
import type { FlowMessage } from "@/lib/flow.server";
import { sanitizeHtml, textToHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ReminderPopover, reminderLabel } from "./reminder-control";
import { FlowEditorSurface, FlowToolbar, useFlowEditor } from "./rich-editor";
import { TagChip } from "./tag-chip";



function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * The ✦ that quietly marks an AI-cleaned note. Lives in the gutter so the note
 * text stays perfectly left-aligned; click to see the original and restore it.
 */
function CleanedMark({
  message,
  onRestoreOriginal,
  className,
}: {
  message: FlowMessage;
  onRestoreOriginal?: (() => void) | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const original = message.original_content ?? "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Cleaned up by AI — show original"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded text-[0.75em] leading-none text-muted-foreground/50 opacity-0 transition-all duration-150 hover:text-ai focus-visible:opacity-100 group-hover:opacity-100",
            open && "text-ai opacity-100",
            className,
          )}
        >
          ✦
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        onClick={(event) => event.stopPropagation()}
        className="w-[min(20rem,80vw)] p-3 text-[12px]"
      >
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">AI cleaned</p>
        <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">
          {original || "Original text unavailable"}
        </p>
        <div className="mt-2.5 flex items-center gap-3 text-[11px]">
          {onRestoreOriginal && original && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRestoreOriginal();
              }}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Restore original
            </button>
          )}
          {original && (
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(original)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Copy original
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}


/** One thought in the stream: quiet text on the page, never a card. */
function MessageRowBase({
  message,
  isEditing,
  depth = 0,
  isReplyTarget,
  showTags = true,
  showTimestamps = true,
  showReplyTimestamps = true,
  tagStyle = "pill",
  tagPosition = "right",
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleComplete,
  onDeleteNow,
  onReply,
  onRestoreOriginal,
  onTogglePin,
  onSetReminder,
}: {
  message: FlowMessage;
  isEditing: boolean;
  depth?: number;
  isReplyTarget?: boolean;
  showTags?: boolean;
  showTimestamps?: boolean;
  showReplyTimestamps?: boolean;
  tagStyle?: TagStyle;
  tagPosition?: TagPosition;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (html: string) => void;
  onToggleComplete: () => void;
  onDeleteNow: () => void;
  onReply: () => void;
  onRestoreOriginal?: () => void;
  onTogglePin: () => void;
  onSetReminder: (iso: string | null) => void;

}) {
  const html = useMemo(
    () => sanitizeHtml(message.content_html ?? textToHtml(message.content)),
    [message.content_html, message.content],
  );

  /** The note itself is the editor: clicking the text opens it in place. */
  function handleSurfaceClick(event: React.MouseEvent<HTMLElement>) {
    if (isEditing) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, label")) return;
    if (window.getSelection()?.toString()) return;
    onStartEdit();
  }

  const isReply = depth > 0;
  const tags = showTags && message.tags.length > 0 ? message.tags : [];
  const withTime = showTimestamps && (!isReply || showReplyTimestamps);
  const keepGutter = showTimestamps;

  return (
    <article
      data-message-id={message.id}
      data-reply={isReply ? "true" : undefined}
      onClick={handleSurfaceClick}
      className={cn(
        "group relative -mx-3 rounded-md px-3 transition-colors duration-200 flow-row-pad",
        !isEditing && "cursor-text hover:bg-surface/55",
        isEditing && "bg-surface",
        isReplyTarget && "bg-surface/55",
      )}
    >
      <div className="flex gap-3 sm:gap-4">
        {/* Time lives in a quiet left gutter, aligned across every depth. */}
        {keepGutter && (
          <div className="relative hidden w-12 shrink-0 pt-[0.15rem] text-right text-[11px] leading-5 tracking-wide whitespace-nowrap text-muted-foreground/55 sm:block">
            {/* Quiet marks float outside the gutter so time stays flush. */}
            <span className="absolute -left-4 top-[0.15rem] flex flex-col items-center">
              {message.ai_cleaned && (
                <CleanedMark message={message} onRestoreOriginal={onRestoreOriginal} />
              )}
              {message.is_pinned && (
                <Pin className="mt-0.5 h-3 w-3 text-muted-foreground/60" aria-label="Pinned" />
              )}
              {message.remind_at && (
                <ReminderPopover value={message.remind_at} onChange={onSetReminder}>
                  <button
                    type="button"
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Reminder ${reminderLabel(message.remind_at)}`}
                    title={`Reminder · ${reminderLabel(message.remind_at)}`}
                    className="mt-0.5 text-muted-foreground/60 transition-colors hover:text-primary"
                  >
                    <Bell className="h-3 w-3" />
                  </button>
                </ReminderPopover>
              )}
            </span>
            {withTime && (
              <>
                <time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
                {message.edited_at && <div className="text-muted-foreground/40">edited</div>}
              </>
            )}
          </div>
        )}


        <div
          className={cn(
            "min-w-0 flex-1",
            isReply && "flow-reply-rail pl-3.5 sm:pl-4",
          )}
          style={depth > 1 ? { marginLeft: `${(depth - 1) * 1.1}rem` } : undefined}
        >
          {isEditing ? (
            <MessageEditor initialHtml={html} onCancel={onCancelEdit} onSave={onSaveEdit} />
          ) : (
            <>
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    "flow-prose min-w-0 flex-1",
                    message.is_completed && "text-muted-foreground line-through decoration-1",
                  )}
                  dangerouslySetInnerHTML={{ __html: html }}
                />

                {/* Tags sit beside the text and step aside for the hover actions. */}
                {tagPosition === "right" && tags.length > 0 && (
                  <span className="hidden max-w-[34%] shrink-0 flex-wrap items-center justify-end gap-1.5 pt-[0.2rem] transition-opacity duration-150 group-hover:opacity-0 sm:flex">
                    {tags.map((tag) => (
                      <TagChip key={tag.id} tag={tag} style={tagStyle} />
                    ))}
                  </span>
                )}
              </div>


              {tagPosition === "below" && tags.length > 0 && (
                <div className="mt-1.5 hidden flex-wrap items-center gap-1.5 sm:flex">
                  {tags.map((tag) => (
                    <TagChip key={tag.id} tag={tag} style={tagStyle} />
                  ))}
                </div>
              )}

              {/* Narrow screens have no gutter: the meta line carries it. */}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] tracking-wide text-muted-foreground/55 sm:hidden">
                {message.ai_cleaned && (
                  <CleanedMark message={message} onRestoreOriginal={onRestoreOriginal} />
                )}
                {message.is_pinned && <Pin className="h-3 w-3 text-muted-foreground/60" />}
                {message.remind_at && (
                  <span className="inline-flex items-center gap-1">
                    <Bell className="h-3 w-3 text-muted-foreground/60" />
                    {reminderLabel(message.remind_at)}
                  </span>
                )}
                {withTime && (
                  <>
                    <time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
                    {message.edited_at && <span>edited</span>}
                  </>
                )}
                {tags.map((tag) => (
                  <TagChip key={tag.id} tag={tag} style={tagStyle} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {!isEditing && (
        <div className="absolute right-2 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
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
          <ReminderPopover value={message.remind_at} onChange={onSetReminder} align="end">
            <button
              type="button"
              onClick={(event) => event.stopPropagation()}
              aria-label="Remind me"
              title={message.remind_at ? `Reminder · ${reminderLabel(message.remind_at)}` : "Remind me"}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 hover:bg-elevated hover:text-foreground",
                message.remind_at ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Bell className="h-3.5 w-3.5" />
            </button>
          </ReminderPopover>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin();
            }}
            aria-label={message.is_pinned ? "Unpin" : "Pin"}
            title={message.is_pinned ? "Unpin" : "Pin"}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 hover:bg-elevated hover:text-foreground",
              message.is_pinned ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Pin className="h-3.5 w-3.5" />
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
              onToggleComplete();
            }}
            aria-label={message.is_completed ? "Mark as not done" : "Mark as done"}
            title={message.is_completed ? "Mark as not done" : "Mark as done"}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 hover:bg-elevated hover:text-foreground",
              message.is_completed ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteNow();
            }}
            aria-label="Delete"
            title="Delete now"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const editor = useFlowEditor({
    initialHtml,
    autoFocus: true,
    onEmptyChange: setIsEmpty,
    onSubmit: onSave,
    onCancel,
  });

  // Clicking anywhere outside the open note saves it and closes the editor.
  const latest = useRef({ editor, isEmpty, onSave, onCancel });
  latest.current = { editor, isEmpty, onSave, onCancel };
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const target = event.target as Node | null;
      if (target && wrap.contains(target)) return;
      const { editor: instance, isEmpty: empty, onSave: save, onCancel: cancel } = latest.current;
      if (!instance || empty) cancel();
      else save(instance.getHTML());
    }
    document.addEventListener("mousedown", handlePointerDown, true);
    return () => document.removeEventListener("mousedown", handlePointerDown, true);
  }, []);

  if (!editor) return null;

  return (
    <div ref={wrapRef}>
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
