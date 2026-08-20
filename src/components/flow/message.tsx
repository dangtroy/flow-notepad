import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  BookmarkPlus,
  Check,
  MoreHorizontal,
  Pin,
  Reply,
  RotateCcw,
  Trash2,
} from "lucide-react";

import type { TagPosition, TagStyle } from "@/lib/appearance";
import type { FlowMessage, MessageType } from "@/lib/flow.server";
import { sanitizeHtml, textToHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReminderPopover, reminderLabel } from "./reminder-control";
import { FlowEditorSurface, FlowToolbar, useFlowEditor } from "./rich-editor";
import { TagChip } from "./tag-chip";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
  onSetReminder,
  onSetType,
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
  onSetReminder: (iso: string | null) => void;
  /** Promotes the note between stream and pinned kinds, or out to Reference. */
  onSetType?: (type: MessageType) => void;
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

  // While a popup from the action bar is open, the bar must stay put.
  const [reminderOpen, setReminderOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const actionsOpen = reminderOpen || menuOpen || saveOpen;
  const isPinnedNote = message.type === "pinned";

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
        {/* Left gutter: checkbox + time inline on one row. */}
        <div
          className={cn(
            "hidden shrink-0 flex-row items-start gap-2 pt-[0.15rem] sm:flex",
            keepGutter ? "w-28" : "w-8",
          )}
          style={depth > 1 ? { marginLeft: `${(depth - 1) * 1.1}rem` } : undefined}
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={message.is_completed}
            onClick={(event) => {
              event.stopPropagation();
              event.currentTarget.blur();
              onToggleComplete();
            }}
            aria-label={message.is_completed ? "Mark as not done" : "Mark as done"}
            title={message.is_completed ? "Mark as not done" : "Mark as done"}
            className={cn(
              "inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center border transition-colors duration-150",
              message.is_completed
                ? "border-primary/60 text-primary"
                : "border-border text-transparent hover:border-muted-foreground/60",
            )}
          >
            <Check className="h-2.5 w-2.5" />
          </button>

          {keepGutter && withTime && (
            <div className="text-[11px] leading-5 tracking-wide whitespace-nowrap text-muted-foreground/55">
              <time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
              {message.edited_at && <span className="text-muted-foreground/40"> · edited</span>}
            </div>
          )}
        </div>

        <div className={cn("min-w-0 flex-1", isReply && "flow-reply-rail pl-3.5 sm:pl-4")}>
          {isEditing ? (
            <MessageEditor initialHtml={html} onCancel={onCancelEdit} onSave={onSaveEdit} />
          ) : (
            <>
              {/* Narrow screens have no gutter: a quiet meta line leads instead. */}
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] tracking-wide text-muted-foreground/55 sm:hidden">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={message.is_completed}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleComplete();
                  }}
                  aria-label={message.is_completed ? "Mark as not done" : "Mark as done"}
                  className={cn(
                    "inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center border transition-colors",
                    message.is_completed
                      ? "border-primary/60 text-primary"
                      : "border-border text-transparent",
                  )}
                >
                  <Check className="h-2.5 w-2.5" />
                </button>
                {withTime && (
                  <>
                    <time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
                    {message.edited_at && <span> · edited</span>}
                  </>
                )}
              </div>

              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    "flow-prose min-w-0 flex-1",
                    message.is_completed && "text-muted-foreground line-through decoration-1",
                  )}
                >
                  <span dangerouslySetInnerHTML={{ __html: html }} />
                </div>

                {/* Tags sit beside the text and step aside for the hover actions. */}
                {tagPosition === "right" && tags.length > 0 && (
                  <span className="hidden max-w-[34%] shrink-0 flex-wrap items-center justify-end gap-1.5 pt-[0.2rem] transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0 sm:flex">
                    {tags.map((tag) => (
                      <TagChip key={tag.id} tag={tag} style={tagStyle} />
                    ))}
                  </span>
                )}
              </div>

              {/* One horizontal meta line: tags only. */}
              {tagPosition === "below" && tags.length > 0 && (
                <div className="mt-1.5 hidden flex-wrap items-center gap-2 text-[11px] leading-none tracking-wide text-muted-foreground/55 transition-opacity duration-150 group-focus-within:opacity-0 sm:flex">
                  {tags.map((tag) => (
                    <TagChip key={tag.id} tag={tag} style={tagStyle} />
                  ))}
                </div>
              )}

              {tags.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
                  {tags.map((tag) => (
                    <TagChip key={tag.id} tag={tag} style={tagStyle} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Common actions stay one click away; destructive actions live in the menu. */}
      {!isEditing && (
        <div
          className={cn(
            "absolute right-2 top-1.5 flex items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100",
            actionsOpen && "opacity-100",
          )}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              event.currentTarget.blur();
              onReply();
            }}
            aria-label="Reply"
            title="Reply"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-foreground"
          >
            <Reply className="h-3.5 w-3.5" />
          </button>
          {onSetType && (
            <Popover open={saveOpen} onOpenChange={setSaveOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                  aria-label="Save this"
                  title="Save this"
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 hover:bg-elevated hover:text-foreground",
                    message.type === "pinned" ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                onClick={(event) => event.stopPropagation()}
                className="w-44 p-1 text-[12.5px]"
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
                  onClick={() => {
                    setSaveOpen(false);
                    onSetType(message.type === "pinned" ? "stream" : "pinned");
                  }}
                >
                  <Pin className="h-3.5 w-3.5" />
                  {message.type === "pinned" ? "Unpin" : "Pin"}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
                  onClick={() => {
                    setSaveOpen(false);
                    onSetType("reference");
                  }}
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  {message.type === "pinned" ? "Move to Reference" : "Reference"}
                </button>
              </PopoverContent>
            </Popover>
          )}

          <ReminderPopover
            value={message.remind_at}
            onChange={onSetReminder}
            align="end"
            open={reminderOpen}
            onOpenChange={setReminderOpen}
          >
            <button
              type="button"
              onClick={(event) => event.stopPropagation()}
              aria-label={message.remind_at ? "Change reminder" : "Set reminder"}
              title={
                message.remind_at ? `Reminder · ${reminderLabel(message.remind_at)}` : "Remind me"
              }
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 hover:bg-elevated hover:text-foreground",
                message.remind_at ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Bell className="h-3.5 w-3.5" />
            </button>
          </ReminderPopover>

          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                aria-label="More actions"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-foreground"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(event) => event.stopPropagation()}
              className="w-44 text-[12.5px]"
            >
              {message.ai_cleaned && onRestoreOriginal && (
                <>
                  <DropdownMenuItem onSelect={() => onRestoreOriginal()}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore original
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {message.remind_at && (
                <DropdownMenuItem onSelect={() => onSetReminder(null)}>
                  <BellOff className="h-3.5 w-3.5" />
                  Clear reminder
                </DropdownMenuItem>
              )}
              {message.remind_at && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDeleteNow()}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete thread
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </article>
  );
}

export function MessageEditor({
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
          <button
            type="button"
            onClick={onCancel}
            className="transition-colors hover:text-foreground"
          >
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
