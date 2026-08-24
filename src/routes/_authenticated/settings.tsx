import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Pipette, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AppearanceSettings } from "@/components/flow/appearance-settings";
import { NotepadsSettings } from "@/components/flow/notepads-settings";
import {

  deleteTag,
  deleteTagGroup,
  getPreferences,
  retagAllMessages,
  reorderTagGroups,
  deleteTagExample,
  saveTag,
  saveTagGroup,
  updatePreferences,
} from "@/lib/flow.functions";
import type { FlowTagDetail, FlowTagGroup } from "@/lib/flow.server";
import {
  TAG_COLOR_KEYS,
  TAG_COLORS,
  isCustomColor,
  tagAccent,
  tagColorHex,
  tagColorKey,
} from "@/lib/tag-colors";
import { findSimilarTag } from "@/lib/tag-filter";
import { tagsKey, tagGroupsKey, useTagGroups, useTags } from "@/lib/use-tags";
import { useActiveNotepadId } from "@/lib/use-notepad";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Flow settings — tags, context and retention" },
      {
        name: "description",
        content:
          "Manage your Flow tags in one place: name, colour, the plain-English context Flow organizes by, and how long completed thoughts are kept.",
      },
      { property: "og:title", content: "Flow settings" },
      {
        property: "og:description",
        content: "Tag names, colours, context rules and completed-thought retention for your Flow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const RETENTION_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "1 day", value: 1 },
  { label: "3 days", value: 3 },
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "Never", value: null },
];

