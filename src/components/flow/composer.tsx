import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, Paperclip, Sparkles, Type, X } from "lucide-react";
import { toast } from "sonner";

import { cleanUpNote, getCleanupPreference, setCleanupPreference } from "@/lib/flow.functions";
import { cn } from "@/lib/utils";
import { FlowEditorSurface, FlowToolbar, useFlowEditor } from "./rich-editor";

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
  onSend: (html: string, cleanup: CleanupMeta) => void;
  replyingTo?: { id: string; preview: string } | null;
  onCancelReply?: () => void;
}) {
  const [isEmpty, setIsEmpty] = useState(true);
  const [focused, setFocused] = useState(false);
  const [pinnedToolbar, setPinnedToolbar] = useState(false);

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

  const editor = useFlowEditor({
    autoFocus: true,
    onEmptyChange: setIsEmpty,
    onSubmit: () => void submit(),
  });

  // Choosing Reply hands the cursor straight to the composer.
  const replyId = replyingTo?.id ?? null;
  useEffect(() => {
    if (replyId && editor) editor.commands.focus("end");
  }, [replyId, editor]);

  const showToolbar = pinnedToolbar || focused || !isEmpty;

  function reset() {
    if (!editor) return;
    editor.commands.clearContent(true);
    setIsEmpty(true);
    cleanupRef.current = null;
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
    onSend(html, state ? { originalHtml: state.originalHtml, cleanedHtml: state.cleanedHtml } : null);
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
          className={cn(
            "rounded-xl border border-border bg-background/60 transition-colors duration-200",
            focused && "border-border-strong",
          )}
        >

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
                disabled
                aria-label="Attach (coming soon)"
                title="Attachments coming soon"
                className="inline-flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground/45"
              >
                <Paperclip className="h-3.5 w-3.5" />
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
