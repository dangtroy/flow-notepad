import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ensurePreferences,
  loadDueReminders,
  loadMessage,
  loadPinnedMessages,
  loadReferenceNotes,
  loadStreamPage,
  loadTagGroups,
  loadTags,
  MESSAGE_SELECT,
  mapMessage,
  runRetention,
} from "./flow.server";
import { loadSuggestions, organizeMessage } from "./organize.server";
import { cleanUpText } from "./cleanup.server";

import { applySuggestion, ignoreSuggestion } from "./suggestions.server";
import {
  createNotepad,
  deleteNotepad,
  listNotepads,
  readActiveNotepad,
  rememberActiveNotepad,
  reorderNotepads,
  resolveNotepad,
  updateNotepad,
} from "./notepads.server";
import { isNotepadIcon } from "./notepads";
import { normalizeTag } from "./tag-normalize";
import { htmlToText, isEmptyDocument, sanitizeHtml, textToHtml } from "./rich-text";
import { DEFAULT_TAG_COLOR, pickDefaultTagColor, TAG_COLOR_KEYS } from "./tag-colors";


export const getStreamPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input?: {
      notepadId?: string | null;
      before?: string | null;
      limit?: number;
      tagIds?: string[];
      mode?: "or" | "and";
    }) => ({
      notepadId: input?.notepadId ?? null,
      before: input?.before ?? null,
      limit: Math.min(Math.max(input?.limit ?? 40, 5), 100),
      tagIds: Array.isArray(input?.tagIds) ? input!.tagIds.filter(Boolean).slice(0, 20) : [],
      mode: input?.mode === "and" ? ("and" as const) : ("or" as const),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const notepadId = await resolveNotepad(supabase, userId, data.notepadId);
    await ensurePreferences(supabase, userId);
    const page = await loadStreamPage(supabase, userId, notepadId, {
      limit: data.limit,
      before: data.before,
      tagIds: data.tagIds,
      mode: data.mode,
    });
    return { notepadId, ...page };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      html: string;
      parentMessageId?: string | null;
      notepadId?: string | null;
      /** Set only when AI writing cleanup produced the text being sent. */
      originalHtml?: string | null;
      cleanedHtml?: string | null;
      /** Pinning is only ever a promotion afterwards, never a creation choice. */
      type?: "stream" | "reference";
    }) => {
      const html = sanitizeHtml(input?.html ?? "");
      if (!html || isEmptyDocument(html)) throw new Error("A thought cannot be empty");
      const originalHtml = input?.originalHtml ? sanitizeHtml(input.originalHtml) : null;
      const cleanedHtml = input?.cleanedHtml ? sanitizeHtml(input.cleanedHtml) : null;
      return {
        type: input?.type === "reference" ? ("reference" as const) : ("stream" as const),
        html: html.slice(0, 200000),
        text: htmlToText(html).slice(0, 20000),
        parentMessageId: input?.parentMessageId ?? null,
        notepadId: input?.notepadId ?? null,
        originalHtml: originalHtml ? originalHtml.slice(0, 200000) : null,
        cleanedHtml: cleanedHtml ? cleanedHtml.slice(0, 200000) : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const conversationId = await resolveNotepad(supabase, userId, data.notepadId);

    // A reply must stay inside the same notepad as the note it answers; anything else is top-level.
    let parentId: string | null = null;
    if (data.parentMessageId) {
      const parent = await supabase
        .from("messages")
        .select("id")
        .eq("id", data.parentMessageId)
        .eq("user_id", userId)
        .eq("conversation_id", conversationId)
        .maybeSingle();
      parentId = parent.data?.id ?? null;
    }

    const cleaned = Boolean(data.originalHtml && data.cleanedHtml);

    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        type: data.type,
        content: data.text,
        content_html: data.html,
        parent_message_id: parentId,
        // Cleanup keeps all three versions: typed, suggested, saved.
        ...(cleaned
          ? {
              ai_cleaned: true,
              original_content: htmlToText(data.originalHtml!).slice(0, 20000),
              original_content_html: data.originalHtml,
              cleaned_content: htmlToText(data.cleanedHtml!).slice(0, 20000),
              cleaned_content_html: data.cleanedHtml,
            }
          : {}),
      } as never)
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw error;
    return mapMessage(message as never);
  });

