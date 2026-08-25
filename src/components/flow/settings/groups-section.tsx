import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteTagGroup, reorderTagGroups, saveTagGroup } from "@/lib/flow.functions";
import type { FlowTagGroup } from "@/lib/flow.server";
import { tagAccent } from "@/lib/tag-colors";
import { tagGroupsKey, tagsKey, useTagGroups, useTags } from "@/lib/use-tags";
import { useActiveNotepadId } from "@/lib/use-notepad";
import { ColorChoices } from "./tags-section";
import { SettingsHint, fieldClass } from "./settings-primitives";

/**
 * Groups are the user's organizing layer over AI-applied tags. Deleting one
 * only removes the grouping — tags and messages are untouched.
 */
export function GroupsSection() {
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
      apply(await persist({ data: { name: newName, notepadId } }));
      setNewName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create that group");
    }
  }

  async function rename(group: FlowTagGroup, name: string) {
    if (!name.trim() || name.trim() === group.name) return;
    try {
      apply(await persist({ data: { id: group.id, name: name.trim(), notepadId } }));
    } catch {
      toast.error("Could not rename that group");
    }
  }

  async function recolor(group: FlowTagGroup, color: string) {
    try {
      apply(await persist({ data: { id: group.id, color, notepadId } }));
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
      apply(await reorder({ data: { ids: next.map((group) => group.id), notepadId } }));
    } catch {
      toast.error("Could not reorder groups");
    }
  }

  async function drop(group: FlowTagGroup) {
    try {
      apply(await remove({ data: { id: group.id, notepadId } }));
    } catch {
      toast.error("Could not delete that group");
    }
  }

  return (
    <div>
      <SettingsHint>
        Tags describe what a note is about. Groups are yours: create one here, then drag tags into it
        from the sidebar. Deleting a group keeps its tags.
      </SettingsHint>

      <form onSubmit={create} className="mt-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New group, e.g. Work"
          className={fieldClass}
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </form>

      <ul className="mt-4 divide-y divide-border border-t border-border">
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
        {list.length === 0 && (
          <li className="py-3 text-sm text-muted-foreground">No groups yet.</li>
        )}
      </ul>
    </div>
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
    <li className="py-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
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
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
          <span className="shrink-0 font-mono text-micro tabular-nums text-ai-muted">{count}</span>
        </div>

        <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
          <ColorChoices
            label={group.name}
            color={group.color}
            shape="square"
            onPick={(color) => void onRecolor(group, color)}
          />
          <button
            type="button"
            onClick={() => void onMove(-1)}
            aria-label={`Move ${group.name} up`}
            className="hover:text-foreground"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void onMove(1)}
            aria-label={`Move ${group.name} down`}
            className="hover:text-foreground"
          >
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
