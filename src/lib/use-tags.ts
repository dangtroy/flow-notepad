import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listTags } from "./flow.functions";

export const TAGS_KEY = ["tags"] as const;

/** One tag list shared by the sidebar, the filter bar, and tag management. */
export function useTags() {
  const fetchTags = useServerFn(listTags);
  return useQuery({ queryKey: TAGS_KEY, queryFn: () => fetchTags() });
}
