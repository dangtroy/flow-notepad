import { useState } from "react";
import { ChevronDown, Pin, PinOff } from "lucide-react";

import type { FlowMessage } from "@/lib/flow.server";
import { cn } from "@/lib/utils";

/**
 * A slim strip above the stream. Pinned thoughts are never duplicated inline —
 * clicking one jumps to where it actually lives in the conversation.
 */
export function PinnedStrip({
  messages,
  onJump,
  onUnpin,
}: {
  messages: FlowMessage[];
  onJump: (id: string) => void;
  onUnpin: (message: FlowMessage) => void;
}) {
  const [open, setOpen] = useState(false);
  if (messages.length === 0) return null;

  return (
    <div className="border-b border-border bg-surface/60 px-5 backdrop-blur sm:px-8">
      <div className="flow-shell">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2 py-2 text-[11px] tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        >
          <Pin className="h-3 w-3" />
          <span>
            {messages.length} pinned {messages.length === 1 ? "thought" : "thoughts"}
          </span>
          <ChevronDown
            className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")}
          />
        </button>

        {open && (
          <ul className="pb-2">
            {messages.map((message) => (
              <li key={message.id} className="group flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onJump(message.id)}
                  className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-[12px] text-foreground/85 transition-colors hover:bg-elevated hover:text-foreground"
                >
                  {message.content || "Empty note"}
                </button>
                <button
                  type="button"
                  onClick={() => onUnpin(message)}
                  aria-label="Unpin"
                  title="Unpin"
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                >
                  <PinOff className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