/**
 * Cleans up the note the user is composing. Text only, never saved here: the
 * user reviews it in the composer and still presses Send themselves.
 */
export const cleanUpNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { html: string }) => {
    const html = sanitizeHtml(input?.html ?? "");
    if (!html || isEmptyDocument(html)) throw new Error("Nothing to clean up");
    return { html: html.slice(0, 200000), text: htmlToText(html).slice(0, 20000) };
  })
  .handler(async ({ data }) => {
    const cleanedText = await cleanUpText(data.text);
    return {
      originalHtml: data.html,
      cleanedHtml: sanitizeHtml(textToHtml(cleanedText)),
      cleanedText,
    };
  });

/** Puts a saved note back to exactly what the user typed. Tags are untouched. */
export const restoreOriginalMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Missing message");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const existing = await supabase
      .from("messages")
      .select("id, original_content, original_content_html")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    const row = existing.data as
      | { original_content: string | null; original_content_html: string | null }
      | null
      | undefined;
    if (!row?.original_content_html && !row?.original_content) {
      throw new Error("No original text stored for this note");
    }
    const html = row.original_content_html ?? textToHtml(row.original_content ?? "");
    const { data: message, error } = await supabase
      .from("messages")
      .update({
        content: htmlToText(html),
        content_html: html,
        ai_cleaned: false,
      } as never)
      .eq("id", data.id)
      .eq("user_id", userId)
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw error;
    return mapMessage(message as never);
  });

/** The composer's own "Always clean up" mode, remembered per account. */
export const getCleanupPreference = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensurePreferences(context.supabase, context.userId);
    const { data } = await context.supabase
      .from("user_preferences")
      .select("settings")
      .eq("user_id", context.userId)
      .maybeSingle();
    const settings = (data?.settings as Record<string, unknown> | null) ?? {};
    return { always: settings["alwaysCleanup"] === true };
  });

