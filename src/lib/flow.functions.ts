import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import {
  ensurePreferences,
  loadDueReminders,
  loadMessage,
  loadPinnedMessages,
  loadReferenceNotes,
  loadStreamPage,
  loadViewCounts,
  loadWeekStats,

  loadTagGroups,
  loadTags,
  MESSAGE_SELECT,
  mapMessage,
  runRetention,
} from "./flow.server";
import { loadSuggestions, organizeMessage } from "./organize.server";
import { loadTasks } from "./tasks.server";
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
      /** Free-text search within the active view. */
      query?: string | null;
      /** Lower bound on created_at — the client sends its own local midnight. */
      since?: string | null;
      /** Pinned tab narrows the stream to pinned notes only. */
      pinnedOnly?: boolean;
    }) => ({
      notepadId: input?.notepadId ?? null,
      before: input?.before ?? null,
      limit: Math.min(Math.max(input?.limit ?? 40, 5), 100),
      tagIds: Array.isArray(input?.tagIds) ? input!.tagIds.filter(Boolean).slice(0, 20) : [],
      mode: input?.mode === "and" ? ("and" as const) : ("or" as const),
      query: input?.query ? String(input.query).slice(0, 200) : null,
      since: input?.since ?? null,
      pinnedOnly: Boolean(input?.pinnedOnly),
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
      query: data.query,
      since: data.since,
      types: data.pinnedOnly ? ["pinned"] : ["stream", "pinned"],
    });
    return { notepadId, ...page };
  });

/** Badge counts for the All / Today / Pinned / Reference tabs. */
export const getViewCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { notepadId?: string | null; since?: string | null }) => ({
    notepadId: input?.notepadId ?? null,
    since: input?.since ?? null,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const notepadId = await resolveNotepad(supabase, userId, data.notepadId);
    const since = data.since ?? new Date(new Date().toDateString()).toISOString();
    return { notepadId, ...(await loadViewCounts(supabase, userId, notepadId, since)) };
  });

/** Captured / completed over the last seven days for the attention rail. */
export const getWeekStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { notepadId?: string | null }) => ({
    notepadId: input?.notepadId ?? null,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const notepadId = await resolveNotepad(supabase, userId, data.notepadId);
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    return { notepadId, ...(await loadWeekStats(supabase, userId, notepadId, since)) };
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

/**
 * Edit history. Versions are captured by a database trigger on every content
 * change, so reading and restoring is all the app has to do.
 */
export const listMessageRevisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Missing message");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("message_revisions")
      .select("id, revision_number, content, content_html, created_at, change_reason")
      .eq("message_id", data.id)
      .eq("user_id", userId)
      .order("revision_number", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

/**
 * Restoring writes the old text forward as a new current version, so the
 * trigger captures whatever was on screen first — a restore can be undone.
 */
export const revertMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; revision: number }) => {
    if (!input?.id) throw new Error("Missing message");
    if (!Number.isFinite(input?.revision)) throw new Error("Missing revision");
    return { id: input.id, revision: Math.trunc(input.revision) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.rpc("revert_message", {
      p_message_id: data.id,
      p_revision: data.revision,
    });
    if (error) throw error;
    const { data: message, error: readError } = await supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (readError) throw readError;
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
 * The Tasks view: every note in this notepad carrying a tag in the Tasks group.
 * Task-ness lives in the tag graph only, so this is a read over that graph.
 */
export const getTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { notepadId?: string | null }) => ({
    notepadId: input?.notepadId ?? null,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const notepadId = await resolveNotepad(supabase, userId, data.notepadId);
    return { notepadId, tasks: await loadTasks(supabase, userId, notepadId) };
  });

/** A date the user chose is never fuzzy, whatever the AI had inferred. */
export const setTaskDue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; dueAt: string | null }) => {
    if (!input?.id) throw new Error("Missing note");
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("That date is not valid");
    return { id: input.id, dueAt: dueAt ? dueAt.toISOString() : null };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("messages")
      .update({ due_at: data.dueAt, due_is_fuzzy: false })
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("id, due_at, due_is_fuzzy")
      .single();
    if (error) throw error;
    return row;
  });


/**
 * Manual tagging. source: 'user' is load-bearing — organizeMessage only clears
 * source: 'ai' rows before re-applying, so a hand-applied tag survives every
 * later AI pass.
 */
/**
 * Every accept / dismiss / manual decision is written to one ledger row. The
 * database trigger does all the counting and promotion: app code never writes
 * `maturity` or the counters itself.
 */
