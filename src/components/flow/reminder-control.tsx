import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Local `datetime-local` value for an instant, so quick picks prefill the field. */
function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function atHour(daysAhead: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  return date;
}

export function reminderLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (same(date, today)) return `Today ${time}`;
  if (same(date, tomorrow)) return `Tomorrow ${time}`;
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

/**
 * Quiet reminder picker: a few natural quick picks plus an exact date and time.
 * Reminders are in-app only — Flow raises a banner at the top of the stream.
 */
export function ReminderPopover({
  value,
  onChange,
  children,
  align = "start",
  side = "top",
  open: openProp,
  onOpenChange,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = openProp ?? uncontrolled;
  const setOpen = (next: boolean) => {
    setUncontrolled(next);
    onOpenChange?.(next);
  };
  const [draft, setDraft] = useState(() => toLocalInput(value ? new Date(value) : atHour(0, 18)));

  function commit(date: Date | null) {
    onChange(date ? date.toISOString() : null);
    setOpen(false);
  }

  const quickPicks: Array<{ label: string; date: Date }> = [
    { label: "In 1 hour", date: new Date(Date.now() + 3600000) },
    { label: "Tonight 8:00 PM", date: atHour(0, 20) },
    { label: "Tomorrow 9:00 AM", date: atHour(1, 9) },
    { label: "Next week", date: atHour(7, 9) },
  ];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(toLocalInput(value ? new Date(value) : atHour(0, 18)));
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        onClick={(event) => event.stopPropagation()}
        className="w-[min(17rem,86vw)] p-3"
      >
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">Remind me</p>

        <div className="mt-2 flex flex-col">
          {quickPicks.map((pick) => (
            <button
              key={pick.label}
              type="button"
              onClick={() => commit(pick.date)}
              className="-mx-1.5 rounded px-1.5 py-1.5 text-left text-[12px] text-foreground/85 transition-colors hover:bg-elevated hover:text-foreground"
            >
              {pick.label}
            </button>
          ))}
        </div>

        <div className="mt-2.5 border-t border-border pt-2.5">
          <label className="text-[11px] text-muted-foreground" htmlFor="reminder-at">
            Pick a date &amp; time
          </label>
          <input
            id="reminder-at"
            type="datetime-local"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-foreground outline-none focus:border-primary/60"
          />
          <div className="mt-2.5 flex items-center justify-between text-[11px]">
            {value ? (
              <button
                type="button"
                onClick={() => commit(null)}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                Remove reminder
              </button>
            ) : (
              <span className="text-muted-foreground/50">In-app alert</span>
            )}
            <button
              type="button"
              disabled={!draft}
              onClick={() => draft && commit(new Date(draft))}
              className={cn(
                "text-primary transition-opacity hover:brightness-110",
                !draft && "opacity-40",
              )}
            >
              {value ? "Update" : "Set reminder"}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