export const setCleanupPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { always: boolean }) => ({ always: Boolean(input?.always) }))
  .handler(async ({ data, context }) => {
    await ensurePreferences(context.supabase, context.userId);
    const existing = await context.supabase
      .from("user_preferences")
      .select("settings")
      .eq("user_id", context.userId)
      .maybeSingle();
    const settings = { ...((existing.data?.settings as Record<string, unknown>) ?? {}) };
    settings["alwaysCleanup"] = data.always;
    const { error } = await context.supabase
      .from("user_preferences")
      .update({ settings: settings as never })
      .eq("user_id", context.userId);
    if (error) throw error;
    return { always: data.always };
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
  .inputValidator((input?: { notepadId?: string | null }) => ({ notepadId: input?.notepadId ?? null }))
  .handler(async ({ data, context }) => {
    await ensurePreferences(context.supabase, context.userId);
    const notepadId = await resolveNotepad(context.supabase, context.userId, data.notepadId);
    const notepad = await context.supabase
      .from("conversations")
      .select("completed_retention_days")
      .eq("id", notepadId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const log = await context.supabase
      .from("deletion_log")
      .select("id, content_snapshot, completed_at, deleted_at")
      .eq("user_id", context.userId)
      .order("deleted_at", { ascending: false })
      .limit(25);
    return {
      notepadId,
      completedRetentionDays: notepad.data?.completed_retention_days ?? null,
      deletionHistory: log.data ?? [],
    };
  });

export const updatePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { completedRetentionDays: number | null; notepadId?: string | null }) => ({
    notepadId: input?.notepadId ?? null,
    completedRetentionDays:
      input?.completedRetentionDays === null || input?.completedRetentionDays === undefined
        ? null
        : Number(input.completedRetentionDays),
  }))
  .handler(async ({ data, context }) => {
    // Auto-delete is a per-notepad decision: Work can keep more than Personal.
    const notepadId = await resolveNotepad(context.supabase, context.userId, data.notepadId);
    const { error } = await context.supabase
      .from("conversations")
      .update({ completed_retention_days: data.completedRetentionDays })
      .eq("id", notepadId)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { completedRetentionDays: data.completedRetentionDays };
  });

export const listContextRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { notepadId?: string | null }) => ({ notepadId: input?.notepadId ?? null }))
  .handler(async ({ data: input, context }) => {
    const notepadId = await resolveNotepad(context.supabase, context.userId, input.notepadId);
    const { data, error } = await context.supabase
      .from("context_rules")
      .select("id, tag_name, context, is_enabled, created_at")
      .eq("user_id", context.userId)
      .eq("conversation_id", notepadId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const saveContextRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      tagName: string;
      context: string;
      isEnabled?: boolean;
      notepadId?: string | null;
    }) => {
    const tagName = (input?.tagName ?? "").trim();
    if (!tagName) throw new Error("A rule needs a tag name");
    return {
      id: input?.id,
      notepadId: input?.notepadId ?? null,
      tagName: tagName.slice(0, 60),
      context: (input?.context ?? "").trim().slice(0, 2000),
      isEnabled: input?.isEnabled ?? true,
    };
  },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const notepadId = await resolveNotepad(supabase, userId, data.notepadId);
    const payload = {
      user_id: userId,
      conversation_id: notepadId,
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
            conversation_id: notepadId,
            name: data.tagName,
            normalized_name: normalized,
            color: pickDefaultTagColor(normalized),
          },
          { onConflict: "conversation_id,normalized_name" },
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
  .inputValidator((input?: { notepadId?: string | null }) => ({ notepadId: input?.notepadId ?? null }))
  .handler(async ({ data, context }) => {
    const notepadId = await resolveNotepad(context.supabase, context.userId, data.notepadId);
    return runRetention(context.supabase, context.userId, notepadId);
  });

/** Clears every thought already marked done, right now, without waiting for retention. */
export const clearCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { notepadId?: string | null }) => ({ notepadId: input?.notepadId ?? null }))
  .handler(async ({ data: input, context }) => {
    const { supabase, userId } = context;
    const notepadId = await resolveNotepad(supabase, userId, input.notepadId);
    const { data: rows, error } = await supabase
      .from("messages")
      .select("id, content, completed_at, created_at")
      .eq("user_id", userId)
      .eq("conversation_id", notepadId)
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
      .eq("conversation_id", notepadId)
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
  .inputValidator((input?: { notepadId?: string | null }) => ({ notepadId: input?.notepadId ?? null }))
  .handler(async ({ data, context }) => {
    const notepadId = await resolveNotepad(context.supabase, context.userId, data.notepadId);
    return loadTags(context.supabase, context.userId, notepadId);
  });

export const listTagGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { notepadId?: string | null }) => ({ notepadId: input?.notepadId ?? null }))
  .handler(async ({ data, context }) => {
    const notepadId = await resolveNotepad(context.supabase, context.userId, data.notepadId);
    return loadTagGroups(context.supabase, context.userId, notepadId);
  });

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
      matchKeywords?: string[];
      autoApply?: boolean;
      notepadId?: string | null;
    }) => {
      const name = (input?.name ?? "").trim().slice(0, 60);
      if (!input?.id && !name) throw new Error("A tag needs a name");
      return {
        id: input?.id,
        notepadId: input?.notepadId ?? null,
        name,
        color: TAG_COLOR_KEYS.includes(input?.color as never) ? input!.color! : undefined,
        context: input?.context === undefined ? undefined : input.context.trim().slice(0, 2000),
        isEnabled: input?.isEnabled,
        groupId: input?.groupId,
        isPinned: input?.isPinned,
        sortOrder: typeof input?.sortOrder === "number" ? input.sortOrder : undefined,
        matchKeywords: Array.isArray(input?.matchKeywords)
          ? input!
              .matchKeywords!.map((keyword) => String(keyword).trim().slice(0, 60))
              .filter((keyword) => keyword.length >= 2)
              .slice(0, 20)
          : undefined,
        autoApply: input?.autoApply,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const notepadId = await resolveNotepad(supabase, userId, data.notepadId);

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
        match_keywords?: string[];
        auto_apply?: boolean;
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
      if (data.matchKeywords !== undefined) patch.match_keywords = data.matchKeywords;
      if (data.autoApply !== undefined) patch.auto_apply = data.autoApply;

      const { error } = await supabase
        .from("tags")
        .update(patch)
        .eq("id", data.id)
        .eq("user_id", userId)
        .eq("conversation_id", notepadId);
      if (error) {
        throw new Error(
          error.code === "23505" ? "You already have a tag with that name" : error.message,
        );
      }
      return loadTags(supabase, userId, notepadId);
    }

    const normalized = normalizeTag(data.name);
    const existing = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", userId)
      .eq("conversation_id", notepadId)
      .eq("normalized_name", normalized)
      .maybeSingle();
    if (existing.data) throw new Error("You already have a tag with that name");

    const { error } = await supabase.from("tags").insert({
      user_id: userId,
      conversation_id: notepadId,
      name: data.name,
      normalized_name: normalized,
      color: data.color ?? pickDefaultTagColor(normalized),
      context: data.context ?? "",
      is_enabled: data.isEnabled ?? true,
      group_id: data.groupId ?? null,
      is_pinned: data.isPinned ?? false,
      match_keywords: data.matchKeywords ?? [],
      auto_apply: data.autoApply ?? true,
    });
    if (error) throw error;
    return loadTags(supabase, userId, notepadId);
  });


