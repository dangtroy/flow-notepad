import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  BellOff,
  BookmarkPlus,
  Check,
  MoreHorizontal,
  Pin,
  Plus,
  Reply,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import type { FlowMessage, MessageType } from "@/lib/flow.server";
import { appendTagExclusion, saveTag } from "@/lib/flow.functions";
import { sanitizeHtml, textToHtml } from "@/lib/rich-text";
import { tagAccent } from "@/lib/tag-colors";
import { normalizeTag } from "@/lib/tag-normalize";
import { useActiveNotepadId } from "@/lib/use-notepad";
import { tagsKey, useTags } from "@/lib/use-tags";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HistoryPopover } from "./history-popover";
import { ReminderPopover, reminderLabel } from "./reminder-control";
import { FlowEditorSurface, FlowToolbar, useFlowEditor } from "./rich-editor";
import { TagLink } from "./tag-chip";

/** Quiet "+" at the end of a note's tag row: search the notepad's own tags. */
function TagPicker({
  appliedIds,
  onPick,
  open,
  onOpenChange,
}: {
  appliedIds: string[];
  onPick: (tagId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tags = useTags();
  const notepadId = useActiveNotepadId();
  const queryClient = useQueryClient();
  const createTag = useServerFn(saveTag);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const available = (tags.data ?? []).filter((tag) => !appliedIds.includes(tag.id));

  const query = search.trim();
  const exactMatch = available.some((tag) => normalizeTag(tag.name) === normalizeTag(query));
  const canCreate = Boolean(notepadId) && query.length > 0 && !exactMatch;

  /** Creates the tag in this notepad, then applies it like any other pick. */
  async function createAndPick(name: string) {
    if (!notepadId || creating) return;
    setCreating(true);
    try {
      const next = await createTag({ data: { notepadId, name, context: "" } });
      queryClient.setQueryData(tagsKey(notepadId), next);
      const created = next.find((tag) => normalizeTag(tag.name) === normalizeTag(name));
      onOpenChange(false);
      if (created) onPick(created.id);
    } catch {
      toast.error("Couldn't create that tag");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          aria-label="Add a tag"
          title="Add a tag"
          className={cn(
            "inline-flex h-3.5 items-center gap-1 font-mono text-[11px] leading-none text-muted-foreground/45 transition-colors duration-150 hover:text-foreground",
            open && "text-foreground",
          )}
        >
          <Plus className="h-3 w-3 [stroke-width:1.4]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        onClick={(event) => event.stopPropagation()}
        className="w-56 p-0"
      >
        <Command>
          <CommandInput placeholder="Find a tag…" className="text-[12.5px]" />
          <CommandList>
            <CommandEmpty className="px-3 py-3 text-[12px] text-muted-foreground">
              No tag by that name
            </CommandEmpty>
            <CommandGroup>
              {available.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={tag.name}
                  onSelect={() => {
                    onOpenChange(false);
                    onPick(tag.id);
                  }}
                  className="gap-2 font-mono text-[11.5px]"
                >
                  <span
                    aria-hidden
                    className="h-[5px] w-[5px] shrink-0 rounded-full"
                    style={{ backgroundColor: tagAccent(tag.color) }}
                  />
                  {tag.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
  onAddTag,
  onRemoveTag,
  onConfirmTag,
  onAcknowledgeGraduation,
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
  /** Manual tagging: both applied as source 'user', never touched by AI passes. */
  onAddTag?: (tagId: string) => void;
  onRemoveTag?: (tagId: string) => void;
  /** ✓ on a suggested tag: keeps it, and teaches Flow the tag is worth trusting. */
  onConfirmTag?: (tagId: string) => void;
  onAcknowledgeGraduation?: (tagId: string) => void;
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
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const actionsOpen = reminderOpen || menuOpen || saveOpen || tagPickerOpen || historyOpen;

  // After dismissing a suggestion, an optional one-liner teaches the tag why.
  const [dismissed, setDismissed] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const saveExclusion = useServerFn(appendTagExclusion);

  function closeReason() {
    setDismissed(null);
    setReason("");
  }

  const isReply = depth > 0;
  const tags = message.tags;

  // A tag that just earned automation says so once, on a note that carries it.
  const allTags = useTags();
  const graduatedTag =
    (allTags.data ?? []).find(
      (tag) =>
        tag.graduated_at && !tag.graduation_ack_at && tags.some((applied) => applied.id === tag.id),
    ) ?? null;

  const offset = isReply ? offsetLabel(message.created_at, parentCreatedAt) : null;

  // Touch: swipe a row to the left to delete it, the way native note apps do.
  const swipeStart = useRef<{ x: number; y: number; locked: boolean } | null>(null);
  const [swipeX, setSwipeX] = useState(0);

  function onTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    if (!touch || isEditing) return;
    swipeStart.current = { x: touch.clientX, y: touch.clientY, locked: false };
  }

  function onTouchMove(event: React.TouchEvent) {
    const start = swipeStart.current;
    const touch = event.touches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (!start.locked) {
      if (Math.abs(dy) > Math.abs(dx)) {
        swipeStart.current = null;
        return;
      }
      if (Math.abs(dx) < 8) return;
      start.locked = true;
    }
    setSwipeX(Math.max(-96, Math.min(0, dx)));
  }

  function onTouchEnd() {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (start?.locked && swipeX < -72) {
      setSwipeX(0);
      onDeleteNow();
      return;
    }
    setSwipeX(0);
  }

  return (
    <div className="flow-swipe sm:overflow-visible">
      {swipeX < 0 && (
        <div className="flow-swipe-action" aria-hidden>
          <Trash2 className="h-4 w-4" />
        </div>
      )}
    <article
      data-message-id={message.id}
      data-reply={isReply ? "true" : undefined}
      onClick={handleSurfaceClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        transform: swipeX ? `translate3d(${swipeX}px,0,0)` : undefined,
        transition: swipeStart.current ? "none" : "transform 180ms var(--ease-enter)",
        backgroundColor: swipeX ? "var(--background)" : undefined,
      }}
      className={cn(
        "flow-row group relative flex flex-wrap gap-3 rounded-md transition-colors duration-200 flow-row-pad sm:flex-nowrap sm:gap-4",
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

        <div className="font-mono text-micro leading-none tabular-nums tracking-[0.01em] whitespace-nowrap text-ai-muted">
          <time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
          {offset && <span> · {offset}</span>}
          {message.edited_at && <span> · edited</span>}
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
            <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-micro tabular-nums tracking-[0.01em] text-ai-muted sm:hidden">
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
            {(tags.length > 0 || onAddTag || message.ai_status === "pending") && (
              <div className="flow-tagwrap">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                    {/* Organising is still running: hold the space it will fill
                        rather than letting tags shove the row on arrival. */}
                    {tags.length === 0 && message.ai_status === "pending" && (
                      <span
                        aria-label="Organising…"
                        className="font-mono text-micro leading-none tracking-[0.01em] text-ai-muted"
                      >
                        …
                      </span>
                    )}
                    {tags.map((tag) => {
                      // A tag Flow is still learning is offered, not asserted:
                      // a leading "?", the fainter AI tone, and ✓/✕ controls.
                      const isSuggested = message.suggestedTagIds?.includes(tag.id) ?? false;
                      const isTentative = message.tentativeTagIds?.includes(tag.id) ?? false;
                      return (
                        <span
                          key={tag.id}
                          className="group/tag inline-flex items-center gap-1"
                          title={isSuggested ? `Flow suggests ${tag.name}` : undefined}
                        >
                          {isSuggested && (
                            <span
                              aria-hidden
                              className="font-mono text-micro leading-none text-ai-muted"
                            >
                              ?
                            </span>
                          )}
                          {/* Unsure reads fainter than sure — never a badge. */}
                          <TagLink tag={tag} muted={isSuggested || isTentative} />

                          {isSuggested && onConfirmTag && (
                            <button
                              type="button"
                              aria-label={`Keep ${tag.name}`}
                              title={`Keep ${tag.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                event.currentTarget.blur();
                                onConfirmTag(tag.id);
                              }}
                              className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-ai-muted transition-colors duration-150 hover:text-foreground"
                            >
                              <Check className="h-2.5 w-2.5 [stroke-width:1.8]" />
                            </button>
                          )}

                          {onRemoveTag && (
                            <button
                              type="button"
                              aria-label={
                                isSuggested ? `Dismiss ${tag.name}` : `Remove ${tag.name}`
                              }
                              title={isSuggested ? `Dismiss ${tag.name}` : `Remove ${tag.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                event.currentTarget.blur();
                                onRemoveTag(tag.id);
                                // Never blocks the dismiss — just offers to learn.
                                if (isSuggested) {
                                  setReason("");
                                  setDismissed({ id: tag.id, name: tag.name });
                                }
                              }}
                              className={cn(
                                "inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-ai-muted transition-opacity duration-150 hover:text-foreground focus-visible:opacity-100 group-hover/tag:opacity-100 max-[939px]:opacity-100 [@media(hover:none)]:opacity-100",
                                isSuggested ? "opacity-100" : "opacity-0",
                              )}
                            >
                              <X className="h-2.5 w-2.5 [stroke-width:1.6]" />
                            </button>
                          )}
                        </span>
                      );
                    })}

                    {onAddTag && (
                      <TagPicker
                        appliedIds={tags.map((tag) => tag.id)}
                        onPick={onAddTag}
                        onOpenChange={setTagPickerOpen}
                        open={tagPickerOpen}
                      />
                    )}
                  </div>

                  {/* Optional: say why that suggestion was wrong. */}
                  {dismissed && (
                    <form
                      onClick={(event) => event.stopPropagation()}
                      onSubmit={(event) => {
                        event.preventDefault();
                        const text = reason.trim();
                        closeReason();
                        if (text) {
                          void saveExclusion({ data: { tagId: dismissed.id, reason: text } }).catch(
                            () => undefined,
                          );
                        }
                      }}
                      className="flex items-center gap-2 pt-1.5"
                    >
                      <input
                        autoFocus
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.stopPropagation();
                            closeReason();
                          }
                        }}
                        placeholder={`Why not ${dismissed.name}? (optional)`}
                        className="w-full max-w-xs border-b border-border bg-transparent pb-0.5 text-[11.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={closeReason}
                        aria-label="Skip"
                        className="text-[11px] text-muted-foreground/60 hover:text-foreground"
                      >
                        Skip
                      </button>
                    </form>
                  )}

                  {/* Shown once, the moment a tag has earned its automation. */}
                  {graduatedTag && (
                    <div className="flex items-center gap-2 pt-1.5 text-[11px] text-muted-foreground/70">
                      <span>Flow will now add {graduatedTag.name} on its own.</span>
                      {onAcknowledgeGraduation && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onAcknowledgeGraduation(graduatedTag.id);
                          }}
                          className="underline decoration-dotted transition-colors hover:text-foreground"
                        >
                          Got it
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Right margin: the four actions, no card, no border, no shadow. */}
      {!isEditing && (
        <div
          className={cn(
            "flow-acts flow-acts-anchor flex w-full items-center gap-1",
            isReply && "pl-3.5 sm:pl-0",
            "sm:absolute sm:right-1 sm:w-auto sm:gap-2",
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
            className={actionButton}
          >
            <Reply className={iconClass} />
          </button>

          {/* Only an edited note has earlier versions to look at. */}
          {message.edited_at && (
            <HistoryPopover
              messageId={message.id}
              onOpenChange={setHistoryOpen}
              className={actionButton}
            />
          )}

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
    </div>
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
