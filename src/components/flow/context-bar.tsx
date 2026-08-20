import { useEffect, useState } from "react";
import { Bell, Check, ChevronDown, ChevronLeft, ChevronRight, Pin, PinOff, X } from "lucide-react";

import type { FlowMessage } from "@/lib/flow.server";
import { cn } from "@/lib/utils";
import { reminderLabel } from "./reminder-control";

const SNOOZE = [
  { label: "10m", minutes: 10 },
  { label: "1h", minutes: 60 },
  { label: "Tomorrow", minutes: 60 * 24 },
];

/**
 * One slim bar above the stream carries both pins and reminders, so the two
 * features never stack into two headers. A due reminder takes the row; pins
 * collapse to a single chip that expands the list beneath.
 */
export function ContextBar({
  pinned,
  reminders,
  onSnooze,
  onComplete,
  onDismiss,
  onUnpin,
  onJump,
}: {
  pinned: FlowMessage[];
  reminders: FlowMessage[];
  onSnooze: (message: FlowMessage, iso: string) => void;
  onComplete: (message: FlowMessage) => void;
  onDismiss: (message: FlowMessage) => void;
  onUnpin: (message: FlowMessage) => void;
  onJump: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [pinsOpen, setPinsOpen] = useState(false);

  useEffect(() => {
    if (index > reminders.length - 1) setIndex(Math.max(0, reminders.length - 1));
  }, [reminders.length, index]);

  const current = reminders[index];
  const hasPins = pinned.length > 0;
  if (!current && !hasPins) return null;

  const alert = Boolean(current);

  return (
    <div
      className={cn(
        "border-b px-5 backdrop-blur sm:px-8",
        alert ? "border-destructive/30 bg-destructive/[0.08]" : "border-border bg-surface/60",
      )}
    >
      <div className="flow-shell">
        <div className="flex h-9 items-center gap-2.5">
          {current ? (
            <>
              <Bell className="h-3.5 w-3.5 shrink-0 text-destructive" />
              <button
                type="button"
                onClick={() => onJump(current.id)}
                className="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-[12.5px] text-foreground/90 transition-colors hover:bg-destructive/10 hover:text-foreground"
              >
                <span className="text-muted-foreground">
                  {reminderLabel(current.remind_at ?? current.created_at)} ·{" "}
                </span>
                {current.content || "Empty note"}
              </button>

              <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                {SNOOZE.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() =>
                      onSnooze(current, new Date(Date.now() + option.minutes * 60000).toISOString())
                    }
                    title={`Snooze ${option.label}`}
                    className="hidden rounded px-1.5 py-1 transition-colors hover:bg-destructive/12 hover:text-foreground sm:inline"
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onComplete(current)}
                  aria-label="Mark as done"
                  title="Mark as done"
                  className="rounded p-1 transition-colors hover:bg-destructive/12 hover:text-foreground"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDismiss(current)}
                  aria-label="Dismiss reminder"
                  title="Dismiss"
                  className="rounded p-1 transition-colors hover:bg-destructive/12 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>

                {reminders.length > 1 && (
                  <span className="ml-1 flex items-center gap-0.5 border-l border-border pl-1.5">
                    <button
                      type="button"
                      onClick={() => setIndex((value) => Math.max(0, value - 1))}
                      disabled={index === 0}
                      aria-label="Previous reminder"
                      className="rounded p-1 transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="tabular-nums">
                      {index + 1}/{reminders.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIndex((value) => Math.min(reminders.length - 1, value + 1))}
                      disabled={index === reminders.length - 1}
                      aria-label="Next reminder"
                      className="rounded p-1 transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}

                {hasPins && (
                  <button
                    type="button"
                    onClick={() => setPinsOpen((value) => !value)}
                    aria-label="Pinned thoughts"
                    title={`${pinned.length} pinned`}
                    className="ml-1 flex items-center gap-1 rounded px-1.5 py-1 tabular-nums transition-colors hover:bg-elevated hover:text-foreground"
                  >
                    <Pin className="h-3 w-3" />
                    {pinned.length}
                  </button>
                )}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setPinsOpen((value) => !value)}
              className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-[11px] tracking-wide text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
            >
              <Pin className="h-3 w-3" />
              <span>
                {pinned.length} pinned {pinned.length === 1 ? "thought" : "thoughts"}
              </span>
              <ChevronDown
                className={cn("ml-auto h-3.5 w-3.5 transition-transform", pinsOpen && "rotate-180")}
              />
            </button>
          )}
        </div>

        {pinsOpen && hasPins && (
          <ul className="border-t border-border/60 py-1.5">
            {pinned.map((message) => (
              <li key={message.id} className="group flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onJump(message.id)}
                  className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-[12px] text-foreground/85 transition-colors hover:bg-elevated hover:text-foreground"
                >
                  {message.content || "Empty note"}
                </button>
                <button
                  type="button"
                  onClick={() => onUnpin(message)}
                  aria-label="Unpin"
                  title="Unpin"
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-elevated hover:text-foreground group-hover:opacity-100"
                >
                  <PinOff className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
