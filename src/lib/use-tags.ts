import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listTagGroups, listTags } from "./flow.functions";

export const TAGS_KEY = ["tags"] as const;
export const TAG_GROUPS_KEY = ["tag-groups"] as const;

/** One tag list shared by the sidebar, the filter bar, and tag management. */
export function useTags() {
  const fetchTags = useServerFn(listTags);
  return useQuery({ queryKey: TAGS_KEY, queryFn: () => fetchTags() });
}

/** Groups are the user's own organizing layer; they load alongside tags. */
export function useTagGroups() {
  const fetchGroups = useServerFn(listTagGroups);
  return useQuery({ queryKey: TAG_GROUPS_KEY, queryFn: () => fetchGroups() });
}