/**
 * Manual ordering and group membership in one call so a drag lands atomically:
 * the client sends the tags whose position or group changed.
 */
export const reorderTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      items: Array<{ id: string; sortOrder: number; groupId?: string | null }>;
      notepadId?: string | null;
    }) => {
      const items = (input?.items ?? [])
        .filter((item) => item && typeof item.id === "string")
        .slice(0, 300)
        .map((item) => ({
          id: item.id,
          sortOrder: Number(item.sortOrder) || 0,
          groupId: item.groupId === undefined ? undefined : item.groupId,
        }));
      if (!items.length) throw new Error("Nothing to reorder");
      return { items, notepadId: input?.notepadId ?? null };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const notepadId = await resolveNotepad(supabase, userId, data.notepadId);
    for (const item of data.items) {
      const patch: { sort_order: number; group_id?: string | null } = { sort_order: item.sortOrder };
      if (item.groupId !== undefined) patch.group_id = item.groupId;
      const { error } = await supabase
        .from("tags")
        .update(patch)
        .eq("id", item.id)
        .eq("user_id", userId)
        .eq("conversation_id", notepadId);
      if (error) throw error;
    }
    return loadTags(supabase, userId, notepadId);
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
      context?: string;
      notepadId?: string | null;
    }) => {
      const name = (input?.name ?? "").trim().slice(0, 60);
      if (!input?.id && !name) throw new Error("A group needs a name");
      return {
        id: input?.id,
        notepadId: input?.notepadId ?? null,
        name,
        color: TAG_COLOR_KEYS.includes(input?.color as never) ? input!.color! : undefined,
        isCollapsed: input?.isCollapsed,
        sortOrder: typeof input?.sortOrder === "number" ? input.sortOrder : undefined,
        context: input?.context === undefined ? undefined : input.context.trim().slice(0, 2000),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const notepadId = await resolveNotepad(supabase, userId, data.notepadId);

    if (data.id) {
      const patch: {
        name?: string;
        color?: string;
        is_collapsed?: boolean;
        sort_order?: number;
        context?: string;
      } = {};
      if (data.name) patch.name = data.name;
      if (data.color) patch.color = data.color;
      if (data.isCollapsed !== undefined) patch.is_collapsed = data.isCollapsed;
      if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;
      if (data.context !== undefined) patch.context = data.context;

      const { error } = await supabase
        .from("tag_groups")
        .update(patch)
        .eq("id", data.id)
        .eq("user_id", userId)
        .eq("conversation_id", notepadId);
      if (error) throw error;
      return loadTagGroups(supabase, userId, notepadId);
    }

    const existing = await loadTagGroups(supabase, userId, notepadId);
    const { error } = await supabase.from("tag_groups").insert({
      user_id: userId,
      conversation_id: notepadId,
      name: data.name,
      color: data.color ?? DEFAULT_TAG_COLOR,
      sort_order: existing.length,
      context: data.context ?? "",
    });

    if (error) throw error;
    return loadTagGroups(supabase, userId, notepadId);
  });

