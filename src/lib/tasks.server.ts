import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import type { FlowTag } from "./flow.server";

type Client = SupabaseClient<Database>;

/**
 * A task is not a record of its own: it is a note carrying a tag in the "Tasks"
 * group. The `task_messages` view answers "is this a task", so there is only
 * ever one answer and it can never drift from tagging.
 */
export type FlowTask = {
  id: string;
  content: string;
  content_html: string | null;
  /** AI's imperative restatement, when it wrote one. Never replaces content. */
  label: string | null;
  is_completed: boolean;
  completed_at: string | null;
  due_at: string | null;
  due_is_fuzzy: boolean;
  task_priority: "low" | "normal" | "high" | null;
  is_overdue: boolean;
  created_at: string;
  tags: FlowTag[];
  /** The Tasks-group tags on this note — removing them un-tasks it. */
  taskTagIds: string[];
};

const PRIORITIES = new Set(["low", "normal", "high"]);

/** Ids of the tags that make a note a task in this notepad. */
export async function loadTaskTagIds(
  supabase: Client,
  userId: string,
  notepadId: string,
): Promise<string[]> {
  const groups = await supabase
    .from("tag_groups")
    .select("id, name")
    .eq("user_id", userId)
    .eq("conversation_id", notepadId);
  if (groups.error) throw groups.error;

  const groupIds = (groups.data ?? [])
    .filter((group) => group.name.trim().toLowerCase() === "tasks")
    .map((group) => group.id);
  if (!groupIds.length) return [];

  const tags = await supabase
    .from("tags")
    .select("id")
    .eq("user_id", userId)
    .eq("conversation_id", notepadId)
    .in("group_id", groupIds);
  if (tags.error) throw tags.error;
  return (tags.data ?? []).map((tag) => tag.id);
}

export async function loadTasks(
  supabase: Client,
  userId: string,
  notepadId: string,
  limit = 400,
): Promise<FlowTask[]> {
  const rows = await supabase
    .from("task_messages")
    .select(
      "id, content, content_html, is_completed, completed_at, due_at, due_is_fuzzy, task_priority, is_overdue, created_at, metadata",
    )
    .eq("user_id", userId)
    .eq("conversation_id", notepadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (rows.error) throw rows.error;

  const list = rows.data ?? [];
  if (!list.length) return [];

  const ids = list.map((row) => row.id).filter((id): id is string => Boolean(id));
  const [links, taskTagIds] = await Promise.all([
    supabase
      .from("message_tags")
      .select("message_id, tags(id, name, color)")
      .eq("user_id", userId)
      .in("message_id", ids),
    loadTaskTagIds(supabase, userId, notepadId),
  ]);
  if (links.error) throw links.error;

  const taskTags = new Set(taskTagIds);
  const byMessage = new Map<string, FlowTag[]>();
  for (const link of links.data ?? []) {
    const tag = link.tags as FlowTag | null;
    if (!tag || !link.message_id) continue;
    const current = byMessage.get(link.message_id) ?? [];
    current.push(tag);
    byMessage.set(link.message_id, current);
  }

  return list
    .filter((row): row is typeof row & { id: string } => Boolean(row.id))
    .map((row) => {
      const tags = (byMessage.get(row.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const label = typeof metadata["task_label"] === "string" ? metadata["task_label"] : null;
      const priority = String(row.task_priority ?? "");
      return {
        id: row.id,
        content: row.content ?? "",
        content_html: row.content_html ?? null,
        label: label && label.trim() ? label.trim() : null,
        is_completed: Boolean(row.is_completed),
        completed_at: row.completed_at ?? null,
        due_at: row.due_at ?? null,
        due_is_fuzzy: Boolean(row.due_is_fuzzy),
        task_priority: PRIORITIES.has(priority) ? (priority as FlowTask["task_priority"]) : null,
        is_overdue: Boolean(row.is_overdue),
        created_at: row.created_at ?? new Date().toISOString(),
        tags,
        taskTagIds: tags.filter((tag) => taskTags.has(tag.id)).map((tag) => tag.id),
      };
    });
}
