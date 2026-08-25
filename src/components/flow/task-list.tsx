import { useMemo } from "react";
import { CalendarDays } from "lucide-react";

import type { FlowTask } from "@/lib/tasks.server";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TagLink } from "./tag-chip";

type Bucket = { key: string; label: string; tasks: FlowTask[] };

const BUCKETS = ["overdue", "today", "week", "later", "none", "completed"] as const;
const BUCKET_LABELS: Record<(typeof BUCKETS)[number], string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  none: "No date",
  completed: "Completed",
};

function endOfToday(now: Date) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Completion wins over any date: a done task never reads as overdue. */
function bucketFor(task: FlowTask, now: Date): (typeof BUCKETS)[number] {
  if (task.is_completed) return "completed";
  if (!task.due_at) return "none";
  const due = new Date(task.due_at).getTime();
  const today = endOfToday(now).getTime();
  if (due < now.getTime()) return "overdue";
  if (due <= today) return "today";
  if (due <= today + 6 * 86400000) return "week";
  return "later";
}

export function groupTasks(tasks: FlowTask[], now = new Date()): Bucket[] {
  const byKey = new Map<string, FlowTask[]>();
  for (const task of tasks) {
    const key = bucketFor(task, now);
    byKey.set(key, [...(byKey.get(key) ?? []), task]);
  }
  return BUCKETS.filter((key) => (byKey.get(key) ?? []).length > 0).map((key) => ({
    key,
    label: BUCKET_LABELS[key],
    tasks: (byKey.get(key) ?? []).sort((a, b) => {
      if (a.due_at && b.due_at) return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      if (a.due_at) return -1;
      if (b.due_at) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }),
  }));
}

/** Short, human date. A fuzzy date is prefixed with ~ and never shows a time. */
function formatDue(task: FlowTask): string {
  if (!task.due_at) return "Add date";
  const due = new Date(task.due_at);
  const day = due.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (task.due_is_fuzzy) return `~${due.toLocaleDateString(undefined, { weekday: "long" })}`;
  const time = due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return due.getHours() || due.getMinutes() ? `${day}, ${time}` : day;
}

function atHour(days: number, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

/** A date the user picks here is exact by definition — the ~ disappears. */
function DuePicker({ task, onSetDue }: { task: FlowTask; onSetDue: (iso: string | null) => void }) {
  const options: Array<{ label: string; value: string | null }> = [
    { label: "Today", value: atHour(0, 18) },
    { label: "Tomorrow", value: atHour(1) },
    { label: "This weekend", value: atHour((6 - new Date().getDay() + 7) % 7 || 7, 10) },
    { label: "Next week", value: atHour(7) },
    { label: "No date", value: null },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Change due date"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums transition-colors",
            "hover:bg-elevated hover:text-foreground",
            task.is_overdue && !task.is_completed
              ? "text-destructive"
              : task.due_is_fuzzy
                ? "text-muted-foreground/55"
                : "text-muted-foreground",
            !task.due_at && "text-muted-foreground/45",
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.3} />
          {formatDue(task)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-1">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onSetDue(option.value)}
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
          >
            {option.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function TaskRow({
  task,
  onToggleComplete,
  onSetDue,
  onRemoveTask,
}: {
  task: FlowTask;
  onToggleComplete: (task: FlowTask) => void;
  onSetDue: (task: FlowTask, iso: string | null) => void;
  onRemoveTask: (task: FlowTask) => void;
}) {
  return (
    <div
      data-message-id={task.id}
      className="group flex items-start gap-3 border-b border-border/40 py-2.5 last:border-b-0"
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={task.is_completed}
        aria-label={task.is_completed ? "Mark as not done" : "Mark as done"}
        onClick={() => onToggleComplete(task)}
        className={cn(
          "mt-[3px] h-[14px] w-[14px] shrink-0 rounded-[3px] border transition-colors",
          task.is_completed
            ? "border-primary/60 bg-primary/70"
            : "border-border hover:border-muted-foreground",
        )}
      />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "flow-prose text-[0.9975rem] leading-[1.65]",
            task.is_completed && "line-through decoration-muted-foreground/50",
          )}
        >
          {task.label ?? task.content}
        </p>
        {task.label && (
          // The AI's imperative form is a display aid; the note's own words stay.
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground/50">{task.content}</p>
        )}
        {task.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {task.tags.map((tag) => (
              <TagLink key={tag.id} tag={tag} />
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {task.task_priority === "high" && (
          <span className="text-[11px] font-medium text-destructive/80">
            High
          </span>
        )}
        <DuePicker task={task} onSetDue={(iso) => onSetDue(task, iso)} />
        {task.taskTagIds.length > 0 && (
          <button
            type="button"
            title="Not a task"
            onClick={() => onRemoveTask(task)}
            className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground/45 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
          >
            Not a task
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Tasks are a view over the stream, not a second store: every row here is an
 * ordinary note that carries a tag in the Tasks group.
 */
export function TaskList({
  tasks,
  isPending,
  onToggleComplete,
  onSetDue,
  onRemoveTask,
}: {
  tasks: FlowTask[];
  isPending?: boolean;
  onToggleComplete: (task: FlowTask) => void;
  onSetDue: (task: FlowTask, iso: string | null) => void;
  onRemoveTask: (task: FlowTask) => void;
}) {
  const groups = useMemo(() => groupTasks(tasks), [tasks]);

  if (isPending) return <p className="text-[13px] text-muted-foreground">Gathering your tasks…</p>;

  if (!groups.length) {
    return (
      <div className="mt-24 text-center">
        <p className="flow-prose text-muted-foreground">
          Nothing to do. A note lands here when it carries a tag from your Tasks group.
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
                "text-[10px] uppercase tracking-[0.18em]",
                group.key === "overdue" ? "text-destructive/80" : "text-muted-foreground/50",
              )}
            >
              {group.label}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground/40">
              {group.tasks.length}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-col">
            {group.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggleComplete={onToggleComplete}
                onSetDue={onSetDue}
                onRemoveTask={onRemoveTask}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