/** Accepts one name typed normally, or a pasted comma/newline separated list. */
function splitNames(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function SettingsPage() {
  const queryClient = useQueryClient();
  const notepadId = useActiveNotepadId();
  const fetchPrefs = useServerFn(getPreferences);
  const savePrefs = useServerFn(updatePreferences);

  // Retention is a per-notepad setting, so it is cached per notepad too.
  const prefs = useQuery({
    queryKey: ["preferences", notepadId ?? "none"],
    queryFn: () => fetchPrefs({ data: { notepadId } }),
    enabled: Boolean(notepadId),
  });

  async function chooseRetention(value: number | null) {
    try {
      await savePrefs({ data: { completedRetentionDays: value, notepadId } });
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    } catch {
      toast.error("Could not save that preference");
    }
  }

  const current = prefs.data?.completedRetentionDays ?? null;

  return (
    <main className="flex-1 overflow-y-auto px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          to="/"
          search={{}}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Flow
        </Link>

        <h1 className="mt-8 font-display text-3xl tracking-tight">Settings</h1>

        <NotepadsSettings />

        <TagsSection />

        <GroupsSection />

        <AppearanceSettings />






        <section className="mt-14">
          <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Completed thoughts
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Finished thoughts stay in your stream, then disappear on their own. Unfinished thoughts
            are never deleted.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {RETENTION_OPTIONS.map((option) => (
              <button
                key={option.label}
                onClick={() => chooseRetention(option.value)}
                className={cn(
                  "rounded-md border px-3.5 py-1.5 text-sm transition-colors",
                  (prefs.data ? current : 7) === option.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {(prefs.data?.deletionHistory.length ?? 0) > 0 && (
          <section className="mt-12 pb-16">
            <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Recently removed
            </h2>
            <ul className="mt-4 space-y-2">
              {prefs.data?.deletionHistory.map((entry) => (
                <li key={entry.id} className="text-sm text-muted-foreground">
                  <span className="line-through">{entry.content_snapshot}</span>{" "}
                  <span className="text-muted-foreground/60">
                    · removed {new Date(entry.deleted_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

/**
 * One place for everything about a tag: its name, colour, the plain-English
 * context Flow organizes by, whether it is active, and how often it is used.
 */
function TagsSection() {
  const queryClient = useQueryClient();
  const notepadId = useActiveNotepadId();
  const persist = useServerFn(saveTag);
  const remove = useServerFn(deleteTag);
  const retagAll = useServerFn(retagAllMessages);

  /** A changed rule changes meaning: every existing note is read again. */
  async function retagEverything() {
    const pending = toast.loading("Re-reading your notes with the new rules…");
    try {
      const result = await retagAll({ data: { notepadId } });
      toast.success(`Re-organized ${result.organized} of ${result.total} notes`, { id: pending });
    } catch {
      toast.error("Could not re-organize your notes", { id: pending });
    }
    queryClient.invalidateQueries({ queryKey: tagsKey(notepadId) });
    queryClient.invalidateQueries({ queryKey: ["stream"] });
  }
  const tags = useTags();
  const groups = useTagGroups();


  const [newName, setNewName] = useState("");
  const [newContext, setNewContext] = useState("");
  const list = tags.data ?? [];
  const names = splitNames(newName);
  const similar = names.length === 1 ? findSimilarTag(newName, list) : null;

  function refresh(next?: FlowTagDetail[]) {
    if (next) queryClient.setQueryData(tagsKey(notepadId), next);
    else queryClient.invalidateQueries({ queryKey: tagsKey(notepadId) });
    queryClient.invalidateQueries({ queryKey: ["stream"] });
  }

  /** One name, or a pasted list — the same flow either way, one tag per name. */
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (names.length === 0) return;

    if (names.length === 1) {
      try {
        refresh(await persist({ data: { name: names[0]!, context: newContext } }));
        setNewName("");
        setNewContext("");
        void retagEverything();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not create that tag");
      }
      return;
    }

    let created = 0;
    const skipped: string[] = [];
    for (const name of names) {
      try {
        refresh(await persist({ data: { name, context: newContext } }));
        created += 1;
      } catch {
        skipped.push(name);
      }
    }
    setNewName("");
    setNewContext("");
    if (created > 0) {
      toast.success(
        `Added ${created} ${created === 1 ? "tag" : "tags"}` +
          (skipped.length ? ` · skipped ${skipped.join(", ")}` : ""),
      );
      void retagEverything();
    } else {
      toast.error(`Could not add ${skipped.join(", ")}`);
    }
  }

  async function update(
    id: string,
    patch: {
      name?: string;
      color?: string;
      context?: string;
      exclusionHint?: string;
      isEnabled?: boolean;
      groupId?: string | null;
      matchKeywords?: string[];
      autoApply?: boolean;
    },
  ) {
    try {
      refresh(await persist({ data: { id, ...patch } }));
      // Rules changed, so existing notes are re-read against the new intent.
      if (
        patch.context !== undefined ||
        patch.exclusionHint !== undefined ||
        patch.isEnabled !== undefined ||
        patch.name !== undefined ||
        patch.matchKeywords !== undefined
      ) {
        void retagEverything();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update that tag");
    }
  }


  async function drop(tag: FlowTagDetail) {
    try {
      refresh(await remove({ data: { id: tag.id } }));
    } catch {
      toast.error("Could not delete that tag");
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">Tags</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        Tags are how Flow organizes your stream. Describe each one in plain English — Flow reads what
        a thought is about, not the words it happens to contain.
      </p>

      <form onSubmit={create} className="mt-5 space-y-3">
        <textarea
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          rows={names.length > 1 ? 3 : 1}
          placeholder="New tag, e.g. ShipHero — or paste a list, comma or line separated"
          className="w-full resize-none rounded-lg border border-border bg-card px-4 py-2.5 text-[15px] leading-relaxed outline-none focus:border-ring"
        />
        <textarea
          value={newContext}
          onChange={(e) => setNewContext(e.target.value)}
          rows={3}
          placeholder="Anything about ShipHero: warehouse inventory, syncing, orders, operations."
          className="w-full resize-none rounded-lg border border-border bg-card px-4 py-2.5 text-[15px] leading-relaxed outline-none focus:border-ring"
        />
        {similar && (
          <p className="text-[13px] text-muted-foreground">
            You already have a similar tag: <span className="text-foreground">{similar.name}</span> —
            consider editing that one instead.
          </p>
        )}
        {names.length > 1 && (
          <p className="text-[13px] text-muted-foreground">
            {names.length} tags will be created: {names.join(", ")}
          </p>
        )}
        <button
          type="submit"
          disabled={names.length === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {names.length > 1 ? `Add ${names.length} tags` : "Add tag"}
        </button>
      </form>

      <ul className="mt-8 space-y-3">
        {list.map((tag) => (
          <TagRow
            key={tag.id}
            tag={tag}
            groups={groups.data ?? []}
            onUpdate={update}
            onDelete={drop}
          />
        ))}
        {list.length === 0 && (
          <li className="text-sm text-muted-foreground">No tags yet.</li>
        )}
      </ul>
    </section>
  );
}

function TagRow({
  tag,
  groups,
  onUpdate,
  onDelete,
}: {
  tag: FlowTagDetail;
  groups: FlowTagGroup[];
  onUpdate: (
    id: string,
    patch: {
      name?: string;
      color?: string;
      context?: string;
      exclusionHint?: string;
      isEnabled?: boolean;
      groupId?: string | null;
      matchKeywords?: string[];
      autoApply?: boolean;
    },
  ) => Promise<void>;
  onDelete: (tag: FlowTagDetail) => Promise<void>;
}) {
  const [name, setName] = useState(tag.name);
  const [context, setContext] = useState(tag.context);
  const [exclusion, setExclusion] = useState(tag.exclusion_hint);
  const [parsedKeywords, setKeywords] = useState<string[]>(tag.match_keywords);
  const dirty =
    name.trim() !== tag.name ||
    context.trim() !== tag.context ||
    exclusion.trim() !== tag.exclusion_hint ||
    parsedKeywords.join("|") !== tag.match_keywords.join("|");


  return (
    <li
      className={cn(
        "rounded-lg border border-border/70 bg-card px-4 py-3.5",
        !tag.is_enabled && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: tagAccent(tag.color) }}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={`Name for ${tag.name}`}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none"
        />
        <span className="shrink-0 text-[12px] text-muted-foreground/70">
          {tag.message_count} {tag.message_count === 1 ? "message" : "messages"}
        </span>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => void onUpdate(tag.id, { autoApply: !tag.auto_apply })}
            title={
              tag.auto_apply
                ? "Applied automatically when Flow is confident"
                : "Flow will only suggest this tag"
            }
            className="transition-colors hover:text-foreground"
          >
            {tag.auto_apply ? "Auto" : "Suggest only"}
          </button>
          <button
            type="button"
            onClick={() => void onUpdate(tag.id, { isEnabled: !tag.is_enabled })}
            className="transition-colors hover:text-foreground"
          >
            {tag.is_enabled ? "Disable" : "Enable"}
          </button>

          <button
            type="button"
            onClick={() => void onDelete(tag)}
            aria-label={`Delete ${tag.name}`}
            className="transition-colors hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <textarea
        value={context}
        onChange={(e) => setContext(e.target.value)}
        rows={2}
        aria-label={`Context for ${tag.name}`}
        placeholder="What does this tag mean? Flow uses this to decide."
        className="mt-2 w-full resize-none bg-transparent text-sm leading-relaxed text-muted-foreground outline-none"
      />

      <textarea
        value={exclusion}
        onChange={(e) => setExclusion(e.target.value)}
        rows={2}
        aria-label={`Exclusions for ${tag.name}`}
        placeholder="When should Flow NOT use it?"
        className="w-full resize-none bg-transparent text-sm leading-relaxed text-muted-foreground outline-none"
      />

      {/* What Flow has learned from your own approvals and dismissals. */}
      <TagExamples tag={tag} />

      {/* Literal words: a match here is handled instantly, with no AI call. */}
      <KeywordChips
        label={`Match words for ${tag.name}`}
        keywords={parsedKeywords}
        onChange={setKeywords}
      />


      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <ColorChoices
          label={tag.name}
          color={tag.color}
          shape="round"
          onPick={(color) => void onUpdate(tag.id, { color })}
        />

        <select
          value={tag.group_id ?? ""}
          onChange={(e) => void onUpdate(tag.id, { groupId: e.target.value || null })}
          aria-label={`Group for ${tag.name}`}
          className="rounded-md border border-border/70 bg-transparent px-2 py-1 text-xs text-muted-foreground outline-none focus:border-ring"
        >
          <option value="">Ungrouped</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>


        {dirty && (
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setName(tag.name);
                setContext(tag.context);
                setExclusion(tag.exclusion_hint);
                setKeywords(tag.match_keywords);
              }}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                void onUpdate(tag.id, {
                  name: name.trim(),
                  context: context.trim(),
                  exclusionHint: exclusion.trim(),
                  matchKeywords: parsedKeywords,
                })
              }
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground"
            >
              <Check className="h-3.5 w-3.5" /> Save
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Read-only view of what Flow has learned about a tag, with one-click removal
 * so a single bad example never keeps teaching the wrong lesson.
 */
function TagExamples({ tag }: { tag: FlowTagDetail }) {
  const queryClient = useQueryClient();
  const notepadId = useActiveNotepadId();
  const dropExample = useServerFn(deleteTagExample);

  if (tag.positive_examples.length === 0 && tag.negative_examples.length === 0) return null;

  async function remove(kind: "positive" | "negative", example: string) {
    try {
      const next = await dropExample({ data: { tagId: tag.id, kind, example } });
      queryClient.setQueryData(tagsKey(notepadId), next);
    } catch {
      toast.error("Could not remove that example");
    }
  }

  function list(kind: "positive" | "negative", label: string, examples: string[]) {
    if (examples.length === 0) return null;
    return (
      <div className="mt-2">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">{label}</p>
        <ul className="mt-1 space-y-1">
          {examples.map((example) => (
            <li key={example} className="flex items-start gap-2 text-[13px] text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{example}</span>
              <button
                type="button"
                onClick={() => void remove(kind, example)}
                aria-label={`Forget example: ${example}`}
                className="mt-0.5 shrink-0 text-muted-foreground/60 transition-colors hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-1 border-t border-border/50 pt-1">
      {list("positive", "Notes you confirmed", tag.positive_examples)}
      {list("negative", "Notes you dismissed", tag.negative_examples)}
    </div>
  );
}

/**
 * Groups are the user's organizing layer over AI-applied tags. Deleting one
 * only removes the grouping — tags and messages are untouched.
 */
function GroupsSection() {
  const queryClient = useQueryClient();
  const notepadId = useActiveNotepadId();
  const persist = useServerFn(saveTagGroup);
  const remove = useServerFn(deleteTagGroup);
  const reorder = useServerFn(reorderTagGroups);

  const groups = useTagGroups();
  const tags = useTags();
  const [newName, setNewName] = useState("");
  const list = groups.data ?? [];

  function apply(next: FlowTagGroup[]) {
    queryClient.setQueryData(tagGroupsKey(notepadId), next);
    queryClient.invalidateQueries({ queryKey: tagsKey(notepadId) });
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    try {
      apply(await persist({ data: { name: newName } }));
      setNewName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create that group");
    }
  }

  async function rename(group: FlowTagGroup, name: string) {
    if (!name.trim() || name.trim() === group.name) return;
    try {
      apply(await persist({ data: { id: group.id, name: name.trim() } }));
    } catch {
      toast.error("Could not rename that group");
    }
  }

  async function recolor(group: FlowTagGroup, color: string) {
    try {
      apply(await persist({ data: { id: group.id, color } }));
    } catch {
      toast.error("Could not update that group");
    }
  }


  async function move(index: number, delta: number) {
    const next = [...list];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    try {
      apply(await reorder({ data: { ids: next.map((group) => group.id) } }));
    } catch {
      toast.error("Could not reorder groups");
    }
  }

  async function drop(group: FlowTagGroup) {
    try {
      apply(await remove({ data: { id: group.id } }));
    } catch {
      toast.error("Could not delete that group");
    }
  }

  return (
    <section className="mt-14">
      <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Groups
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        Tags describe what a note is about. Groups are yours: create one here, then drag tags into
        it from the sidebar. Deleting a group keeps its tags.
      </p>

      <form onSubmit={create} className="mt-5 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New group, e.g. Work"
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-[15px] outline-none focus:border-ring"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          Add group
        </button>
      </form>

      <ul className="mt-6 space-y-2">
        {list.map((group, index) => (
          <GroupRow
            key={group.id}
            group={group}
            count={(tags.data ?? []).filter((tag) => tag.group_id === group.id).length}
            onRename={rename}
            onRecolor={recolor}
            onMove={(delta) => move(index, delta)}
            onDelete={drop}
          />

        ))}
        {list.length === 0 && <li className="text-sm text-muted-foreground">No groups yet.</li>}
      </ul>
    </section>
  );
}

function GroupRow({
  group,
  count,
  onRename,
  onRecolor,
  onMove,
  onDelete,
}: {
  group: FlowTagGroup;
  count: number;
  onRename: (group: FlowTagGroup, name: string) => Promise<void>;
  onRecolor: (group: FlowTagGroup, color: string) => Promise<void>;
  onMove: (delta: number) => Promise<void>;
  onDelete: (group: FlowTagGroup) => Promise<void>;
}) {
  const [name, setName] = useState(group.name);



  return (
    <li className="rounded-lg border border-border/70 bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-sm"
        style={{ backgroundColor: tagAccent(group.color) }}
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void onRename(group, name)}
        aria-label={`Name for ${group.name}`}
        className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none"
      />
      <span className="shrink-0 text-[12px] text-muted-foreground/70">
        {count} {count === 1 ? "tag" : "tags"}
      </span>

      <div className="shrink-0">
        <ColorChoices
          label={group.name}
          color={group.color}
          shape="square"
          onPick={(color) => void onRecolor(group, color)}
        />
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <button type="button" onClick={() => void onMove(-1)} aria-label={`Move ${group.name} up`} className="hover:text-foreground">
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => void onMove(1)} aria-label={`Move ${group.name} down`} className="hover:text-foreground">
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void onDelete(group)}
          aria-label={`Delete ${group.name}`}
          className="hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      </div>

    </li>
  );
}


/**
 * Match words as chips: type or paste, Enter or comma commits, each chip removable.
 * The 2-character minimum lives here so nothing shorter ever reaches the server.
 */
function KeywordChips({
  label,
  keywords,
  onChange,
}: {
  label: string;
  keywords: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const parts = raw
      .split(/[\n,]/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2);
    if (parts.length === 0) return;
    const next = [...keywords];
    for (const part of parts) {
      if (!next.some((existing) => existing.toLowerCase() === part.toLowerCase())) next.push(part);
    }
    onChange(next);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {keywords.map((keyword) => (
        <span
          key={keyword}
          className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-[2px] text-[12px] text-muted-foreground"
        >
          {keyword}
          <button
            type="button"
            onClick={() => onChange(keywords.filter((item) => item !== keyword))}
            aria-label={`Remove ${keyword}`}
            className="text-muted-foreground/60 transition-colors hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        aria-label={label}
        placeholder={keywords.length ? "Add word…" : "Instant match words (Enter or comma)"}
        onChange={(event) => {
          const value = event.target.value;
          if (/[\n,]/.test(value)) {
            add(value);
            setDraft("");
          } else {
            setDraft(value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(draft);
            setDraft("");
          }
          if (event.key === "Backspace" && !draft && keywords.length) {
            onChange(keywords.slice(0, -1));
          }
        }}
        onBlur={() => {
          add(draft);
          setDraft("");
        }}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text");
          if (!/[\n,]/.test(text)) return;
          event.preventDefault();
          add(text);
          setDraft("");
        }}
        className="min-w-[9rem] flex-1 bg-transparent text-[13px] text-muted-foreground/85 outline-none"
      />
    </div>
  );
}

/** The eight presets stay as quick picks; the swatch at the end is any colour at all. */
function ColorChoices({
  label,
  color,
  shape,
  onPick,
}: {
  label: string;
  color: string | null;
  shape: "round" | "square";
  onPick: (color: string) => void;
}) {
  const round = shape === "round";
  const custom = isCustomColor(color);

  return (
    <div className="flex items-center gap-1.5">
      {TAG_COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onPick(key)}
          aria-label={`${TAG_COLORS[key].label} for ${label}`}
          className={cn(
            "h-4 w-4 ring-offset-2 ring-offset-card transition-shadow",
            round ? "rounded-full" : "rounded-sm",
            !custom && tagColorKey(color) === key && "ring-1 ring-border-strong",
          )}
          style={{ backgroundColor: TAG_COLORS[key].accent }}
        />
      ))}
      <label
        className={cn(
          "relative h-4 w-4 cursor-pointer overflow-hidden border border-border ring-offset-2 ring-offset-card",
          round ? "rounded-full" : "rounded-sm",
          custom && "ring-1 ring-border-strong",
        )}
        style={{ backgroundColor: custom ? tagAccent(color) : "transparent" }}
        title={`Custom colour for ${label}`}
      >
        {!custom && <Pipette aria-hidden className="absolute inset-0 m-auto h-2.5 w-2.5 text-muted-foreground" />}
        <input
          type="color"
          value={tagColorHex(color)}
          aria-label={`Custom colour for ${label}`}
          onChange={(event) => onPick(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
