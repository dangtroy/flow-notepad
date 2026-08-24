/** Client-safe shapes and rules for the suggested-tag system. */

export type SuggestionKind = "existing_tag" | "new_tag";

/** What a proposed new tag is: drives the label shown on the suggestion. */
export type ConceptKind = "person" | "tool" | "theme" | "project" | "brand" | "other";

export type TagSuggestion = {
  id: string;
  kind: SuggestionKind;
  concept_kind: ConceptKind;
  tag_id: string | null;
  name: string;
  reason: string;
  message_count: number;
  suggested_group_id: string | null;
  suggested_group_name: string | null;
  evidence_count: number;
};

/** How a suggestion should behave in future once accepted. */
export type LearnMode = "auto" | "suggest" | "once";

export const LEARN_MODES: Array<{ value: LearnMode; label: string; hint: string }> = [
  { value: "auto", label: "Always apply", hint: "Flow applies this tag automatically from now on." },
  { value: "suggest", label: "Keep suggesting", hint: "Flow will suggest it, never apply it silently." },
  { value: "once", label: "Only these notes", hint: "Applies now and stays out of future organizing." },
];

/**
 * Suggestions only surface with real evidence: a concept has to keep coming
 * back before Flow asks about it.
 */
export const MIN_EVIDENCE: Record<SuggestionKind, number> = {
  existing_tag: 2,
  // A new tag proposal now surfaces on first sighting: the user always decides,
  // and waiting for three notes made useful concepts arrive too late to matter.
  new_tag: 1,
};