async function recordTagFeedback(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    tagId: string;
    messageId: string;
    action: "accept" | "reject" | "manual_add" | "manual_remove";
  },
) {
  const note = await supabase
    .from("messages")
    .select("content")
    .eq("id", input.messageId)
    .eq("user_id", userId)
    .maybeSingle();

  const { error } = await supabase.from("tag_feedback").insert({
    user_id: userId,
    tag_id: input.tagId,
    message_id: input.messageId,
    action: input.action,
    body_snippet: (note.data?.content ?? "").slice(0, 200),
  });
  if (error) throw error;
}

export const addMessageTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string; tagId: string }) => {
    if (!input?.messageId) throw new Error("Missing note");
    if (!input?.tagId) throw new Error("Missing tag");
    return { messageId: input.messageId, tagId: input.tagId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const message = await supabase
      .from("messages")
      .select("id")
      .eq("id", data.messageId)
      .eq("user_id", userId)
      .maybeSingle();
    if (message.error) throw message.error;
    if (!message.data) throw new Error("That note no longer exists");

    const tag = await supabase
      .from("tags")
      .select("id, name, color")
      .eq("id", data.tagId)
      .eq("user_id", userId)
      .maybeSingle();
    if (tag.error) throw tag.error;
    if (!tag.data) throw new Error("That tag no longer exists");

    const { error } = await supabase.from("message_tags").upsert(
      {
        user_id: userId,
        message_id: data.messageId,
        tag_id: data.tagId,
        source: "user",
        status: "applied",
      },
      { onConflict: "message_id,tag_id" },
    );
    if (error) throw error;

    // Choosing a tag by hand is the strongest signal it earns its keep.
    await recordTagFeedback(supabase, userId, { ...data, action: "manual_add" });
    return { messageId: data.messageId, tag: tag.data };
  });

/** ✓ on a suggested tag: it becomes a real tag on the note, and Flow learns. */
export const confirmMessageTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string; tagId: string }) => {
    if (!input?.messageId) throw new Error("Missing note");
    if (!input?.tagId) throw new Error("Missing tag");
    return { messageId: input.messageId, tagId: input.tagId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("message_tags")
      .update({ status: "applied", source: "user" })
      .eq("user_id", userId)
      .eq("message_id", data.messageId)
      .eq("tag_id", data.tagId);
    if (error) throw error;

    await recordTagFeedback(supabase, userId, { ...data, action: "accept" });

    // The trigger may have just promoted the tag; report its new state back.
    const tag = await supabase
      .from("tags")
      .select("id, name, maturity, graduated_at, graduation_ack_at")
      .eq("id", data.tagId)
      .eq("user_id", userId)
      .maybeSingle();
    return { messageId: data.messageId, tagId: data.tagId, tag: tag.data ?? null };
  });

export const removeMessageTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string; tagId: string }) => {
    if (!input?.messageId) throw new Error("Missing note");
    if (!input?.tagId) throw new Error("Missing tag");
    return { messageId: input.messageId, tagId: input.tagId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Dismissing a proposal and taking off a tag Flow got wrong are different
    // lessons: the first is a reject, the second a manual removal.
    const existing = await supabase
      .from("message_tags")
      .select("status")
      .eq("user_id", userId)
      .eq("message_id", data.messageId)
      .eq("tag_id", data.tagId)
      .maybeSingle();

    const { error } = await supabase
      .from("message_tags")
      .delete()
      .eq("user_id", userId)
      .eq("message_id", data.messageId)
      .eq("tag_id", data.tagId);
    if (error) throw error;

    await recordTagFeedback(supabase, userId, {
      ...data,
      action:
        (existing.data as { status?: string } | null)?.status === "suggested"
          ? "reject"
          : "manual_remove",
    });
    return { messageId: data.messageId, tagId: data.tagId };
  });

/** The "Flow will now add this automatically" note is shown once, then hidden. */
export const acknowledgeTagGraduation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tagId: string }) => {
    if (!input?.tagId) throw new Error("Missing tag");
    return { tagId: input.tagId };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tags")
      .update({ graduation_ack_at: new Date().toISOString() })
      .eq("id", data.tagId)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { tagId: data.tagId };
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
    // Creating a tag that already exists is a no-op rather than a hard failure,
    // so hashtag autocomplete / quick-create can't blow up the UI.
    if (existing.data) return loadTags(supabase, userId, notepadId);


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
    if (error && error.code !== "23505") throw error;

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
        // `type` is the source of truth; `is_pinned`/`pinned_at` mirror it.
        is_pinned: data.type === "pinned",
        pinned_at: data.type === "pinned" ? new Date().toISOString() : null,
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