/** Deleting a group never touches its tags: they simply become ungrouped. */
export const deleteTagGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; notepadId?: string | null }) => {
    if (!input?.id) throw new Error("Missing group");
    return { id: input.id, notepadId: input?.notepadId ?? null };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const notepadId = await resolveNotepad(supabase, userId, data.notepadId);
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
    return loadTagGroups(supabase, userId, notepadId);
  });

export const reorderTagGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; notepadId?: string | null }) => {
    const ids = (input?.ids ?? []).filter(Boolean).slice(0, 100);
    if (!ids.length) throw new Error("Nothing to reorder");
    return { ids, notepadId: input?.notepadId ?? null };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const notepadId = await resolveNotepad(supabase, userId, data.notepadId);
    for (let index = 0; index < data.ids.length; index++) {
      const { error } = await supabase
        .from("tag_groups")
        .update({ sort_order: index })
        .eq("id", data.ids[index]!)
        .eq("user_id", userId);
      if (error) throw error;
    }
    return loadTagGroups(supabase, userId, notepadId);
  });


export const deleteTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; notepadId?: string | null }) => {
    if (!input?.id) throw new Error("Missing tag");
    return { id: input.id, notepadId: input?.notepadId ?? null };
  })
  .handler(async ({ data, context }) => {
    const notepadId = await resolveNotepad(context.supabase, context.userId, data.notepadId);
    // Links disappear with the tag; the messages themselves are never touched.
    const { error } = await context.supabase
      .from("tags")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return loadTags(context.supabase, context.userId, notepadId);
  });

/**
 * Permanent, immediate delete — skips the retention timer entirely. Deleting a
 * thought takes its whole reply thread with it: a reply has no meaning without
 * the note it answers.
 */
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
      .select("id, content, completed_at, created_at, conversation_id")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return { id: data.id, deletedIds: [data.id] };

    // Walk down the thread so nested replies go with their parent.
    const { data: links, error: linkError } = await supabase
      .from("messages")
      .select("id, parent_message_id, content, completed_at, created_at")
      .eq("user_id", userId)
      .eq("conversation_id", row.conversation_id)
      .not("parent_message_id", "is", null);
    if (linkError) throw linkError;

    type Link = { id: string; parent_message_id: string | null; content: string; completed_at: string | null; created_at: string };
    const children = new Map<string, Link[]>();
    for (const link of links ?? []) {
      const parentId = link.parent_message_id;
      if (!parentId) continue;
      const list = children.get(parentId) ?? [];
      list.push(link);
      children.set(parentId, list);
    }

    const doomed = [
      { id: row.id, content: row.content, completed_at: row.completed_at, created_at: row.created_at },
    ];
    const queue = [row.id];
    while (queue.length > 0) {
      const next = queue.shift()!;
      for (const child of children.get(next) ?? []) {
        doomed.push(child);
        queue.push(child.id);
      }
    }

    await supabase.from("deletion_log").insert(
      doomed.map((item) => ({
        user_id: userId,
        message_id: item.id,
        content_snapshot: item.content,
        completed_at: item.completed_at,
        message_created_at: item.created_at,
        reason: "manual",
      })),
    );

    const ids = doomed.map((item) => item.id);
    const removed = await supabase
      .from("messages")
      .delete()
      .in("id", ids)
      .eq("user_id", userId);
    if (removed.error) throw removed.error;
    return { id: row.id, deletedIds: ids };
  });


/**
 * Re-reads every thought against the current tags and their context rules.
 * Run after a rule changes so existing notes reflect the new intent.
 */
export const retagAllMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { notepadId?: string | null }) => ({ notepadId: input?.notepadId ?? null }))
  .handler(async ({ data: input, context }) => {
    const { supabase, userId } = context;
    const notepadId = await resolveNotepad(supabase, userId, input.notepadId);
    const { data, error } = await supabase
      .from("messages")
      .select("id")
      .eq("user_id", userId)
      .eq("conversation_id", notepadId)
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
          // Rules changed, so this pass ignores fingerprints on purpose.
          await organizeMessage(supabase, userId, id, { force: true });

          organized += 1;
        } catch {
          failed += 1;
        }
      }
    }

    await Promise.all([worker(), worker(), worker(), worker()]);
    return { total: ids.length, organized, failed };
  });

