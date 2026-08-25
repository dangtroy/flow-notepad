import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Pipette, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  deleteTag,
  deleteTagExample,
  retagAllMessages,
  saveTag,
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
import { tagsKey, useTagGroups, useTags } from "@/lib/use-tags";
import { useActiveNotepadId } from "@/lib/use-notepad";
import { cn } from "@/lib/utils";
import { SettingsField, SettingsHint, fieldClass } from "./settings-primitives";

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

/**
 * One place for everything about a tag. Each tag is collapsed to a single quiet
 * row; everything it knows opens underneath only when you ask for it.
 */
export function TagsSection() {
  const queryClient = useQueryClient();
  const notepadId = useActiveNotepadId();
  const persist = useServerFn(saveTag);
  const remove = useServerFn(deleteTag);
  const retagAll = useServerFn(retagAllMessages);

  const tags = useTags();
  const groups = useTagGroups();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContext, setNewContext] = useState("");
  const list = tags.data ?? [];
  const names = splitNames(newName);
  const similar = names.length === 1 ? findSimilarTag(newName, list) : null;

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
        refresh(await persist({ data: { name: names[0]!, context: newContext, notepadId } }));
        setNewName("");
        setNewContext("");
        setAdding(false);
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
        refresh(await persist({ data: { name, context: newContext, notepadId } }));
        created += 1;
      } catch {
        skipped.push(name);
      }
    }
    setNewName("");
    setNewContext("");
    if (created > 0) {
      setAdding(false);
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
      refresh(await persist({ data: { id, ...patch, notepadId } }));
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
      refresh(await remove({ data: { id: tag.id, notepadId } }));
    } catch {
      toast.error("Could not delete that tag");
    }
  }

  return (
    <div>
      <SettingsHint>
        Tags are how Flow organizes this notepad. Describe each one in plain English — Flow reads
        what a thought is about, not the words it happens to contain.
      </SettingsHint>

      {adding ? (
        <form onSubmit={create} className="mt-4 space-y-2 rounded-lg border border-border p-3">
          <textarea
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            rows={names.length > 1 ? 3 : 1}
            placeholder="New tag, e.g. ShipHero — or paste a list"
            className={fieldClass}
          />
          <textarea
            value={newContext}
            onChange={(e) => setNewContext(e.target.value)}
            rows={2}
            placeholder="What belongs here? e.g. warehouse inventory, syncing, orders."
            className={fieldClass}
          />
          {similar && (
            <p className="text-xs text-muted-foreground">
              You already have a similar tag:{" "}
              <span className="text-foreground">{similar.name}</span> — consider editing that one.
            </p>
          )}
          {names.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {names.length} tags will be created: {names.join(", ")}
            </p>
          )}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="submit"
              disabled={names.length === 0}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
            >
              {names.length > 1 ? `Add ${names.length} tags` : "Add tag"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewName("");
                setNewContext("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> New tag
        </button>
      )}

      <Accordion type="single" collapsible className="mt-4 border-t border-border">
        {list.map((tag) => (
          <TagRow
            key={tag.id}
            tag={tag}
            groups={groups.data ?? []}
            onUpdate={update}
            onDelete={drop}
          />
        ))}
      </Accordion>
      {list.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No tags yet.</p>}
    </div>
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
    <AccordionItem value={tag.id} className="border-border">
      <AccordionTrigger
        className={cn(
          "py-2.5 text-sm hover:no-underline [&>svg]:text-muted-foreground/60",
          !tag.is_enabled && "opacity-55",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: tagAccent(tag.color) }}
          />
          <span className="min-w-0 flex-1 truncate text-left font-normal text-foreground">
            {tag.name}
          </span>
          <span className="shrink-0 font-mono text-micro tabular-nums text-ai-muted">
            {tag.message_count}
          </span>
        </span>
      </AccordionTrigger>

      <AccordionContent className="pb-5">
        <div className="space-y-3">
          <SettingsField label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label={`Name for ${tag.name}`}
              className={fieldClass}
            />
          </SettingsField>

          <SettingsField label="What it means">
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={2}
              aria-label={`Context for ${tag.name}`}
              placeholder="Flow uses this to decide."
              className={cn(fieldClass, "resize-none")}
            />
          </SettingsField>

          <SettingsField label="When not to use it">
            <textarea
              value={exclusion}
              onChange={(e) => setExclusion(e.target.value)}
              rows={2}
              aria-label={`Exclusions for ${tag.name}`}
              placeholder="Optional."
              className={cn(fieldClass, "resize-none")}
            />
          </SettingsField>

          <SettingsField label="Instant match words">
            <KeywordChips
              label={`Match words for ${tag.name}`}
              keywords={parsedKeywords}
              onChange={setKeywords}
            />
          </SettingsField>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <SettingsField label="Colour">
              <ColorChoices
                label={tag.name}
                color={tag.color}
                shape="round"
                onPick={(color) => void onUpdate(tag.id, { color })}
              />
            </SettingsField>

            <SettingsField label="Group">
              <select
                value={tag.group_id ?? ""}
                onChange={(e) => void onUpdate(tag.id, { groupId: e.target.value || null })}
                aria-label={`Group for ${tag.name}`}
                className="rounded-md border border-border bg-transparent px-2 py-1 text-xs text-muted-foreground outline-none focus:border-ring"
              >
                <option value="">Ungrouped</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </SettingsField>
          </div>

          {/* What Flow has learned from your own approvals and dismissals. */}
          <TagExamples tag={tag} />

          <div className="flex flex-wrap items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
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
              {tag.auto_apply ? "Applied automatically" : "Suggest only"}
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
              className="inline-flex items-center gap-1 transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>

            {dirty && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setName(tag.name);
                    setContext(tag.context);
                    setExclusion(tag.exclusion_hint);
                    setKeywords(tag.match_keywords);
                  }}
                  className="inline-flex items-center gap-1 hover:text-foreground"
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
        </div>
      </AccordionContent>
    </AccordionItem>
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
      <SettingsField label={label}>
        <ul className="space-y-1">
          {examples.map((example) => (
            <li key={example} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{example}</span>
              <button
                type="button"
                onClick={() => void remove(kind, example)}
                aria-label={`Forget example: ${example}`}
                className="shrink-0 text-muted-foreground/60 transition-colors hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      </SettingsField>
    );
  }

  return (
    <div className="space-y-3">
      {list("positive", "Notes you confirmed", tag.positive_examples)}
      {list("negative", "Notes you dismissed", tag.negative_examples)}
    </div>
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
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border px-2 py-1.5">
      {keywords.map((keyword) => (
        <span
          key={keyword}
          className="inline-flex items-center gap-1 rounded-md bg-elevated px-1.5 py-[2px] text-xs text-muted-foreground"
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
        placeholder={keywords.length ? "Add word…" : "Enter or comma to add"}
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
        className="min-w-[8rem] flex-1 bg-transparent text-xs text-muted-foreground outline-none"
      />
    </div>
  );
}

/** The eight presets stay as quick picks; the swatch at the end is any colour at all. */
export function ColorChoices({
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
            "h-4 w-4 ring-offset-2 ring-offset-background transition-shadow",
            round ? "rounded-full" : "rounded-sm",
            !custom && tagColorKey(color) === key && "ring-1 ring-border-strong",
          )}
          style={{ backgroundColor: TAG_COLORS[key].accent }}
        />
      ))}
      <label
        className={cn(
          "relative h-4 w-4 cursor-pointer overflow-hidden border border-border ring-offset-2 ring-offset-background",
          round ? "rounded-full" : "rounded-sm",
          custom && "ring-1 ring-border-strong",
        )}
        style={{ backgroundColor: custom ? tagAccent(color) : "transparent" }}
        title={`Custom colour for ${label}`}
      >
        {!custom && (
          <Pipette aria-hidden className="absolute inset-0 m-auto h-2.5 w-2.5 text-muted-foreground" />
        )}
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
