import { useState } from "react";
import { ArrowUp, Paperclip, Type, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { FlowEditorSurface, FlowToolbar, useFlowEditor } from "./rich-editor";

/**
 * The persistent writing surface. Minimal at rest, grows with the thought, and
 * only reveals formatting once the user is actually writing.
 */
export function Composer({
  onSend,
  replyingTo,
  onCancelReply,
}: {
  onSend: (html: string) => void;
  replyingTo?: { id: string; preview: string } | null;
  onCancelReply?: () => void;
}) {
  const [isEmpty, setIsEmpty] = useState(true);
  const [focused, setFocused] = useState(false);
  const [pinnedToolbar, setPinnedToolbar] = useState(false);

  const editor = useFlowEditor({
    autoFocus: true,
    onEmptyChange: setIsEmpty,
    onSubmit: (html) => {
      onSend(html);
      editor?.commands.clearContent(true);
      setIsEmpty(true);
      editor?.commands.focus("end");
    },
  });

  const showToolbar = pinnedToolbar || focused || !isEmpty;

  return (
    <div className="border-t border-border bg-surface/80 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[46rem] px-5 pb-5 pt-3.5 sm:px-8">
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
            <div className="flex items-center gap-0.5">
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
              <span className="ml-1.5 hidden text-[11px] text-muted-foreground/60 sm:inline">
                Enter to send · Shift+Enter for a new line
              </span>
            </div>

            <button
              type="button"
              aria-label="Send"
              disabled={isEmpty}
              onClick={() => {
                if (!editor || editor.isEmpty) return;
                onSend(editor.getHTML());
                editor.commands.clearContent(true);
                setIsEmpty(true);
                editor.commands.focus("end");
              }}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150",
                isEmpty
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
  );
}