/* ---------------------------------------------------------------------------
 * Suggested tags: Flow never creates a tag on its own. Anything it is unsure
 * about lands here, with evidence, until the user says yes or no.
 * ------------------------------------------------------------------------- */

export const listTagSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { notepadId?: string | null }) => ({ notepadId: input?.notepadId ?? null }))
  .handler(async ({ data, context }) => {
    const notepadId = await resolveNotepad(context.supabase, context.userId, data.notepadId);
    return loadSuggestions(context.supabase, context.userId, notepadId);
  });

export const applyTagSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; learnMode?: "auto" | "suggest" | "once"; notepadId?: string | null }) => {
    if (!input?.id) throw new Error("Missing suggestion");
    const mode = input.learnMode;
    return {
      id: input.id,
      notepadId: input?.notepadId ?? null,
      learnMode: mode === "suggest" || mode === "once" ? mode : ("auto" as const),
    };
  })
  .handler(async ({ data, context }) => {
    const notepadId = await resolveNotepad(context.supabase, context.userId, data.notepadId);
    const applied = await applySuggestion(context.supabase, context.userId, data.id, data.learnMode);
    return { applied, tags: await loadTags(context.supabase, context.userId, notepadId) };
  });

export const ignoreTagSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Missing suggestion");
    return { id: input.id };
  })
  .handler(async ({ data, context }) =>
    ignoreSuggestion(context.supabase, context.userId, data.id),
  );

/** Bulk apply or dismiss: the user should never approve the same tag repeatedly. */
export const resolveAllTagSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      action: "apply" | "ignore";
      learnMode?: "auto" | "suggest" | "once";
      notepadId?: string | null;
    }) => ({
    notepadId: input?.notepadId ?? null,
    action: input?.action === "ignore" ? ("ignore" as const) : ("apply" as const),
    learnMode:
      input?.learnMode === "suggest" || input?.learnMode === "once"
        ? input.learnMode
        : ("auto" as const),
  }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const notepadId = await resolveNotepad(supabase, userId, data.notepadId);
    const pending = await loadSuggestions(supabase, userId, notepadId);
    let resolved = 0;
    for (const suggestion of pending) {
      try {
        if (data.action === "ignore") await ignoreSuggestion(supabase, userId, suggestion.id);
        else await applySuggestion(supabase, userId, suggestion.id, data.learnMode);
        resolved += 1;
      } catch {
        /* keep going: one bad suggestion should not block the rest */
      }
    }
    return { resolved, tags: await loadTags(supabase, userId, notepadId) };
  });

/* ---------------------------------------------------------------------------
 * Notepads: one account, several independent continuous conversations.
 * ------------------------------------------------------------------------- */

export const getNotepads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await ensurePreferences(supabase, userId);
    const notepads = await listNotepads(supabase, userId);
    const activeId = await readActiveNotepad(supabase, userId, notepads);
    return { notepads, activeId };
  });

export const setActiveNotepad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { notepadId: string }) => {
    if (!input?.notepadId) throw new Error("Missing notepad");
    return { notepadId: input.notepadId };
  })
  .handler(async ({ data, context }) => {
    const notepadId = await resolveNotepad(context.supabase, context.userId, data.notepadId);
    await rememberActiveNotepad(context.supabase, context.userId, notepadId);
    return { activeId: notepadId };
  });

export const saveNotepad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      name?: string;
      icon?: string;
      accent?: string;
      isPinned?: boolean;
    }) => {
      const name = (input?.name ?? "").trim().slice(0, 40);
      if (!input?.id && !name) throw new Error("A notepad needs a name");
      return {
        id: input?.id,
        name,
        icon: isNotepadIcon(input?.icon) ? input!.icon! : undefined,
        accent: TAG_COLOR_KEYS.includes(input?.accent as never) ? input!.accent! : undefined,
        isPinned: input?.isPinned,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.id) {
      await updateNotepad(supabase, userId, { ...data, id: data.id });
      return { notepads: await listNotepads(supabase, userId), activeId: data.id };
    }
    // New notepads start empty on purpose: no forced setup before the first thought.
    const created = await createNotepad(supabase, userId, { ...data, name: data.name });
    await rememberActiveNotepad(supabase, userId, created.id);
    return { notepads: await listNotepads(supabase, userId), activeId: created.id };
  });

