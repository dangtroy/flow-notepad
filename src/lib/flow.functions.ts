import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ensureConversation,
  ensurePreferences,
  loadMessage,
  loadStreamPage,
  loadTagGroups,
  loadTags,
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
  .inputValidator(
    (input?: {
      before?: string | null;
      limit?: number;
      tagIds?: string[];
      mode?: "or" | "and";
    }) => ({
      before: input?.before ?? null,
      limit: Math.min(Math.max(input?.limit ?? 40, 5), 100),
      tagIds: Array.isArray(input?.tagIds) ? input!.tagIds.filter(Boolean).slice(0, 20) : [],
      mode: input?.mode === "and" ? ("and" as const) : ("or" as const),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const conversationId = await ensureConversation(supabase, userId);
    await ensurePreferences(supabase, userId);
    const page = await loadStreamPage(supabase, userId, {
      limit: data.limit,
      before: data.before,
      tagIds: data.tagIds,
      mode: data.mode,
    });
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

/** Clears every thought already marked done, right now, without waiting for retention. */
export const clearCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("messages")
      .select("id, content, completed_at, created_at")
      .eq("user_id", userId)
      .eq("is_completed", true);
    if (error) throw error;
    if (!rows?.length) return { deleted: 0 };

    await supabase.from("deletion_log").insert(
      rows.map((row) => ({
        user_id: userId,
        message_id: row.id,
        content_snapshot: row.content,
        completed_at: row.completed_at,
        message_created_at: row.created_at,
        reason: "manual",
      })),
    );

    const removed = await supabase
      .from("messages")
      .delete()
      .eq("user_id", userId)
      .eq("is_completed", true);
    if (removed.error) throw removed.error;
    return { deleted: rows.length };
  });

/**
 * Tags are reusable entities: name, colour, plain-English context, enabled state,
 * plus a derived count. Default tags are ordinary rows, so they behave identically.
 */
export const listTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadTags(context.supabase, context.userId));

export const listTagGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadTagGroups(context.supabase, context.userId));

export const saveTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      name?: string;
      color?: string;
      context?: string;
      isEnabled?: boolean;
      groupId?: string | null;
      isPinned?: boolean;
      sortOrder?: number;
    }) => {
      const name = (input?.name ?? "").trim().slice(0, 60);
      if (!input?.id && !name) throw new Error("A tag needs a name");
      return {
        id: input?.id,
        name,
        color: TAG_COLOR_KEYS.includes(input?.color as never) ? input!.color! : undefined,
        context: input?.context === undefined ? undefined : input.context.trim().slice(0, 2000),
        isEnabled: input?.isEnabled,
        groupId: input?.groupId,
        isPinned: input?.isPinned,
        sortOrder: typeof input?.sortOrder === "number" ? input.sortOrder : undefined,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.id) {
      const patch: {
        name?: string;
        normalized_name?: string;
        color?: string;
        context?: string;
        is_enabled?: boolean;
        group_id?: string | null;
        is_pinned?: boolean;
        sort_order?: number;
      } = {};
      if (data.name) {
        patch.name = data.name;
        patch.normalized_name = normalizeTag(data.name);
      }
      if (data.color) patch.color = data.color;
      if (data.context !== undefined) patch.context = data.context;
      if (data.isEnabled !== undefined) patch.is_enabled = data.isEnabled;
      if (data.groupId !== undefined) patch.group_id = data.groupId;
      if (data.isPinned !== undefined) patch.is_pinned = data.isPinned;
      if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;

      const { error } = await supabase
        .from("tags")
        .update(patch)
        .eq("id", data.id)
        .eq("user_id", userId);
      if (error) {
        throw new Error(
          error.code === "23505" ? "You already have a tag with that name" : error.message,
        );
      }
      return loadTags(supabase, userId);
    }

    const normalized = normalizeTag(data.name);
    const existing = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", userId)
      .eq("normalized_name", normalized)
      .maybeSingle();
    if (existing.data) throw new Error("You already have a tag with that name");

    const { error } = await supabase.from("tags").insert({
      user_id: userId,
      name: data.name,
      normalized_name: normalized,
      color: data.color ?? pickDefaultTagColor(normalized),
      context: data.context ?? "",
      is_enabled: data.isEnabled ?? true,
      group_id: data.groupId ?? null,
      is_pinned: data.isPinned ?? false,
    });
    if (error) throw error;
    return loadTags(supabase, userId);
  });

/**
 * Manual ordering and group membership in one call so a drag lands atomically:
 * the client sends the tags whose position or group changed.
 */
