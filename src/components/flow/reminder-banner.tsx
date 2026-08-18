import { useEffect, useState } from "react";
import { Bell, Check, ChevronLeft, ChevronRight, X } from "lucide-react";

import type { FlowMessage } from "@/lib/flow.server";
import { reminderLabel } from "./reminder-control";

const SNOOZE = [
  { label: "10m", minutes: 10 },
  { label: "1h", minutes: 60 },
  { label: "Tomorrow", minutes: 60 * 24 },
];

/**
 * One due reminder at a time, at the very top of the stream. Arrows page
 * through the rest so a pile-up never becomes a wall of alerts.
 */
export function ReminderBanner({
  reminders,
  onSnooze,
  onComplete,
  onDismiss,
  onJump,
}: {
  reminders: FlowMessage[];
  onSnooze: (message: FlowMessage, iso: string) => void;
  onComplete: (message: FlowMessage) => void;
  onDismiss: (message: FlowMessage) => void;
  onJump: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index > reminders.length - 1) setIndex(Math.max(0, reminders.length - 1));
  }, [reminders.length, index]);

  const current = reminders[index];
  if (!current) return null;

  return (
    <div className="border-b border-primary/25 bg-primary/[0.07] px-5 sm:px-8">
      <div className="flow-shell flex items-center gap-3 py-2.5">
        <Bell className="h-3.5 w-3.5 shrink-0 text-primary" />

        <button
          type="button"
          onClick={() => onJump(current.id)}
          className="min-w-0 flex-1 truncate text-left text-[12.5px] text-foreground/90 transition-colors hover:text-foreground"
        >
          <span className="text-muted-foreground">{reminderLabel(current.remind_at ?? current.created_at)} · </span>
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
              className="rounded px-1.5 py-1 transition-colors hover:bg-elevated hover:text-foreground"
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onComplete(current)}
            aria-label="Mark as done"
            title="Mark as done"
            className="rounded p-1 transition-colors hover:bg-elevated hover:text-foreground"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDismiss(current)}
            aria-label="Dismiss reminder"
            title="Dismiss"
            className="rounded p-1 transition-colors hover:bg-elevated hover:text-foreground"
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
        </div>
      </div>
    </div>
  );
}
