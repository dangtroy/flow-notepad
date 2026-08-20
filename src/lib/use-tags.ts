import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listReferenceNotes, listTagGroups, listTags } from "./flow.functions";
import { useActiveNotepadId } from "./use-notepad";

/** Tags and groups are per-notepad, so the notepad id is part of the cache key. */
export const tagsKey = (notepadId: string | null) => ["tags", notepadId ?? "none"] as const;
export const tagGroupsKey = (notepadId: string | null) =>
  ["tag-groups", notepadId ?? "none"] as const;

/** One tag list shared by the sidebar, the filter bar, and tag management. */
export function useTags() {
  const notepadId = useActiveNotepadId();
  const fetchTags = useServerFn(listTags);
  return useQuery({
    queryKey: tagsKey(notepadId),
    queryFn: () => fetchTags({ data: { notepadId } }),
    enabled: Boolean(notepadId),
  });
}

/** Groups are the user's own organizing layer; they load alongside tags. */
export function useTagGroups() {
  const notepadId = useActiveNotepadId();
  const fetchGroups = useServerFn(listTagGroups);
  return useQuery({
    queryKey: tagGroupsKey(notepadId),
    queryFn: () => fetchGroups({ data: { notepadId } }),
    enabled: Boolean(notepadId),
  });
}

/** Reference notes live in their own tag-grouped view, per notepad. */
export const referenceKey = (notepadId: string | null) =>
  ["reference", notepadId ?? "none"] as const;

export function useReferenceNotes() {
  const notepadId = useActiveNotepadId();
  const fetchReference = useServerFn(listReferenceNotes);
  return useQuery({
    queryKey: referenceKey(notepadId),
    queryFn: () => fetchReference({ data: { notepadId } }),
    enabled: Boolean(notepadId),
  });
}