export const reorderTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { items: Array<{ id: string; sortOrder: number; groupId?: string | null }> }) => {
      const items = (input?.items ?? [])
        .filter((item) => item && typeof item.id === "string")
        .slice(0, 300)
        .map((item) => ({
          id: item.id,
          sortOrder: Number(item.sortOrder) || 0,
          groupId: item.groupId === undefined ? undefined : item.groupId,
        }));
      if (!items.length) throw new Error("Nothing to reorder");
      return { items };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    for (const item of data.items) {
      const patch: { sort_order: number; group_id?: string | null } = { sort_order: item.sortOrder };
      if (item.groupId !== undefined) patch.group_id = item.groupId;
      const { error } = await supabase
        .from("tags")
        .update(patch)
        .eq("id", item.id)
        .eq("user_id", userId);
      if (error) throw error;
    }
    return loadTags(supabase, userId);
  });

/** Groups are created and edited by the user only — never by AI. */
export const saveTagGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      name?: string;
      color?: string;
      isCollapsed?: boolean;
      sortOrder?: number;
    }) => {
      const name = (input?.name ?? "").trim().slice(0, 60);
      if (!input?.id && !name) throw new Error("A group needs a name");
      return {
        id: input?.id,
        name,
        color: TAG_COLOR_KEYS.includes(input?.color as never) ? input!.color! : undefined,
        isCollapsed: input?.isCollapsed,
        sortOrder: typeof input?.sortOrder === "number" ? input.sortOrder : undefined,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.id) {
      const patch: {
        name?: string;
        color?: string;
        is_collapsed?: boolean;
        sort_order?: number;
      } = {};
      if (data.name) patch.name = data.name;
      if (data.color) patch.color = data.color;
      if (data.isCollapsed !== undefined) patch.is_collapsed = data.isCollapsed;
      if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;

      const { error } = await supabase
        .from("tag_groups")
        .update(patch)
        .eq("id", data.id)
        .eq("user_id", userId);
      if (error) throw error;
      return loadTagGroups(supabase, userId);
    }

    const existing = await loadTagGroups(supabase, userId);
    const { error } = await supabase.from("tag_groups").insert({
      user_id: userId,
      name: data.name,
      color: data.color ?? DEFAULT_TAG_COLOR,
      sort_order: existing.length,
    });
    if (error) throw error;
    return loadTagGroups(supabase, userId);
  });

/** Deleting a group never touches its tags: they simply become ungrouped. */
export const deleteTagGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Missing group");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cleared = await supabase
      .from("tags")
      .update({ group_id: null })
      .eq("group_id", data.id)
      .eq("user_id", userId);
    if (cleared.error) throw cleared.error;

    const { error } = await supabase
      .from("tag_groups")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return loadTagGroups(supabase, userId);
  });

export const reorderTagGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => {
    const ids = (input?.ids ?? []).filter(Boolean).slice(0, 100);
    if (!ids.length) throw new Error("Nothing to reorder");
    return { ids };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    for (let index = 0; index < data.ids.length; index++) {
      const { error } = await supabase
        .from("tag_groups")
        .update({ sort_order: index })
        .eq("id", data.ids[index]!)
        .eq("user_id", userId);
      if (error) throw error;
    }
    return loadTagGroups(supabase, userId);
  });


export const deleteTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Missing tag");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    // Links disappear with the tag; the messages themselves are never touched.
    const { error } = await context.supabase
      .from("tags")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return loadTags(context.supabase, context.userId);
  });

/** Permanent, immediate delete — skips the retention timer entirely. */
export const deleteMessageNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Missing message");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("messages")
      .select("id, content, completed_at, created_at")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return { id: data.id };

    await supabase.from("deletion_log").insert({
      user_id: userId,
      message_id: row.id,
      content_snapshot: row.content,
      completed_at: row.completed_at,
      message_created_at: row.created_at,
      reason: "manual",
    });

    const removed = await supabase
      .from("messages")
      .delete()
      .eq("id", row.id)
      .eq("user_id", userId);
    if (removed.error) throw removed.error;
    return { id: row.id };
  });

/**
 * Re-reads every thought against the current tags and their context rules.
 * Run after a rule changes so existing notes reflect the new intent.
 */
export const retagAllMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("messages")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(400);
    if (error) throw error;

    const ids = (data ?? []).map((row) => row.id);
    let organized = 0;
    let failed = 0;
    const queue = [...ids];

    async function worker() {
      for (;;) {
        const id = queue.shift();
        if (!id) return;
        try {
          await organizeMessage(supabase, userId, id);
          organized += 1;
        } catch {
          failed += 1;
        }
      }
    }

    await Promise.all([worker(), worker(), worker(), worker()]);
    return { total: ids.length, organized, failed };
  });
