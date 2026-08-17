import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ensureConversation,
  ensurePreferences,
  loadMessage,
  loadStreamPage,
  MESSAGE_SELECT,
  mapMessage,
  normalizeTag,
  organizeMessage,
  runRetention,
} from "./flow.server";
import { htmlToText, isEmptyDocument, sanitizeHtml, textToHtml } from "./rich-text";
import { DEFAULT_TAG_COLOR, pickDefaultTagColor, TAG_COLOR_KEYS } from "./tag-colors";

export const getStreamPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { before?: string | null; limit?: number }) => ({
    before: input?.before ?? null,
    limit: Math.min(Math.max(input?.limit ?? 40, 5), 100),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const conversationId = await ensureConversation(supabase, userId);
    await ensurePreferences(supabase, userId);
    const page = await loadStreamPage(supabase, userId, { limit: data.limit, before: data.before });
    return { conversationId, ...page };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { html: string; parentMessageId?: string | null }) => {
    const html = sanitizeHtml(input?.html ?? "");
    if (!html || isEmptyDocument(html)) throw new Error("A thought cannot be empty");
    return {
      html: html.slice(0, 200000),
      text: htmlToText(html).slice(0, 20000),
      parentMessageId: input?.parentMessageId ?? null,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const conversationId = await ensureConversation(supabase, userId);

    // A reply must point at one of the user's own messages; anything else is top-level.
    let parentId: string | null = null;
    if (data.parentMessageId) {
      const parent = await supabase
        .from("messages")
        .select("id")
        .eq("id", data.parentMessageId)
        .eq("user_id", userId)
        .maybeSingle();
      parentId = parent.data?.id ?? null;
    }

    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        content: data.text,
        content_html: data.html,
        parent_message_id: parentId,
      })
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw error;
    return mapMessage(message as never);
  });


export const updateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; html: string }) => {
    if (!input?.id) throw new Error("Missing message");
    const html = sanitizeHtml(input?.html ?? "");
    if (!html || isEmptyDocument(html)) throw new Error("A thought cannot be empty");
    return {
      id: input.id,
      html: html.slice(0, 200000),
      text: htmlToText(html).slice(0, 20000),
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: message, error } = await supabase
      .from("messages")
      .update({
        content: data.text,
        content_html: data.html,
        ai_status: "pending",
        edited_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("user_id", userId)
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw error;
    return mapMessage(message as never);
  });

export const setMessageCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; completed: boolean }) => {
    if (!input?.id) throw new Error("Missing message");
    return { id: input.id, completed: Boolean(input.completed) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: message, error } = await supabase
      .from("messages")
      .update({
        is_completed: data.completed,
        completed_at: data.completed ? new Date().toISOString() : null,
      })
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("id, is_completed, completed_at, updated_at")
      .single();
    if (error) throw error;
    return message;
  });

/** Backfills the formatted document for rows written before rich text existed. */
export const backfillMessageHtml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Missing message");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const message = await loadMessage(context.supabase, context.userId, data.id);
    if (!message || message.content_html) return message;
    const html = textToHtml(message.content);
    await context.supabase
      .from("messages")
      .update({ content_html: html })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ...message, content_html: html };
  });

export const organizeMessageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Missing message");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const result = await organizeMessage(context.supabase, context.userId, data.id);
    const message = await loadMessage(context.supabase, context.userId, data.id);
    return { result, message };
  });


export const getPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const prefs = await ensurePreferences(context.supabase, context.userId);
    const log = await context.supabase
      .from("deletion_log")
      .select("id, content_snapshot, completed_at, deleted_at")
      .eq("user_id", context.userId)
      .order("deleted_at", { ascending: false })
      .limit(25);
    return {
      completedRetentionDays: prefs.completed_retention_days,
      deletionHistory: log.data ?? [],
    };
  });

export const updatePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { completedRetentionDays: number | null }) => ({
    completedRetentionDays:
      input?.completedRetentionDays === null || input?.completedRetentionDays === undefined
        ? null
        : Number(input.completedRetentionDays),
  }))
  .handler(async ({ data, context }) => {
    await ensurePreferences(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("user_preferences")
      .update({ completed_retention_days: data.completedRetentionDays })
      .eq("user_id", context.userId);
    if (error) throw error;
    return { completedRetentionDays: data.completedRetentionDays };
  });

export const listContextRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("context_rules")
      .select("id, tag_name, context, is_enabled, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const saveContextRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; tagName: string; context: string; isEnabled?: boolean }) => {
    const tagName = (input?.tagName ?? "").trim();
    if (!tagName) throw new Error("A rule needs a tag name");
    return {
      id: input?.id,
      tagName: tagName.slice(0, 60),
      context: (input?.context ?? "").trim().slice(0, 2000),
      isEnabled: input?.isEnabled ?? true,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      user_id: userId,
      tag_name: data.tagName,
      context: data.context,
      is_enabled: data.isEnabled,
    };

    if (data.id) {
      const { data: row, error } = await supabase
        .from("context_rules")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", userId)
        .select("id, tag_name, context, is_enabled, created_at")
        .single();
      if (error) throw error;
      return row;
    }

    const { data: row, error } = await supabase
      .from("context_rules")
      .insert(payload)
      .select("id, tag_name, context, is_enabled, created_at")
      .single();
    if (error) throw error;

    // Make the rule's tag available for reuse right away.
    const normalized = normalizeTag(data.tagName);
    if (normalized) {
      await supabase
        .from("tags")
        .upsert(
          {
            user_id: userId,
            name: data.tagName,
            normalized_name: normalized,
            color: pickDefaultTagColor(normalized),
          },
          { onConflict: "user_id,normalized_name" },
        );
    }
    return row;
  });

export const deleteContextRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Missing rule");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("context_rules")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { id: data.id };
  });

export const cleanupCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => runRetention(context.supabase, context.userId));

/** Tags are reusable entities; the AI layer and the user both link to the same rows. */
export const listTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tags")
      .select("id, name, color, created_at")
      .eq("user_id", context.userId)
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const updateTagColor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; color: string }) => {
    if (!input?.id) throw new Error("Missing tag");
    const color = TAG_COLOR_KEYS.includes(input?.color as never) ? input.color : DEFAULT_TAG_COLOR;
    return { id: input.id, color };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("tags")
      .update({ color: data.color })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id, name, color")
      .single();
    if (error) throw error;
    return row;
  });
