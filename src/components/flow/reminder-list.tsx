import { useMemo } from "react";
import { Check, X } from "lucide-react";

import type { FlowMessage } from "@/lib/flow.server";
import { cn } from "@/lib/utils";
import { TagLink } from "./tag-chip";

const SNOOZE = [
  { label: "10m", minutes: 10 },
  { label: "1h", minutes: 60 },
  { label: "Tomorrow", minutes: 60 * 24 },
];

const BUCKETS = ["overdue", "today", "tomorrow", "week", "later"] as const;
const LABELS: Record<(typeof BUCKETS)[number], string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
};

function endOfDay(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function bucketFor(iso: string): (typeof BUCKETS)[number] {
  const at = new Date(iso).getTime();
  if (at <= Date.now()) return "overdue";
  if (at <= endOfDay(0)) return "today";
  if (at <= endOfDay(1)) return "tomorrow";
  if (at <= endOfDay(6)) return "week";
  return "later";
}

function whenLabel(iso: string) {
  const date = new Date(iso);
  const day = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

/**
 * Reminders as their own quiet view: what's overdue first, then what's coming
 * up. Each row opens the note it belongs to.
 */
export function ReminderList({
  reminders,
  isPending,
  onOpenNote,
  onSnooze,
  onComplete,
  onDismiss,
}: {
  reminders: FlowMessage[];
  isPending?: boolean;
  onOpenNote: (message: FlowMessage) => void;
  onSnooze: (message: FlowMessage, iso: string) => void;
  onComplete: (message: FlowMessage) => void;
  onDismiss: (message: FlowMessage) => void;
}) {
  const groups = useMemo(() => {
    const byKey = new Map<string, FlowMessage[]>();
    for (const message of reminders) {
      if (!message.remind_at) continue;
      const key = bucketFor(message.remind_at);
      byKey.set(key, [...(byKey.get(key) ?? []), message]);
    }
    return BUCKETS.filter((key) => (byKey.get(key) ?? []).length > 0).map((key) => ({
      key,
      label: LABELS[key],
      items: byKey.get(key) ?? [],
    }));
  }, [reminders]);

  if (isPending) {
    return <p className="text-[13px] text-muted-foreground">Gathering your reminders…</p>;
  }

  if (!groups.length) {
    return (
      <div className="mt-24 text-center">
        <p className="flow-prose text-muted-foreground">
          Nothing waiting on you. Set a reminder on a note and it shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.key}>
          <div className="mb-3 flex items-center gap-3">
            <span
              className={cn(
                "text-[11px] font-medium",
                group.key === "overdue" ? "text-destructive/80" : "text-muted-foreground/50",
              )}
            >
              {group.label}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground/40">
              {group.items.length}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col">
            {group.items.map((message) => (
              <div
                key={message.id}
                className="group flex flex-wrap items-start gap-3 border-b border-border/40 py-2.5 last:border-b-0 sm:flex-nowrap"
              >
                <button
                  type="button"
                  onClick={() => onOpenNote(message)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p
                    className={cn(
                      "flow-prose text-[0.9975rem] leading-[1.65]",
                      message.is_completed && "line-through decoration-muted-foreground/50",
                    )}
                  >
                    {message.content || "Empty note"}
                  </p>
                  <span
                    className={cn(
                      "mt-0.5 block font-mono text-[11px] tabular-nums",
                      group.key === "overdue" ? "text-destructive/80" : "text-muted-foreground/55",
                    )}
                  >
                    {message.remind_at ? whenLabel(message.remind_at) : ""}
                  </span>
                </button>

                {message.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {message.tags.map((tag) => (
                      <TagLink key={tag.id} tag={tag} />
                    ))}
                  </div>
                )}

                <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/60">
                  {SNOOZE.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      title={`Snooze ${option.label}`}
                      onClick={() =>
                        onSnooze(
                          message,
                          new Date(Date.now() + option.minutes * 60000).toISOString(),
                        )
                      }
                      className="rounded px-1.5 py-1 transition-colors hover:bg-elevated hover:text-foreground"
                    >
                      {option.label}
                    </button>
                  ))}
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
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
