import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export type FlowTag = { id: string; name: string; color: string | null };

export type FlowMessage = {
  id: string;
  content: string;
  is_completed: boolean;
  completed_at: string | null;
  ai_status: string;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
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

export async function loadStream(supabase: Client, userId: string): Promise<FlowMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, content, is_completed, completed_at, ai_status, created_at, updated_at, edited_at, message_tags(tag_id, tags(id, name, color))",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const links = (row.message_tags ?? []) as Array<{
      tags: { id: string; name: string; color: string | null } | null;
    }>;
    return {
      id: row.id,
      content: row.content,
      is_completed: row.is_completed,
      completed_at: row.completed_at,
      ai_status: row.ai_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      edited_at: row.edited_at,
      tags: links
        .map((link) => link.tags)
        .filter((tag): tag is FlowTag => Boolean(tag))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

type AiResult = { tags: string[]; summary: string; topics: string[] };

async function askAi(
  content: string,
  existingTags: string[],
  rules: Array<{ tag_name: string; context: string }>,
): Promise<AiResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured");

  const rulesText = rules.length
    ? rules.map((r) => `- Tag "${r.tag_name}": ${r.context}`).join("\n")
    : "(none)";

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
            "You organize a person's stream of personal thoughts.",
            "Given one thought, return 1-3 concise reusable tags, a one-sentence summary, and key topics.",
            "Strongly prefer reusing an existing tag when it means the same concept; never invent a near-duplicate (e.g. do not add 'Trips' when 'Travel' exists).",
            "Tags are short Title Case concepts (project, person, place, product, or theme). No hashtags, no sentences.",
            "Apply the user's context rules: if a thought matches a rule's context, include that rule's tag.",
            'Respond ONLY with JSON: {"tags":["..."],"summary":"...","topics":["..."]}',
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Existing tags: ${existingTags.length ? existingTags.join(", ") : "(none yet)"}`,
            `User context rules:\n${rulesText}`,
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
      supabase.from("tags").select("id, name, normalized_name").eq("user_id", userId),
      supabase
        .from("context_rules")
        .select("tag_name, context")
        .eq("user_id", userId)
        .eq("is_enabled", true),
    ]);

    const existing = tagRows.data ?? [];
    const result = await askAi(
      message.data.content,
      existing.map((t) => t.name),
      ruleRows.data ?? [],
    );

    const tagIds: string[] = [];
    for (const rawName of result.tags) {
      const name = rawName.trim().slice(0, 60);
      const normalized = normalizeTag(name);
      if (!normalized) continue;

      const match = existing.find((t) => t.normalized_name === normalized);
      if (match) {
        tagIds.push(match.id);
        continue;
      }
      const inserted = await supabase
        .from("tags")
        .upsert(
          { user_id: userId, name, normalized_name: normalized },
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