export const removeNotepad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Missing notepad");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Deleting a notepad removes its whole tree: notes, tags, groups, rules.
    await deleteNotepad(supabase, userId, data.id);
    const notepads = await listNotepads(supabase, userId);
    const activeId = await readActiveNotepad(supabase, userId, notepads);
    return { notepads, activeId };
  });

export const reorderNotepadList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => {
    const ids = (input?.ids ?? []).filter(Boolean).slice(0, 100);
    if (!ids.length) throw new Error("Nothing to reorder");
    return { ids };
  })
  .handler(async ({ data, context }) => {
    await reorderNotepads(context.supabase, context.userId, data.ids);
    return { notepads: await listNotepads(context.supabase, context.userId) };
  });

/* ---------- Pins & reminders ---------- */

export const setMessagePin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; pinned: boolean }) => {
    if (!input?.id) throw new Error("Missing message");
    return { id: input.id, pinned: Boolean(input.pinned) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: message, error } = await supabase
      .from("messages")
      .update({
        is_pinned: data.pinned,
        pinned_at: data.pinned ? new Date().toISOString() : null,
      } as never)
      .eq("id", data.id)
      .eq("user_id", userId)
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw error;
    return mapMessage(message as never);
  });

/** Sets, moves, or clears a note's in-app reminder. */
export const setMessageReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; remindAt: string | null }) => {
    if (!input?.id) throw new Error("Missing message");
    let remindAt: string | null = null;
    if (input.remindAt) {
      const when = new Date(input.remindAt);
      if (Number.isNaN(when.getTime())) throw new Error("That date and time isn't valid");
      remindAt = when.toISOString();
    }
    return { id: input.id, remindAt };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: message, error } = await supabase
      .from("messages")
      .update({ remind_at: data.remindAt, reminder_dismissed_at: null } as never)
      .eq("id", data.id)
      .eq("user_id", userId)
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw error;
    return mapMessage(message as never);
  });

/** Dismisses a due alert without deleting the note or its reminder history. */
export const dismissReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Missing message");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: message, error } = await supabase
      .from("messages")
      .update({ reminder_dismissed_at: new Date().toISOString() } as never)
      .eq("id", data.id)
      .eq("user_id", userId)
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw error;
    return mapMessage(message as never);
  });

export const getPinnedMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { notepadId?: string | null }) => ({
    notepadId: input?.notepadId ?? null,
  }))
  .handler(async ({ data, context }) => {
    const notepadId = await resolveNotepad(context.supabase, context.userId, data.notepadId);
    return { notepadId, messages: await loadPinnedMessages(context.supabase, context.userId, notepadId) };
  });

export const getDueReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { notepadId?: string | null }) => ({
    notepadId: input?.notepadId ?? null,
  }))
  .handler(async ({ data, context }) => {
    const notepadId = await resolveNotepad(context.supabase, context.userId, data.notepadId);
    return { notepadId, messages: await loadDueReminders(context.supabase, context.userId, notepadId) };
  });

/* ---------- Note types (stream / pinned / reference) ---------- */

/**
 * Promotes or demotes a note between the three kinds. Reference notes can never
 * hold a completed state, so moving to reference clears completion.
 */
export const setMessageType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; type: "stream" | "pinned" | "reference" }) => {
    if (!input?.id) throw new Error("Missing message");
    if (input.type !== "stream" && input.type !== "pinned" && input.type !== "reference") {
      throw new Error("Unknown note type");
    }
    return { id: input.id, type: input.type };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: message, error } = await supabase
      .from("messages")
      .update({
        type: data.type,
        ...(data.type === "reference" ? { is_completed: false, completed_at: null } : {}),
      } as never)
      .eq("id", data.id)
      .eq("user_id", userId)
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw error;
    return mapMessage(message as never);
  });

export const listReferenceNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { notepadId?: string | null }) => ({
    notepadId: input?.notepadId ?? null,
  }))
  .handler(async ({ data, context }) => {
    const notepadId = await resolveNotepad(context.supabase, context.userId, data.notepadId);
    return {
      notepadId,
      messages: await loadReferenceNotes(context.supabase, context.userId, notepadId),
    };
  });
