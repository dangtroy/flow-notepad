import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { normalizeTag } from "./tag-normalize";
import { MIN_EVIDENCE, type SuggestionKind, type TagSuggestion } from "./suggestions";

type Client = SupabaseClient<Database>;

/**
 * Organizing runs in tiers, cheapest first:
 *   1. deterministic keyword rules
 *   2. the user's existing tags + their context rules
 *   3. one small AI classification call, only when tiers 1-2 leave doubt
 * Nothing here ever sees the whole conversation, and an unchanged note is
 * never analyzed twice.
 */

const MAX_AI_CANDIDATES = 12;
const MAX_CONTENT_CHARS = 1800;
const MAX_PARENT_CHARS = 400;
const AUTO_CONFIDENCE = 0.65;
const SUGGEST_CONFIDENCE = 0.45;

type TagRow = {
  id: string;
  name: string;
  normalized_name: string;
  color: string | null;
  context: string | null;
  is_enabled: boolean | null;
  auto_apply: boolean | null;
  match_keywords: string[] | null;
  group_id: string | null;
};

type GroupRow = { id: string; name: string };

/** Stable, cheap content fingerprint so unchanged notes are skipped entirely. */
export function fingerprint(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = (h1 ^ code) * 16777619;
    h2 = (h2 + code * (i + 1)) | 0;
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}:${text.length}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Keywords come from the user: explicit match keywords, the tag's own name, and
 * any "quoted phrases" inside its context rule.
 */
export function keywordsForTag(tag: {
  name: string;
  match_keywords?: string[] | null;
  context?: string | null;
}): string[] {
  const list = new Set<string>();
  for (const keyword of tag.match_keywords ?? []) {
    const trimmed = keyword.trim();
    if (trimmed.length >= 2) list.add(trimmed.toLowerCase());
  }
  const name = tag.name.trim();
  if (name.length >= 3) list.add(name.toLowerCase());
  for (const match of (tag.context ?? "").matchAll(/"([^"]{2,40})"/g)) {
    list.add(match[1]!.trim().toLowerCase());
  }
  return [...list];
}

export function matchesKeyword(content: string, keyword: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`, "i");
  return pattern.test(content);
}

/** Lexical relevance, used only to decide which tags are worth sending to AI. */
function relevance(content: string, tag: TagRow, group?: GroupRow): number {
  const haystack = content.toLowerCase();
  const words = new Set(
    `${tag.name} ${tag.context ?? ""} ${group?.name ?? ""}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3),
  );
  let hits = 0;
  for (const word of words) if (haystack.includes(word)) hits += 1;
  return hits;
}

type AiTag = { name: string; confidence: number };
type AiConcept = { name: string; reason: string; group?: string | null };

/**
 * The same call that classifies tags also reads the note for actionability.
 * `label` is a display rewrite only — it is stored in metadata and never
 * overwrites the user's own words.
 */
export type AiTask = {
  is_actionable: boolean;
  due_at: string | null;
  due_is_fuzzy: boolean;
  priority: "low" | "normal" | "high" | null;
  label: string | null;
};

const PRIORITY_VALUES = new Set(["low", "normal", "high"]);

function parseTask(raw: unknown): AiTask | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value["is_actionable"] === false) return null;

  const due = typeof value["due_at"] === "string" ? new Date(value["due_at"]) : null;
  const priority = typeof value["priority"] === "string" ? value["priority"].toLowerCase() : "";
  const label = typeof value["label"] === "string" ? value["label"].trim().slice(0, 80) : "";

  return {
    is_actionable: true,
    due_at: due && !Number.isNaN(due.getTime()) ? due.toISOString() : null,
    due_is_fuzzy: value["due_is_fuzzy"] === true,
    priority: PRIORITY_VALUES.has(priority) ? (priority as AiTask["priority"]) : null,
    label: label || null,
  };
}

