import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, ImagePlus, Plus, Sparkles, Type, X } from "lucide-react";
import { toast } from "sonner";

import {
  cleanUpNote,
  getCleanupPreference,
  saveTag,
  setCleanupPreference,
} from "@/lib/flow.functions";
import { dragHasFiles, imageFilesFrom } from "@/lib/images";
import { normalizeTag } from "@/lib/tag-normalize";
import { tagAccent } from "@/lib/tag-colors";
import { tagsKey, useTags } from "@/lib/use-tags";
import { useActiveNotepadId } from "@/lib/use-notepad";
import { cn } from "@/lib/utils";
import {
  FlowEditorSurface,
  FlowToolbar,
  insertImageFiles,
  pickImages,
  readTagToken,
  stripTagToken,
  useFlowEditor,
  type TagToken,
} from "./rich-editor";


export type CleanupMeta = { originalHtml: string; cleanedHtml: string } | null;

/**
 * The persistent writing surface. Minimal at rest, grows with the thought, and
 * only reveals formatting once the user is actually writing.
 */
export function Composer({
  onSend,
  replyingTo,
  onCancelReply,
}: {
  onSend: (html: string, cleanup: CleanupMeta, tagIds: string[]) => void;
  replyingTo?: { id: string; preview: string } | null;
  onCancelReply?: () => void;
}) {
  const [isEmpty, setIsEmpty] = useState(true);
  const [focused, setFocused] = useState(false);
  const [pinnedToolbar, setPinnedToolbar] = useState(false);
  const [dropping, setDropping] = useState(false);


  const queryClient = useQueryClient();
  const clean = useServerFn(cleanUpNote);
  const readAlways = useServerFn(getCleanupPreference);
  const writeAlways = useServerFn(setCleanupPreference);

  // The "Always" mode is a composer preference, remembered across sessions.
  const alwaysQuery = useQuery({
    queryKey: ["cleanup-preference"],
    queryFn: () => readAlways({}),
    staleTime: 5 * 60 * 1000,
  });
  const always = alwaysQuery.data?.always ?? false;
  const alwaysMutation = useMutation({
    mutationFn: (next: boolean) => writeAlways({ data: { always: next } }),
    onMutate: (next) => {
      queryClient.setQueryData(["cleanup-preference"], { always: next });
    },
  });

  /** Cleanup state for the note currently being composed. */
  const [cleaning, setCleaning] = useState(false);
  const cleanupRef = useRef<CleanupMeta>(null);

  // Tags typed as #hashtags: collected while writing, applied when the note saves.
  const notepadId = useActiveNotepadId();
  const tags = useTags();
  const createTag = useServerFn(saveTag);
  const [pendingTagIds, setPendingTagIds] = useState<string[]>([]);
  const [token, setToken] = useState<TagToken | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const editor = useFlowEditor({
    autoFocus: true,
    onEmptyChange: setIsEmpty,
    onSubmit: () => void submit(),
    onKeyDown: (event) => handleAutocompleteKey(event),
  });

  // Choosing Reply hands the cursor straight to the composer.
  const replyId = replyingTo?.id ?? null;
  useEffect(() => {
    if (replyId && editor) editor.commands.focus("end");
  }, [replyId, editor]);

  // The caret decides whether the autocomplete is open, so follow every change.
  useEffect(() => {
    if (!editor) return;
    const sync = () => setToken(readTagToken(editor));
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor]);

  const allTags = tags.data ?? [];
  const query = token?.query ?? "";
  const suggestions = useMemo(() => {
    const normalized = normalizeTag(query);
    return allTags
      .filter((tag) => !pendingTagIds.includes(tag.id))
      .filter((tag) => !normalized || normalizeTag(tag.name).includes(normalized))
      .slice(0, 6);
  }, [allTags, pendingTagIds, query]);

  const exactMatch = allTags.some((tag) => normalizeTag(tag.name) === normalizeTag(query));
  const canCreate = query.trim().length > 0 && !exactMatch;
  const optionCount = suggestions.length + (canCreate ? 1 : 0);
  const menuOpen =
    Boolean(token) && dismissed !== `${token?.from}:${query}` && optionCount > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [query, token?.from]);

  /** Applies an existing tag and drops the typed #token from the note body. */
  function applyTag(tagId: string) {
    if (!editor || !token) return;
    stripTagToken(editor, token);
    setToken(null);
    setPendingTagIds((current) => (current.includes(tagId) ? current : [...current, tagId]));
  }

  /** Creates the tag with empty context, then applies it like any other. */
  async function createAndApply(name: string) {
    if (!notepadId || !editor || !token) return;
    const current = token;
    stripTagToken(editor, current);
    setToken(null);
    try {
      const next = await createTag({ data: { notepadId, name: name.trim(), context: "" } });
      queryClient.setQueryData(tagsKey(notepadId), next);
      const created = next.find((tag) => normalizeTag(tag.name) === normalizeTag(name));
      if (created) setPendingTagIds((ids) => [...ids, created.id]);
    } catch {
      toast.error("Couldn’t create that tag");
    }
  }

  function chooseOption(index: number) {
    if (index < suggestions.length) {
      const tag = suggestions[index];
      if (tag) applyTag(tag.id);
      return;
    }
    if (canCreate) void createAndApply(query);
  }

  /** Arrows / Enter / Tab belong to the autocomplete while it's open. */
  function handleAutocompleteKey(event: KeyboardEvent): boolean {
    if (!menuOpen) return false;
    if (event.key === "ArrowDown") {
      setActiveIndex((index) => (index + 1) % optionCount);
      return true;
    }
    if (event.key === "ArrowUp") {
      setActiveIndex((index) => (index - 1 + optionCount) % optionCount);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      chooseOption(activeIndex);
      return true;
    }
    if (event.key === "Escape") {
      setDismissed(`${token?.from}:${query}`);
      return true;
    }
    return false;
  }

  const showToolbar = pinnedToolbar || focused || !isEmpty;

  function reset() {
    if (!editor) return;
    editor.commands.clearContent(true);
    setIsEmpty(true);
    cleanupRef.current = null;
    setPendingTagIds([]);
    setToken(null);
    editor.commands.focus("end");
  }

  /** Runs cleanup on what's in the composer and swaps the text in place. */
  async function runCleanup(): Promise<CleanupMeta> {
    if (!editor || editor.isEmpty || cleaning) return null;
    const before = editor.getHTML();
    setCleaning(true);
    try {
      const result = await clean({ data: { html: before } });
      editor.commands.setContent(result.cleanedHtml);
      setIsEmpty(editor.isEmpty);
      const meta = { originalHtml: before, cleanedHtml: result.cleanedHtml };
      cleanupRef.current = meta;
      return meta;
    } catch {
      // Cleanup is optional: the original text stays exactly as typed.
      toast.error("Couldn’t clean that up — sending your text unchanged");
      return null;
    } finally {
      setCleaning(false);
    }
  }

  /** Saves whatever is currently in the composer. */
  function save(state: CleanupMeta) {
    if (!editor || editor.isEmpty) return;
    const html = editor.getHTML();
    onSend(
      html,
      state ? { originalHtml: state.originalHtml, cleanedHtml: state.cleanedHtml } : null,
      pendingTagIds,
    );
    reset();
  }

  /** Send. With Always on, cleanup runs first and the note sends automatically. */
  async function submit() {
    if (!editor || editor.isEmpty || cleaning) return;
    if (always && !cleanupRef.current) {
      const meta = await runCleanup();
      save(meta);
      return;
    }
    save(cleanupRef.current);
  }

  /** Clean and send in one action, regardless of the Always preference. */
  async function cleanAndSend() {
    if (!editor || editor.isEmpty || cleaning) return;
    const meta = cleanupRef.current ?? (await runCleanup());
    save(meta);
  }

  return (
    <div className="border-t border-border bg-surface/80 backdrop-blur-sm">
      <div className="flow-shell px-5 pb-5 pt-3.5 sm:px-8">
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="h-3.5 w-px shrink-0 bg-border-strong" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              Replying to: “{replyingTo.preview}”
            </span>
            <button
              type="button"
              onClick={onCancelReply}
              aria-label="Cancel reply"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div
          onDragOver={(event) => {
            if (!dragHasFiles(event.dataTransfer)) return;
            event.preventDefault();
            setDropping(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDropping(false);
          }}
          onDrop={(event) => {
            if (!dragHasFiles(event.dataTransfer)) return;
            event.preventDefault();
            setDropping(false);
            const files = imageFilesFrom(event.dataTransfer.files);
            if (!editor) return;
            if (!files.length) {
              toast.error("Only images can be dropped in for now");
              return;
            }
            void insertImageFiles(editor, files);
          }}
          className={cn(
            "relative rounded-xl border border-border bg-background/60 transition-colors duration-200",
            focused && "border-border-strong",
            dropping && "border-primary/70 bg-primary/[0.04]",
          )}
        >
          {dropping && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/70 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <ImagePlus className="h-3.5 w-3.5" />
                Drop images to add them to this note
              </span>
            </div>
          )}


          <div
            className={cn(
              "grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out",
              showToolbar ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="min-h-0">
              {editor && (
                <FlowToolbar editor={editor} className="border-b border-border px-2.5 py-1.5" />
              )}
            </div>
          </div>

          <div
            className="max-h-[45vh] overflow-y-auto px-4 py-3"
            onFocusCapture={() => setFocused(true)}
            onBlurCapture={() => setFocused(false)}
          >
            {editor && (
              <FlowEditorSurface
                editor={editor}
                isEmpty={isEmpty}
                placeholder="Write anything…"
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-1">
            <div className="flex min-w-0 items-center gap-0.5">
              <button
                type="button"
                aria-label="Formatting"
                aria-pressed={pinnedToolbar}
                onClick={() => setPinnedToolbar((value) => !value)}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-foreground",
                  pinnedToolbar && "bg-elevated text-foreground",
                )}
              >
                <Type className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Add image"
                title="Add an image — or drop one in"
                onClick={() => editor && pickImages(editor)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-foreground"
              >
                <ImagePlus className="h-3.5 w-3.5" />
              </button>

            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              {/* One toggle owns the whole model: make cleanup the default send. */}
              <button
                type="button"
                role="switch"
                aria-checked={always}
                aria-label="Clean before sending"
                title="Clean every note with AI before sending"
                onClick={() => alwaysMutation.mutate(!always)}
                className="group inline-flex items-center gap-2 rounded-md text-[11px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                <span className="hidden sm:inline">Clean before sending</span>
                <span className="sm:hidden">Clean</span>
                <span
                  aria-hidden
                  className={cn(
                    "relative h-3.5 w-6 rounded-full transition-colors duration-150",
                    always ? "bg-ai" : "bg-elevated",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-2.5 w-2.5 rounded-full bg-foreground/70 transition-all duration-150",
                      always ? "left-3 bg-background/90" : "left-0.5",
                    )}
                  />
                </span>
              </button>

              <span aria-hidden className="h-4 w-px bg-border" />

              {!always && (
                <button
                  type="button"
                  aria-label="Clean & send"
                  title="Clean & send — clean this note with AI and send it"
                  disabled={isEmpty || cleaning}
                  onClick={() => void cleanAndSend()}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-150",
                    isEmpty || cleaning
                      ? "text-muted-foreground/40"
                      : "text-muted-foreground hover:bg-elevated hover:text-ai",
                  )}
                >
                  <Sparkles className={cn("h-3.5 w-3.5", cleaning && "animate-pulse text-ai")} />
                </button>
              )}

              <button
                type="button"
                aria-label={always ? "Clean & send" : "Send"}
                disabled={isEmpty || cleaning}
                onClick={() => void submit()}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1.5 rounded-full transition-all duration-150",
                  cleaning ? "px-3 bg-ai text-ai-foreground" : "w-8",
                  !cleaning &&
                    (isEmpty
                      ? "bg-elevated text-muted-foreground/50"
                      : always
                        ? "bg-ai text-ai-foreground hover:brightness-110"
                        : "bg-primary text-primary-foreground hover:brightness-110"),
                )}
              >
                {cleaning ? (
                  <>
                    <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                    <span className="text-[11px]">Cleaning &amp; sending…</span>
                  </>
                ) : (
                  <ArrowUp className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
