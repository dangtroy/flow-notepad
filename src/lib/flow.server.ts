import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export type FlowTag = { id: string; name: string; color: string | null };

export type FlowMessage = {
  id: string;
  content: string;
  content_html: string | null;
  is_completed: boolean;
  completed_at: string | null;
  ai_status: string;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  parent_message_id: string | null;
  /** true once AI writing cleanup was applied to this note (shows the ✦ mark). */
  ai_cleaned: boolean;
  /** Exactly what the user typed before cleanup, kept forever. */
  original_content: string | null;
  original_content_html: string | null;
  /** Pinned notes stay reachable from a slim strip above the stream. */
  is_pinned: boolean;
  pinned_at: string | null;
  /** When set, Flow raises a quiet in-app alert at this time. */
  remind_at: string | null;
  reminder_dismissed_at: string | null;
  tags: FlowTag[];
};



export { normalizeTag } from "./tag-normalize";



export async function ensurePreferences(supabase: Client, userId: string) {
  const existing = await supabase
    .from("user_preferences")
    .select("user_id, completed_retention_days")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.data) return existing.data;

  const created = await supabase
    .from("user_preferences")
    .insert({ user_id: userId, completed_retention_days: 7 })
    .select("user_id, completed_retention_days")
    .single();
  if (created.error) throw created.error;
  return created.data;
}

export const MESSAGE_SELECT =
  "id, content, content_html, is_completed, completed_at, ai_status, created_at, updated_at, edited_at, parent_message_id, ai_cleaned, original_content, original_content_html, is_pinned, pinned_at, remind_at, reminder_dismissed_at, message_tags(tag_id, tags(id, name, color))";

type MessageRow = {
  id: string;
  content: string;
  content_html: string | null;
  is_completed: boolean;
  completed_at: string | null;
  ai_status: string;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  parent_message_id: string | null;
  ai_cleaned?: boolean | null;
  original_content?: string | null;
  original_content_html?: string | null;
  is_pinned?: boolean | null;
  pinned_at?: string | null;
  remind_at?: string | null;
  reminder_dismissed_at?: string | null;
  message_tags?: Array<{ tags: FlowTag | null }> | null;
};

export function mapMessage(row: MessageRow): FlowMessage {
  const links = (row.message_tags ?? []) as Array<{ tags: FlowTag | null }>;
  return {
    id: row.id,
    content: row.content,
    content_html: row.content_html,
    is_completed: row.is_completed,
    completed_at: row.completed_at,
    ai_status: row.ai_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    edited_at: row.edited_at,
    parent_message_id: row.parent_message_id ?? null,
    ai_cleaned: row.ai_cleaned ?? false,
    original_content: row.original_content ?? null,
    original_content_html: row.original_content_html ?? null,
    is_pinned: row.is_pinned ?? false,
    pinned_at: row.pinned_at ?? null,
    remind_at: row.remind_at ?? null,
    reminder_dismissed_at: row.reminder_dismissed_at ?? null,
    tags: links
      .map((link) => link.tags)
      .filter((tag): tag is FlowTag => Boolean(tag))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}



export type StreamPage = {
  /** Ascending (oldest first) so the page can be appended above what's shown. */
  messages: FlowMessage[];
  /** Cursor for the next, older page. Null when the beginning is reached. */
  nextCursor: string | null;
};

export type FilterMode = "or" | "and";

/**
 * Tags are a filter layer over the one conversation — never a copy of it. This
 * resolves the selected tags to the message ids they point at; the stream query
 * then narrows the same permanent conversation to those ids.
 */
export async function resolveTaggedMessageIds(
  supabase: Client,
  userId: string,
  tagIds: string[],
  mode: FilterMode,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("message_tags")
    .select("message_id, tag_id")
    .eq("user_id", userId)
    .in("tag_id", tagIds);
  if (error) throw error;

  const byMessage = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const set = byMessage.get(row.message_id) ?? new Set<string>();
    set.add(row.tag_id);
    byMessage.set(row.message_id, set);
  }

  const wanted = new Set(tagIds);
  const matches: string[] = [];
  for (const [messageId, tags] of byMessage) {
    if (mode === "and") {
      let all = true;
      for (const tagId of wanted) if (!tags.has(tagId)) all = false;
      if (all) matches.push(messageId);
    } else {
      matches.push(messageId);
    }
  }
  return matches;
}

/**
 * Keyset pagination over the stream: newest first from the database, returned
 * oldest-first for rendering. The conversation can grow to tens of thousands of
 * messages without the browser ever holding all of it.
 */
