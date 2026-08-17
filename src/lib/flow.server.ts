import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { pickDefaultTagColor } from "./tag-colors";

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
  tags: FlowTag[];
};


export function normalizeTag(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}


export async function ensureConversation(supabase: Client, userId: string): Promise<string> {
  const existing = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.data?.id) return existing.data.id;

  const created = await supabase
    .from("conversations")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (created.error) throw created.error;
  return created.data.id;
}

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
  "id, content, content_html, is_completed, completed_at, ai_status, created_at, updated_at, edited_at, parent_message_id, message_tags(tag_id, tags(id, name, color))";

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
};

/** One reusable list of tags with derived counts — the source for filters and management. */
export async function loadTags(supabase: Client, userId: string): Promise<FlowTagDetail[]> {
  const [tagRows, countRows] = await Promise.all([
    supabase
      .from("tags")
      .select("id, name, color, context, is_enabled")
      .eq("user_id", userId)
      .order("name", { ascending: true }),
    supabase.rpc("tag_message_counts" as never),
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


type AiResult = { tags: string[]; summary: string; topics: string[] };

/**
 * Classification only — never invention. The model may pick from the user's own
 * tags and must justify each pick against that tag's written context rule.
 */
async function askAi(
  content: string,
  rules: Array<{ tag_name: string; context: string }>,
): Promise<AiResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured");

  const rulesText = rules.map((r) => `- "${r.tag_name}": ${r.context}`).join("\n");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      messages: [
        {
          role: "system",
          content: [
            "You classify one personal thought against a fixed list of user-defined tags.",
            "You may ONLY use tag names from the provided list, copied exactly. Never invent, rename, pluralise, or suggest any other tag.",
            "Select a tag only when the thought clearly matches that tag's context rule, judged by meaning rather than keywords.",
            "If no rule matches, return an empty tags array. Returning no tags is correct and expected.",
            "Also return a one-sentence summary and key topics.",
            'Respond ONLY with JSON: {"tags":["..."],"summary":"...","topics":["..."]}',
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Allowed tags and their context rules:\n${rulesText}`,
            `Thought: ${content}`,
          ].join("\n\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI gateway error ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = payload.choices?.[0]?.message?.content ?? "";
  const jsonText = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  const parsed = JSON.parse(jsonText) as Partial<AiResult>;

  return {
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === "string").slice(0, 4) : [],
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    topics: Array.isArray(parsed.topics) ? parsed.topics.filter((t) => typeof t === "string") : [],
  };
}

/**
 * Organizes one message in the background. Never called before the message is
 * saved, and any failure leaves the message itself untouched.
 */
export async function organizeMessage(supabase: Client, userId: string, messageId: string) {
  const message = await supabase
    .from("messages")
    .select("id, content")
    .eq("id", messageId)
    .eq("user_id", userId)
    .maybeSingle();
  if (message.error) throw message.error;
  if (!message.data) return { ok: false as const, reason: "not_found" };

  try {
    const [tagRows, ruleRows] = await Promise.all([
      supabase
        .from("tags")
        .select("id, name, normalized_name, context, is_enabled")
        .eq("user_id", userId),
      supabase
        .from("context_rules")
        .select("tag_name, context")
        .eq("user_id", userId)
        .eq("is_enabled", true),
    ]);

    const existing = (tagRows.data ?? []) as Array<{
      id: string;
      name: string;
      normalized_name: string;
      context?: string | null;
      is_enabled?: boolean | null;
    }>;
    // A disabled tag stays a real tag; it is simply never applied automatically.
    const disabled = new Set(existing.filter((t) => t.is_enabled === false).map((t) => t.id));

    // Each tag carries its own plain-English context; legacy standalone rules still count.
    const rules = [
      ...existing
        .filter((t) => t.is_enabled !== false && (t.context ?? "").trim())
        .map((t) => ({ tag_name: t.name, context: (t.context ?? "").trim() })),
      ...(ruleRows.data ?? []),
    ];

    const result = await askAi(
      message.data.content,
      existing.filter((t) => t.is_enabled !== false).map((t) => t.name),
      rules,
    );

    const tagIds: string[] = [];
    for (const rawName of result.tags) {
      const name = rawName.trim().slice(0, 60);
      const normalized = normalizeTag(name);
      if (!normalized) continue;

      const match = existing.find((t) => t.normalized_name === normalized);
      if (match) {
        if (!disabled.has(match.id)) tagIds.push(match.id);
        continue;
      }
      const inserted = await supabase
        .from("tags")
        .upsert(
          {
            user_id: userId,
            name,
            normalized_name: normalized,
            color: pickDefaultTagColor(normalized),
          },
          { onConflict: "user_id,normalized_name" },
        )
        .select("id, name, normalized_name")
        .single();

      if (inserted.data) {
        existing.push(inserted.data);
        tagIds.push(inserted.data.id);
      }
    }

    // Replace AI-applied tags for this message; user-applied links are kept.
    await supabase.from("message_tags").delete().eq("message_id", messageId).eq("source", "ai");
    if (tagIds.length) {
      await supabase.from("message_tags").upsert(
        tagIds.map((tagId) => ({
          user_id: userId,
          message_id: messageId,
          tag_id: tagId,
          source: "ai",
        })),
        { onConflict: "message_id,tag_id" },
      );
    }

    await supabase
      .from("messages")
      .update({
        ai_status: "done",
        ai_processed_at: new Date().toISOString(),
        ai_error: null,
        ai_context: { summary: result.summary, topics: result.topics },
      })
      .eq("id", messageId)
      .eq("user_id", userId);

    return { ok: true as const };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "unknown AI error";
    await supabase
      .from("messages")
      .update({ ai_status: "failed", ai_error: messageText })
      .eq("id", messageId)
      .eq("user_id", userId);
    return { ok: false as const, reason: messageText };
  }
}

/**
 * Permanently removes completed messages whose retention window has passed and
 * records each removal in the deletion log. Unfinished messages are never touched.
 */
export async function runRetention(supabase: Client, userId: string) {
  const prefs = await ensurePreferences(supabase, userId);
  const days = prefs.completed_retention_days;
  if (days === null || days === undefined) return { deleted: 0 };

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const expired = await supabase
    .from("messages")
    .select("id, content, completed_at, created_at")
    .eq("user_id", userId)
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
