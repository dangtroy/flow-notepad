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
  const [cleanup, setCleanup] = useState<CleanupMeta>(null);
  const cleanupRef = useRef<CleanupMeta>(null);
  cleanupRef.current = cleanup;

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
    setCleanup(null);
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
      setCleanup(meta);
      cleanupRef.current = meta;
      editor.commands.focus("end");
      return meta;
    } catch {
      // Cleanup is optional: the original text stays exactly as typed.
      toast.error("Couldn’t clean that up — your text is unchanged");
      return null;
    } finally {
      setCleaning(false);
    }
  }

  function undoCleanup() {
    const state = cleanupRef.current;
    if (!editor || !state) return;
    editor.commands.setContent(state.originalHtml);
    setIsEmpty(editor.isEmpty);
    setCleanup(null);
    editor.commands.focus("end");
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

          <div className="flex items-center justify-between gap-2 px-2.5 pb-2 pt-0.5">
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

              {/* AI cleanup: a quiet composer mode, never a big AI button. */}
              <span className="ml-0.5 flex min-w-0 items-center gap-1.5">
                {cleanup && !cleaning ? (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Sparkles className="h-3 w-3" />
                    <span>Cleaned</span>
                    <span aria-hidden className="text-muted-foreground/40">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={undoCleanup}
                      className="transition-colors hover:text-foreground"
                    >
                      Undo
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void runCleanup()}
                    disabled={isEmpty || cleaning}
                    title="Clean up this note with AI"
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-elevated hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
                    )}
                  >
                    <Sparkles className={cn("h-3 w-3", cleaning && "animate-pulse")} />
                    <span>{cleaning ? "Cleaning up…" : "Clean up"}</span>
                  </button>
                )}

                <button
                  type="button"
                  role="switch"
                  aria-checked={always}
                  aria-label="Always clean up before sending"
                  title="Always clean up before sending"
                  onClick={() => alwaysMutation.mutate(!always)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors duration-150 hover:bg-elevated",
                    always ? "text-foreground" : "text-muted-foreground/70 hover:text-foreground",
                  )}
                >
                  <span>Always</span>
                  <span
                    aria-hidden
                    className={cn(
                      "h-2 w-2 rounded-full border transition-colors duration-150",
                      always ? "border-primary bg-primary" : "border-border-strong bg-transparent",
                    )}
                  />
                </button>
              </span>

              <span className="ml-1.5 hidden text-[11px] text-muted-foreground/60 lg:inline">
                Enter to send · Shift+Enter for a new line
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                aria-label="Clean up and send"
                title="Clean up and send"
                disabled={isEmpty || cleaning}
                onClick={() => void cleanAndSend()}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full px-2 text-[11px] transition-colors duration-150",
                  isEmpty || cleaning
                    ? "bg-elevated text-muted-foreground/50"
                    : "bg-elevated text-muted-foreground hover:text-foreground",
                )}
              >
                <Sparkles className={cn("h-3 w-3", cleaning && "animate-pulse")} />
                <ArrowUp className="h-3 w-3" />
              </button>

              <button
                type="button"
                aria-label="Send"
                disabled={isEmpty || cleaning}
                onClick={() => void submit()}
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-150",
                  isEmpty || cleaning
                    ? "bg-elevated text-muted-foreground/50"
                    : "bg-primary text-primary-foreground hover:brightness-110",
                )}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
