import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { pickDefaultTagColor } from "./tag-colors";
import type { LearnMode } from "./suggestions";

type Client = SupabaseClient<Database>;

/**
 * Applying a suggestion tags every message it was gathered from in one step —
 * the user approves the concept once, not once per message. A tag is only ever
 * created here, at the moment of approval.
 */
export async function applySuggestion(
  supabase: Client,
  userId: string,
  id: string,
  learnMode: LearnMode,
): Promise<number> {
  const suggestion = await supabase
    .from("tag_suggestions")
    .select(
      "id, kind, tag_id, name, normalized_name, reason, suggested_group_id, message_ids, status, conversation_id",
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (suggestion.error) throw suggestion.error;
  const row = suggestion.data;
  if (!row || row.status !== "pending") return 0;

  let tagId = row.tag_id;
  if (!tagId) {
    const existing = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", userId)
      .eq("conversation_id", row.conversation_id)
      .eq("normalized_name", row.normalized_name)
      .maybeSingle();
    tagId = existing.data?.id ?? null;
  }

  if (!tagId) {
    const created = await supabase
      .from("tags")
      .insert({
        user_id: userId,
        conversation_id: row.conversation_id,
        name: row.name,
        normalized_name: row.normalized_name,
        color: pickDefaultTagColor(row.normalized_name),
        // The suggestion's own explanation becomes the tag's starting rule.
        context: learnMode === "once" ? "" : row.reason,
        is_enabled: learnMode !== "once",
        auto_apply: learnMode === "auto",
        group_id: row.suggested_group_id ?? null,
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    tagId = created.data.id;
  } else {
    await supabase
      .from("tags")
      .update({ auto_apply: learnMode === "auto", is_enabled: learnMode !== "once" })
      .eq("id", tagId)
      .eq("user_id", userId);
  }

  const messageIds = (row.message_ids ?? []).slice(0, 500);
  if (messageIds.length) {
    await supabase.from("message_tags").upsert(
      messageIds.map((messageId) => ({
        user_id: userId,
        message_id: messageId,
        tag_id: tagId!,
        source: "user",
      })),
      { onConflict: "message_id,tag_id" },
    );
  }

  await supabase
    .from("tag_suggestions")
    .update({ status: "applied", tag_id: tagId })
    .eq("id", row.id)
    .eq("user_id", userId);

  return messageIds.length;
}

export async function ignoreSuggestion(supabase: Client, userId: string, id: string) {
  // Ignored stays ignored: the same concept will not come back unprompted.
  const { error } = await supabase
    .from("tag_suggestions")
    .update({ status: "ignored" })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
  return { id };
}
