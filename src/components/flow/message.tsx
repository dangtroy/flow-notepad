import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  BellOff,
  BookmarkPlus,
  Check,
  MoreHorizontal,
  Pin,
  Reply,
  RotateCcw,
  Trash2,
} from "lucide-react";

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
import { TagLink } from "./tag-chip";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** A reply out of chronological order reads as a bug without this offset. */
function offsetLabel(iso: string, parentIso: string | undefined) {
  if (!parentIso) return null;
  const minutes = Math.round(
    (new Date(iso).getTime() - new Date(parentIso).getTime()) / (1000 * 60),
  );
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  if (abs < 1) return null;
  if (abs < 60) return `${sign}${abs}m`;
  if (abs < 60 * 48) return `${sign}${Math.round(abs / 60)}h`;
  return `${sign}${Math.round(abs / (60 * 24))}d`;
}

const iconClass = "h-4 w-4 [stroke-width:1.3]";
/** Touch needs a real tap target; pointer devices keep the quiet 24px box. */
const actionButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-150 hover:text-foreground sm:h-6 sm:w-6";

/** One thought in the stream: quiet text on the page, never a card. */
function MessageRowBase({
  message,
  isEditing,
  depth = 0,
  isReplyTarget,
  parentCreatedAt,
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
  /** Only for replies: lets the row show how far after its parent it landed. */
  parentCreatedAt?: string | undefined;
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

  const isReply = depth > 0;
  const tags = message.tags;
  const offset = isReply ? offsetLabel(message.created_at, parentCreatedAt) : null;

  return (
    <article
      data-message-id={message.id}
      data-reply={isReply ? "true" : undefined}
      onClick={handleSurfaceClick}
      className={cn(
        "flow-row group relative flex gap-3 rounded-md transition-colors duration-200 flow-row-pad sm:gap-4",
        actionsOpen && "flow-row-open",
        !isEditing && "cursor-text",
        isEditing && "bg-surface",
        isReplyTarget && "bg-surface/55",
      )}
    >
      {/* Left margin: checkbox + timestamp, revealed with the rest of the row. */}
      <div
        className="flow-meta hidden w-24 shrink-0 flex-row items-center gap-2 sm:flex"
        style={{ height: "26.4px" }}
      >
        {!message.is_completed && (
          <button
            type="button"
            role="checkbox"
            aria-checked={false}
            onClick={(event) => {
              event.stopPropagation();
              event.currentTarget.blur();
              onToggleComplete();
            }}
            aria-label="Mark as done"
            title="Mark as done"
            className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center border border-border text-transparent transition-colors duration-150 hover:border-muted-foreground/60"
          >
            <Check className="h-2.5 w-2.5" />
          </button>
        )}

        <div className="text-[11px] leading-none tabular-nums tracking-wide whitespace-nowrap text-muted-foreground/55">
          <time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
          {offset && <span className="text-muted-foreground/40"> · {offset}</span>}
          {message.edited_at && <span className="text-muted-foreground/40"> · edited</span>}
        </div>
      </div>

      <div
        className={cn("min-w-0 flex-1", isReply && "flow-reply-rail pl-3.5 sm:pl-4")}
        style={depth > 1 ? { marginLeft: `${(depth - 1) * 1.1}rem` } : undefined}
      >
        {isEditing ? (
          <MessageEditor initialHtml={html} onCancel={onCancelEdit} onSave={onSaveEdit} />
        ) : (
          <>
            {/* Narrow screens have no margins: a quiet meta line leads instead. */}
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] tabular-nums tracking-wide text-muted-foreground/55 sm:hidden">
              {!message.is_completed && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={false}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleComplete();
                  }}
                  aria-label="Mark as done"
                  className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center border border-border text-transparent"
                >
                  <Check className="h-2.5 w-2.5" />
                </button>
              )}
              <time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
              {offset && <span> · {offset}</span>}
              {message.edited_at && <span> · edited</span>}
            </div>

            <div
              className={cn(
                "flow-prose min-w-0",
                message.is_completed && "line-through decoration-1",
              )}
            >
              <span dangerouslySetInnerHTML={{ __html: html }} />
            </div>

            {/* Tags live under the text and expand with the row. */}
            {tags.length > 0 && (
              <div className="flow-tagwrap">
                <div>
                  <div className="flex flex-wrap items-center gap-3 pt-1.5">
                    {tags.map((tag) => (
                      <TagLink key={tag.id} tag={tag} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Right margin: the four actions, no card, no border, no shadow. */}
      {!isEditing && (
        <div
          className="flow-acts absolute right-1 flex items-center gap-2"
          style={{ top: "var(--flow-row-pad, 0.55rem)", height: "26.4px" }}
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
            className={actionButton}
          >
            <Reply className={iconClass} />
          </button>

          {onSetType && (
            <Popover open={saveOpen} onOpenChange={setSaveOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                  aria-label="Save this"
                  title="Save this"
                  className={cn(actionButton, message.type === "pinned" && "text-primary")}
                >
                  <BookmarkPlus className={iconClass} />
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
              className={cn(actionButton, message.remind_at && "text-primary")}
            >
              <AlarmIcon />
            </button>
          </ReminderPopover>

          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                aria-label="More actions"
                className={actionButton}
              >
                <MoreHorizontal className={iconClass} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(event) => event.stopPropagation()}
              className="w-44 text-[12.5px]"
            >
              {message.is_completed && (
                <>
                  <DropdownMenuItem onSelect={() => onToggleComplete()}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Mark as not done
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
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

/** A clock-face bell alternative: uniform stroke, no filled shapes. */
function AlarmIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
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
