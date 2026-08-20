import { useState } from "react";
import { Bell, Check, ChevronLeft, ChevronRight, Pin, PinOff, X } from "lucide-react";

import type { FlowMessage } from "@/lib/flow.server";
import { cn, timeAgo } from "@/lib/utils";
import { reminderLabel } from "./reminder-control";

const SNOOZE = [
  { label: "10m", minutes: 10 },
  { label: "1h", minutes: 60 },
  { label: "Tomorrow", minutes: 60 * 24 },
];

const PREVIEW = 2;

function Badge({ value }: { value: number }) {
  return (
    <span className="shrink-0 rounded-full bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground/70">
      {value}
    </span>
  );
}

function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
        {children}
      </span>
      {count !== undefined && <Badge value={count} />}
    </div>
  );
}

function dayTime(iso: string) {
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${date.toLocaleTimeString(
    undefined,
    { hour: "numeric", minute: "2-digit" },
  )}`;
}

/**
 * The right-hand rail holds everything asking for attention: due reminders,
 * pinned thoughts, and a quiet weekly summary. It replaces the old top strip so
 * the stream itself keeps the full height of the window.
 */
export function AttentionRail({
  open,
  onOpenChange,
  reminders,
  pinned,
  stats,
  onSnooze,
  onComplete,
  onDismiss,
  onUnpin,
  onJump,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminders: FlowMessage[];
  pinned: FlowMessage[];
  stats: { captured: number; completed: number; references: number };
  onSnooze: (message: FlowMessage, iso: string) => void;
  onComplete: (message: FlowMessage) => void;
  onDismiss: (message: FlowMessage) => void;
  onUnpin: (message: FlowMessage) => void;
  onJump: (id: string) => void;
}) {
  const [allReminders, setAllReminders] = useState(false);
  const [allPinned, setAllPinned] = useState(false);

  const total = reminders.length + pinned.length;

  if (!open) {
    return (
      <aside className="hidden w-[46px] shrink-0 border-l border-border bg-surface/40 lg:flex lg:flex-col lg:items-center lg:gap-3 lg:py-4">
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label="Show attention panel"
          title="Show panel"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {total > 0 && <Badge value={total} />}
        <span
          className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55"
          style={{ writingMode: "vertical-rl" }}
        >
          Needs Attention
        </span>
      </aside>
    );
  }

  const shownReminders = allReminders ? reminders : reminders.slice(0, PREVIEW);
  const shownPinned = allPinned ? pinned : pinned.slice(0, PREVIEW);

  return (
    <aside className="hidden w-[19rem] shrink-0 flex-col border-l border-border bg-surface/40 lg:flex">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <span className="flex-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
          Needs Attention
        </span>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
        >
          Hide
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
        <section>
          <SectionLabel count={reminders.length}>Reminders</SectionLabel>
          {reminders.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/60">Nothing waiting on you.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {shownReminders.map((message) => {
                const at = message.remind_at ?? message.created_at;
                const overdue = new Date(at).getTime() <= Date.now();
                return (
                  <li
                    key={message.id}
                    className="rounded-lg border border-border bg-background/40 p-2.5 transition-colors hover:border-border/80"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          overdue ? "bg-destructive" : "bg-muted-foreground/40",
                        )}
                      />
                      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
                        {overdue ? "Overdue" : `Reminder · ${timeAgo(at)}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onJump(message.id)}
                      className="mt-1.5 block w-full text-left text-[12.5px] leading-relaxed text-foreground/90 transition-colors hover:text-foreground"
                    >
                      <span className="line-clamp-3">{message.content || "Empty note"}</span>
                    </button>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/60">
                      <Bell className="h-3 w-3" />
                      {reminderLabel(at)}
                    </p>
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                      {SNOOZE.map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() =>
                            onSnooze(
                              message,
                              new Date(Date.now() + option.minutes * 60000).toISOString(),
                            )
                          }
                          title={`Snooze ${option.label}`}
                          className="rounded px-1.5 py-1 transition-colors hover:bg-elevated hover:text-foreground"
                        >
                          {option.label}
                        </button>
                      ))}
                      <span className="ml-auto flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onComplete(message)}
                          aria-label="Mark as done"
                          title="Done"
                          className="rounded p-1 transition-colors hover:bg-elevated hover:text-foreground"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDismiss(message)}
                          aria-label="Clear reminder"
                          title="Clear"
                          className="rounded p-1 transition-colors hover:bg-elevated hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {reminders.length > PREVIEW && (
            <button
              type="button"
              onClick={() => setAllReminders((value) => !value)}
              className="mt-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {allReminders ? "Show fewer" : `${reminders.length - PREVIEW} more reminders`}
            </button>
          )}
        </section>

        <section>
          <SectionLabel count={pinned.length}>Pinned</SectionLabel>
          {pinned.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/60">Nothing pinned.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {shownPinned.map((message) => (
                <li
                  key={message.id}
                  className="group rounded-lg border border-border bg-background/40 p-2.5 transition-colors hover:border-border/80"
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                    />
                    <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
                      Pinned
                    </span>
                    <button
                      type="button"
                      onClick={() => onUnpin(message)}
                      aria-label="Unpin"
                      title="Unpin"
                      className="ml-auto rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-elevated hover:text-foreground group-hover:opacity-100"
                    >
                      <PinOff className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onJump(message.id)}
                    className="mt-1.5 block w-full text-left text-[12.5px] leading-relaxed text-foreground/90 transition-colors hover:text-foreground"
                  >
                    <span className="line-clamp-3">{message.content || "Empty note"}</span>
                  </button>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/60">
                    <Pin className="h-3 w-3" />
                    {dayTime(message.pinned_at ?? message.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {pinned.length > PREVIEW && (
            <button
              type="button"
              onClick={() => setAllPinned((value) => !value)}
              className="mt-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {allPinned ? "Show fewer" : `${pinned.length - PREVIEW} more pinned`}
            </button>
          )}
        </section>

        <section>
          <SectionLabel>This Week</SectionLabel>
          <dl className="flex flex-col gap-1.5 text-[12px]">
            {[
              { label: "Captured", value: stats.captured },
              { label: "Completed", value: stats.completed },
              { label: "References kept", value: stats.references },
              { label: "Reminders due", value: reminders.length },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <dt className="text-muted-foreground/70">{row.label}</dt>
                <dd className="tabular-nums text-foreground/85">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </aside>
  );
}
