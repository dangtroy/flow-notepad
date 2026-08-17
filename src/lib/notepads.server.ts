import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { isNotepadIcon, sortNotepads, type Notepad } from "./notepads";
import { DEFAULT_TAG_COLOR, TAG_COLOR_KEYS } from "./tag-colors";

type Client = SupabaseClient<Database>;

const NOTEPAD_SELECT =
  "id, title, icon, accent, sort_order, is_pinned, completed_retention_days, created_at";

type NotepadRow = {
  id: string;
  title: string;
  icon: string | null;
  accent: string | null;
  sort_order: number;
  is_pinned: boolean;
  completed_retention_days: number | null;
  created_at: string;
};

function mapNotepad(row: NotepadRow): Notepad {
  return {
    id: row.id,
    name: row.title,
    icon: isNotepadIcon(row.icon) ? row.icon : null,
    accent: TAG_COLOR_KEYS.includes(row.accent as never) ? row.accent! : DEFAULT_TAG_COLOR,
    sort_order: row.sort_order,
    is_pinned: row.is_pinned,
    completed_retention_days: row.completed_retention_days,
    created_at: row.created_at,
  };
}

/** Every account always has at least one notepad — Flow opens straight into it. */
export async function listNotepads(supabase: Client, userId: string): Promise<Notepad[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select(NOTEPAD_SELECT)
    .eq("user_id", userId);
  if (error) throw error;

  const rows = (data ?? []) as unknown as NotepadRow[];
  if (!rows.length) {
    const created = await supabase
      .from("conversations")
      .insert({ user_id: userId, title: "Flow", completed_retention_days: 7 })
      .select(NOTEPAD_SELECT)
      .single();
    if (created.error) throw created.error;
    return [mapNotepad(created.data as unknown as NotepadRow)];
  }

  return sortNotepads(rows.map(mapNotepad));
}

/**
 * Central guard: a notepad id only counts when it belongs to the caller.
 * Anything else quietly falls back to their first notepad.
 */
export async function resolveNotepad(
  supabase: Client,
  userId: string,
  notepadId?: string | null,
): Promise<string> {
  if (notepadId) {
    const owned = await supabase
      .from("conversations")
      .select("id")
      .eq("id", notepadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (owned.data?.id) return owned.data.id;
  }
  const notepads = await listNotepads(supabase, userId);
  return notepads[0]!.id;
}

export async function loadNotepad(
  supabase: Client,
  userId: string,
  notepadId: string,
): Promise<Notepad | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select(NOTEPAD_SELECT)
    .eq("id", notepadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapNotepad(data as unknown as NotepadRow) : null;
}

/** Creating one asks for a name only; it opens immediately, with nothing to configure. */
export async function createNotepad(
  supabase: Client,
  userId: string,
  input: { name: string; icon?: string | null; accent?: string | null },
): Promise<Notepad> {
  const existing = await listNotepads(supabase, userId);
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      title: input.name,
      icon: isNotepadIcon(input.icon) ? input.icon : null,
      accent: TAG_COLOR_KEYS.includes(input.accent as never) ? input.accent! : DEFAULT_TAG_COLOR,
      sort_order: existing.length,
      completed_retention_days: 7,
    })
    .select(NOTEPAD_SELECT)
    .single();
  if (error) throw error;
  return mapNotepad(data as unknown as NotepadRow);
}

export async function updateNotepad(
  supabase: Client,
  userId: string,
  input: {
    id: string;
    name?: string;
    icon?: string | null;
    accent?: string | null;
    isPinned?: boolean;
    completedRetentionDays?: number | null;
  },
): Promise<Notepad[]> {
  const patch: Record<string, unknown> = {};
  if (input.name) patch["title"] = input.name;
  if (input.icon !== undefined) patch["icon"] = isNotepadIcon(input.icon) ? input.icon : null;
  if (input.accent !== undefined && TAG_COLOR_KEYS.includes(input.accent as never)) {
    patch["accent"] = input.accent;
  }
  if (input.isPinned !== undefined) patch["is_pinned"] = input.isPinned;
  if (input.completedRetentionDays !== undefined) {
    patch["completed_retention_days"] = input.completedRetentionDays;
  }

  if (Object.keys(patch).length) {
    const { error } = await supabase
      .from("conversations")
      .update(patch)
      .eq("id", input.id)
      .eq("user_id", userId);
    if (error) throw error;
  }
  return listNotepads(supabase, userId);
}

/**
 * Deleting takes the notepad's whole world with it — messages, tags, groups,
 * rules, suggestions. The last remaining notepad is never removable.
 */
export async function deleteNotepad(
  supabase: Client,
  userId: string,
  notepadId: string,
): Promise<{ notepads: Notepad[] }> {
  const notepads = await listNotepads(supabase, userId);
  if (notepads.length <= 1) throw new Error("Flow always keeps at least one notepad");

  await supabase.from("messages").delete().eq("user_id", userId).eq("conversation_id", notepadId);
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", notepadId)
    .eq("user_id", userId);
  if (error) throw error;

  return { notepads: await listNotepads(supabase, userId) };
}

export async function reorderNotepads(
  supabase: Client,
  userId: string,
  ids: string[],
): Promise<Notepad[]> {
  for (let index = 0; index < ids.length; index++) {
    const { error } = await supabase
      .from("conversations")
      .update({ sort_order: index })
      .eq("id", ids[index]!)
      .eq("user_id", userId);
    if (error) throw error;
  }
  return listNotepads(supabase, userId);
}

/** Flow reopens where the user left off, across devices. */
export async function rememberActiveNotepad(
  supabase: Client,
  userId: string,
  notepadId: string,
): Promise<void> {
  const existing = await supabase
    .from("user_preferences")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  const settings = { ...((existing.data?.settings as Record<string, unknown>) ?? {}) };
  settings["activeNotepadId"] = notepadId;
  await supabase
    .from("user_preferences")
    .upsert({ user_id: userId, settings }, { onConflict: "user_id" });
}

export async function readActiveNotepad(
  supabase: Client,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("user_preferences")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  const value = (data?.settings as Record<string, unknown> | null)?.["activeNotepadId"];
  return typeof value === "string" ? value : null;
}