async function classifyWithAi(input: {
  content: string;
  parent: string | null;
  tags: Array<{ name: string; context: string; group?: string | null }>;
}): Promise<{ tags: AiTag[]; concepts: AiConcept[]; summary: string; task: AiTask | null }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured");

  const tagLines = input.tags
    .map((tag) => `- "${tag.name}"${tag.group ? ` (group: ${tag.group})` : ""}: ${tag.context}`)
    .join("\n");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // Deliberately the cheapest capable model: this runs on every new note.
      model: "google/gemini-3.1-flash-lite",
      messages: [
        {
          role: "system",
          content: [
            "You classify ONE short personal note against the user's own tags.",
            "Only use tag names from the provided list, copied exactly. Never rename or invent tags there.",
            "Give each chosen tag a confidence between 0 and 1 based on how clearly the note matches that tag's context rule.",
            "Return no tags when nothing matches — that is a correct answer.",
            "Optionally return concepts: a recurring, reusable topic that no existing tag covers. Skip trivial or one-off nouns. Usually return an empty concepts array.",
            'Respond ONLY with JSON: {"tags":[{"name":"...","confidence":0.0}],"concepts":[{"name":"...","reason":"...","group":"..."}],"summary":"..."}',
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            tagLines ? `Existing tags and their context rules:\n${tagLines}` : "Existing tags: none",
            input.parent ? `This note replies to: ${input.parent}` : "",
            `Note: ${input.content}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`AI gateway error ${response.status}`);

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = payload.choices?.[0]?.message?.content ?? "";
  const jsonText = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  const parsed = JSON.parse(jsonText) as {
    tags?: Array<{ name?: unknown; confidence?: unknown }>;
    concepts?: Array<{ name?: unknown; reason?: unknown; group?: unknown }>;
    summary?: unknown;
  };

  return {
    tags: (parsed.tags ?? [])
      .filter((tag) => typeof tag?.name === "string")
      .slice(0, 6)
      .map((tag) => ({
        name: String(tag.name),
        confidence: Math.max(0, Math.min(1, Number(tag.confidence ?? 0.6) || 0.6)),
      })),
    concepts: (parsed.concepts ?? [])
      .filter((concept) => typeof concept?.name === "string")
      .slice(0, 2)
      .map((concept) => ({
        name: String(concept.name).trim().slice(0, 60),
        reason: typeof concept.reason === "string" ? concept.reason.slice(0, 400) : "",
        group: typeof concept.group === "string" ? concept.group : null,
      })),
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 400) : "",
  };
}

/**
 * Records evidence for a suggestion without ever creating a tag. Ignored
 * suggestions stay ignored, so Flow does not nag about the same concept.
 */
async function recordSuggestion(
  supabase: Client,
  userId: string,
  notepadId: string,
  suggestion: {
    kind: SuggestionKind;
    name: string;
    tagId?: string | null;
    reason: string;
    messageId: string;
    groupId?: string | null;
    groupName?: string | null;
  },
) {
  const normalized = normalizeTag(suggestion.name);
  if (!normalized) return;

  const existing = await supabase
    .from("tag_suggestions")
    .select("id, status, message_ids, evidence_count, reason")
    .eq("user_id", userId)
    .eq("conversation_id", notepadId)
    .eq("kind", suggestion.kind)
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (existing.data) {
    if (existing.data.status !== "pending") return;
    const ids = new Set(existing.data.message_ids ?? []);
    if (ids.has(suggestion.messageId)) return;
    ids.add(suggestion.messageId);
    await supabase
      .from("tag_suggestions")
      .update({
        message_ids: [...ids],
        evidence_count: ids.size,
        reason: suggestion.reason || existing.data.reason,
      })
      .eq("id", existing.data.id)
      .eq("user_id", userId);
    return;
  }

  await supabase.from("tag_suggestions").insert({
    user_id: userId,
    conversation_id: notepadId,
    kind: suggestion.kind,
    tag_id: suggestion.tagId ?? null,
    name: suggestion.name.trim().slice(0, 60),
    normalized_name: normalized,
    reason: suggestion.reason,
    suggested_group_id: suggestion.groupId ?? null,
    suggested_group_name: suggestion.groupName ?? null,
    message_ids: [suggestion.messageId],
    evidence_count: 1,
  });
}

export type OrganizeResult = {
  ok: boolean;
  skipped?: boolean;
  usedAi?: boolean;
  applied?: number;
  suggested?: number;
  reason?: string;
};

export async function organizeMessage(
  supabase: Client,
  userId: string,
  messageId: string,
  options: { force?: boolean } = {},
): Promise<OrganizeResult> {
  const message = await supabase
    .from("messages")
    .select("id, content, ai_status, ai_fingerprint, parent_message_id, conversation_id")
    .eq("id", messageId)
    .eq("user_id", userId)
    .maybeSingle();
  if (message.error) throw message.error;
  if (!message.data) return { ok: false, reason: "not_found" };

  // A note is only ever organized against its own notepad's tags and rules.
  const notepadId = message.data.conversation_id;
  const content = (message.data.content ?? "").trim();
  const stamp = fingerprint(content);

  // Tier 0: nothing changed since the last pass — no work, no AI.
  if (!options.force && message.data.ai_status === "done" && message.data.ai_fingerprint === stamp) {
    return { ok: true, skipped: true };
  }

  try {
    const [tagRows, groupRows] = await Promise.all([
      supabase
        .from("tags")
        .select("id, name, normalized_name, color, context, is_enabled, auto_apply, match_keywords, group_id")
        .eq("user_id", userId)
        .eq("conversation_id", notepadId),
      supabase
        .from("tag_groups")
        .select("id, name")
        .eq("user_id", userId)
        .eq("conversation_id", notepadId),
    ]);

    const tags = ((tagRows.data ?? []) as TagRow[]).filter((tag) => tag.is_enabled !== false);
    const groups = (groupRows.data ?? []) as GroupRow[];
    const groupById = new Map(groups.map((group) => [group.id, group]));

    const autoTagIds = new Set<string>();
    const decided = new Set<string>();

    // Tier 1: deterministic rules. A literal match needs no model at all.
    for (const tag of tags) {
      const hit = keywordsForTag(tag).some((keyword) => matchesKeyword(content, keyword));
      if (!hit) continue;
      decided.add(tag.id);
      if (tag.auto_apply !== false) autoTagIds.add(tag.id);
      else {
        await recordSuggestion(supabase, userId, notepadId, {
          kind: "existing_tag",
          tagId: tag.id,
          name: tag.name,
          reason: `Matches your rule for ${tag.name}.`,
          messageId,
          groupId: tag.group_id,
          groupName: tag.group_id ? (groupById.get(tag.group_id)?.name ?? null) : null,
        });
      }
    }

    // Tier 2: only the tags whose written context could plausibly relate, and
    // only their rules — never the conversation, never the whole tag table.
    const candidates = tags
      .filter((tag) => !decided.has(tag.id) && (tag.context ?? "").trim().length > 0)
      .map((tag) => ({
        tag,
        score: relevance(content, tag, tag.group_id ? groupById.get(tag.group_id) : undefined),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_AI_CANDIDATES)
      .map((entry) => entry.tag);

    let usedAi = false;
    let summary = "";
    let suggested = 0;

    // Tier 3: one small AI call, and only when there is genuine doubt left.
    const worthAi = content.length >= 12 && (candidates.length > 0 || tags.length === 0);
    if (worthAi) {
      let parentExcerpt: string | null = null;
      if (message.data.parent_message_id) {
        const parent = await supabase
          .from("messages")
          .select("content")
          .eq("id", message.data.parent_message_id)
          .eq("user_id", userId)
          .maybeSingle();
        parentExcerpt = parent.data?.content?.slice(0, MAX_PARENT_CHARS) ?? null;
      }

      const result = await classifyWithAi({
        content: content.slice(0, MAX_CONTENT_CHARS),
        parent: parentExcerpt,
        tags: candidates.map((tag) => ({
          name: tag.name,
          context: (tag.context ?? "").trim(),
          group: tag.group_id ? (groupById.get(tag.group_id)?.name ?? null) : null,
        })),
      });
      usedAi = true;
      summary = result.summary;

      const byNormalized = new Map(candidates.map((tag) => [tag.normalized_name, tag]));
      for (const choice of result.tags) {
        const tag = byNormalized.get(normalizeTag(choice.name));
        if (!tag) continue;
        if (choice.confidence >= AUTO_CONFIDENCE && tag.auto_apply !== false) {
          autoTagIds.add(tag.id);
        } else if (choice.confidence >= SUGGEST_CONFIDENCE) {
          suggested += 1;
          await recordSuggestion(supabase, userId, notepadId, {
            kind: "existing_tag",
            tagId: tag.id,
            name: tag.name,
            reason: `Flow thinks this may be about ${tag.name}, but wasn't sure enough to apply it.`,
            messageId,
            groupId: tag.group_id,
            groupName: tag.group_id ? (groupById.get(tag.group_id)?.name ?? null) : null,
          });
        }
      }

      // New concepts are only ever proposals: Flow never creates a tag itself.
      for (const concept of result.concepts) {
        const normalized = normalizeTag(concept.name);
        if (!normalized) continue;
        if (tags.some((tag) => tag.normalized_name === normalized)) continue;
        const group = groups.find(
          (candidate) => normalizeTag(candidate.name) === normalizeTag(concept.group ?? ""),
        );
        suggested += 1;
        await recordSuggestion(supabase, userId, notepadId, {
          kind: "new_tag",
          name: concept.name,
          reason: concept.reason,
          messageId,
          groupId: group?.id ?? null,
          groupName: group?.name ?? concept.group ?? null,
        });
      }
    }

    // AI-applied links are replaced; anything the user applied stays put.
    await supabase.from("message_tags").delete().eq("message_id", messageId).eq("source", "ai");
    if (autoTagIds.size) {
      await supabase.from("message_tags").upsert(
        [...autoTagIds].map((tagId) => ({
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
        ai_fingerprint: stamp,
        ai_context: { summary, used_ai: usedAi },
      })
      .eq("id", messageId)
      .eq("user_id", userId);

    return { ok: true, usedAi, applied: autoTagIds.size, suggested };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown AI error";
    await supabase
      .from("messages")
      .update({ ai_status: "failed", ai_error: reason })
      .eq("id", messageId)
      .eq("user_id", userId);
    return { ok: false, reason };
  }
}

/** Only suggestions with real, repeated evidence are shown. */
export async function loadSuggestions(
  supabase: Client,
  userId: string,
  notepadId: string,
): Promise<TagSuggestion[]> {
  const { data, error } = await supabase
    .from("tag_suggestions")
    .select(
      "id, kind, tag_id, name, reason, message_ids, evidence_count, suggested_group_id, suggested_group_name",
    )
    .eq("user_id", userId)
    .eq("conversation_id", notepadId)
    .eq("status", "pending")
    .order("evidence_count", { ascending: false })
    .limit(50);
  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      id: row.id,
      kind: (row.kind === "existing_tag" ? "existing_tag" : "new_tag") as SuggestionKind,
      tag_id: row.tag_id,
      name: row.name,
      reason: row.reason,
      message_count: (row.message_ids ?? []).length,
      suggested_group_id: row.suggested_group_id,
      suggested_group_name: row.suggested_group_name,
      evidence_count: row.evidence_count,
    }))
    .filter((row) => row.evidence_count >= MIN_EVIDENCE[row.kind]);
}