export async function loadStreamPage(
  supabase: Client,
  userId: string,
  notepadId: string,
  options: { limit: number; before?: string | null; tagIds?: string[]; mode?: FilterMode },
): Promise<StreamPage> {
  const tagIds = options.tagIds ?? [];
  let ids: string[] | null = null;
  if (tagIds.length) {
    ids = await resolveTaggedMessageIds(supabase, userId, tagIds, options.mode ?? "or");
    if (!ids.length) return { messages: [], nextCursor: null };
  }

  let query = supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("user_id", userId)
    .eq("conversation_id", notepadId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(options.limit + 1);
  if (ids) query = query.in("id", ids);
  if (options.before) query = query.lt("created_at", options.before);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as MessageRow[];
  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const oldest = page[page.length - 1];

  return {
    messages: page.map(mapMessage).reverse(),
    nextCursor: hasMore && oldest ? oldest.created_at : null,
  };
}

export type FlowTagDetail = {
  id: string;
  name: string;
  color: string | null;
  context: string;
  is_enabled: boolean;
  message_count: number;
  group_id: string | null;
  is_pinned: boolean;
  sort_order: number;
  /** Literal words that apply this tag with no AI call at all. */
  match_keywords: string[];
  /** false = Flow only ever suggests this tag, never applies it silently. */
  auto_apply: boolean;
};

/** Groups are the user's own organizing layer over AI-applied tags. */
export type FlowTagGroup = {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  is_collapsed: boolean;
  /** Broad, plain-English context the AI may weigh alongside child tags. */
  context: string;
  /** Unique messages across all child tags. */
  message_count: number;
};

/** One reusable list of tags with derived counts — the source for filters and management. */
export async function loadTags(
  supabase: Client,
  userId: string,
  notepadId: string,
): Promise<FlowTagDetail[]> {
  const [tagRows, countRows] = await Promise.all([
    supabase
      .from("tags")
      .select(
        "id, name, color, context, is_enabled, group_id, is_pinned, sort_order, match_keywords, auto_apply",
      )
      .eq("user_id", userId)
      .eq("conversation_id", notepadId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.rpc("tag_message_counts" as never, { p_conversation_id: notepadId } as never),
  ]);
  if (tagRows.error) throw tagRows.error;

  const counts = new Map<string, number>();
  for (const row of (countRows.data ?? []) as Array<{ tag_id: string; message_count: number }>) {
    counts.set(row.tag_id, Number(row.message_count));
  }

  return (tagRows.data ?? []).map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    context: (tag as { context?: string }).context ?? "",
    is_enabled: (tag as { is_enabled?: boolean }).is_enabled ?? true,
    message_count: counts.get(tag.id) ?? 0,
    group_id: (tag as { group_id?: string | null }).group_id ?? null,
    is_pinned: (tag as { is_pinned?: boolean }).is_pinned ?? false,
    sort_order: (tag as { sort_order?: number }).sort_order ?? 0,
    match_keywords: (tag as { match_keywords?: string[] | null }).match_keywords ?? [],
    auto_apply: (tag as { auto_apply?: boolean }).auto_apply ?? true,
  }));
}


export async function loadTagGroups(
  supabase: Client,
  userId: string,
  notepadId: string,
): Promise<FlowTagGroup[]> {
  const [groups, counts] = await Promise.all([
    supabase
      .from("tag_groups")
      .select("id, name, color, sort_order, is_collapsed, context")
      .eq("user_id", userId)
      .eq("conversation_id", notepadId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    // Unique messages per group: a note tagged twice inside one group counts once.
    supabase.rpc("group_message_counts" as never, { p_conversation_id: notepadId } as never),
  ]);
  if (groups.error) throw groups.error;

  const byGroup = new Map<string, number>();
  for (const row of (counts.data ?? []) as Array<{ group_id: string; message_count: number }>) {
    byGroup.set(row.group_id, Number(row.message_count));
  }

  return (groups.data ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    color: group.color,
    sort_order: group.sort_order,
    is_collapsed: group.is_collapsed,
    context: (group as { context?: string }).context ?? "",
    message_count: byGroup.get(group.id) ?? 0,
  }));
}



export async function loadMessage(
  supabase: Client,
  userId: string,
  id: string,
): Promise<FlowMessage | null> {
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapMessage(data as unknown as MessageRow) : null;
}


/* Organizing lives in organize.server.ts: deterministic rules first, then a
   small, tightly scoped AI classification step. */


/**
 * Permanently removes completed messages whose retention window has passed and
 * records each removal in the deletion log. Unfinished messages are never touched.
 */
export async function runRetention(supabase: Client, userId: string, notepadId: string) {
  const notepad = await supabase
    .from("conversations")
    .select("completed_retention_days")
    .eq("id", notepadId)
    .eq("user_id", userId)
    .maybeSingle();
  const days = notepad.data?.completed_retention_days;
  if (days === null || days === undefined) return { deleted: 0 };

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const expired = await supabase
    .from("messages")
    .select("id, content, completed_at, created_at")
    .eq("user_id", userId)
    .eq("conversation_id", notepadId)
    .eq("is_completed", true)
    .not("completed_at", "is", null)
    .lt("completed_at", cutoff);
  if (expired.error) throw expired.error;

  const rows = expired.data ?? [];
  if (!rows.length) return { deleted: 0 };

  await supabase.from("deletion_log").insert(
    rows.map((row) => ({
      user_id: userId,
      message_id: row.id,
      content_snapshot: row.content,
      completed_at: row.completed_at,
      message_created_at: row.created_at,
      reason: "retention",
    })),
  );

  const removed = await supabase
    .from("messages")
    .delete()
    .eq("user_id", userId)
    .in(
      "id",
      rows.map((row) => row.id),
    );
  if (removed.error) throw removed.error;

  return { deleted: rows.length };
}

/** Pinned notes for the slim strip above the stream — newest pin first. */
export async function loadPinnedMessages(
  supabase: Client,
  userId: string,
  notepadId: string,
): Promise<FlowMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("user_id", userId)
    .eq("conversation_id", notepadId)
    .eq("is_pinned", true)
    .order("pinned_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as unknown as MessageRow[]).map(mapMessage);
}

/**
 * Reminders that have come due and haven't been dismissed. Shown one at a time
 * in a quiet banner the user can page through.
 */
export async function loadDueReminders(
  supabase: Client,
  userId: string,
  notepadId: string,
): Promise<FlowMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("user_id", userId)
    .eq("conversation_id", notepadId)
    .not("remind_at", "is", null)
    .lte("remind_at", new Date().toISOString())
    .is("reminder_dismissed_at", null)
    .order("remind_at", { ascending: true })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as unknown as MessageRow[]).map(mapMessage);
}
