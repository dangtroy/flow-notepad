import type { FlowTagDetail, FlowTagGroup } from "./flow.server";

export type TagSort = "alphabetical" | "most-used" | "manual";

export const TAG_SORTS: Array<{ value: TagSort; label: string }> = [
  { value: "alphabetical", label: "Alphabetical" },
  { value: "most-used", label: "Most used" },
  { value: "manual", label: "Manual" },
];

export function sortTags(tags: FlowTagDetail[], sort: TagSort): FlowTagDetail[] {
  const list = [...tags];
  if (sort === "alphabetical") {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "most-used") {
    list.sort((a, b) => b.message_count - a.message_count || a.name.localeCompare(b.name));
  } else {
    list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }
  return list;
}

export type TagSection = {
  /** null for the pinned and ungrouped sections. */
  group: FlowTagGroup | null;
  kind: "pinned" | "group" | "ungrouped";
  label: string;
  tags: FlowTagDetail[];
  /** Aggregate of the section's child tags. */
  count: number;
};

/**
 * Sidebar shape: pinned first (regardless of group), then the user's groups in
 * their own order, then everything ungrouped.
 */
export function buildTagSections(
  tags: FlowTagDetail[],
  groups: FlowTagGroup[],
  sort: TagSort,
): TagSection[] {
  const sorted = sortTags(tags, sort);
  const sections: TagSection[] = [];

  const pinned = sorted.filter((tag) => tag.is_pinned);
  if (pinned.length) {
    sections.push({ group: null, kind: "pinned", label: "Pinned", tags: pinned, count: total(pinned) });
  }

  for (const group of [...groups].sort((a, b) => a.sort_order - b.sort_order)) {
    const members = sorted.filter((tag) => tag.group_id === group.id);
    sections.push({
      group,
      kind: "group",
      label: group.name,
      tags: members,
      // Unique messages across the group's tags — never a sum of tag counts.
      count: group.message_count,
    });
  }


  const ungrouped = sorted.filter((tag) => !tag.group_id);
  if (ungrouped.length) {
    sections.push({
      group: null,
      kind: "ungrouped",
      label: "Ungrouped",
      tags: ungrouped,
      count: total(ungrouped),
    });
  }

  return sections;
}

function total(tags: FlowTagDetail[]): number {
  return tags.reduce((sum, tag) => sum + tag.message_count, 0);
}

/** Manual drag result: move `id` to sit before `beforeId` (or at the end). */
export function moveTagWithin(
  ordered: FlowTagDetail[],
  id: string,
  beforeId: string | null,
): string[] {
  const ids = ordered.map((tag) => tag.id).filter((value) => value !== id);
  const index = beforeId ? ids.indexOf(beforeId) : -1;
  if (index === -1) ids.push(id);
  else ids.splice(index, 0, id);
  return ids;
}
