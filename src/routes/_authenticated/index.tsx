import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Pencil, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  cleanupCompleted,
  getFlow,
  organizeMessageFn,
  sendMessage,
  setMessageCompletion,
  updateMessage,
} from "@/lib/flow.functions";
import type { FlowMessage } from "@/lib/flow.server";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Flow — one continuous stream of your thoughts" },
      {
        name: "description",
        content:
          "Send a thought to Flow and it is saved permanently, then quietly tagged and organized in the background.",
      },
      { property: "og:title", content: "Flow — your continuous thought stream" },
      {
        property: "og:description",
        content: "One permanent conversation where everything you send becomes part of your knowledge stream.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FlowPage,
});

type FlowData = { conversationId: string; messages: FlowMessage[] };

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return "Today";
  if (same(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function FlowPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchFlow = useServerFn(getFlow);
  const send = useServerFn(sendMessage);
  const edit = useServerFn(updateMessage);
  const complete = useServerFn(setMessageCompletion);
  const organize = useServerFn(organizeMessageFn);
  const cleanup = useServerFn(cleanupCompleted);

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const { data, isPending } = useQuery<FlowData>({
    queryKey: ["flow"],
    queryFn: () => fetchFlow(),
  });

  useEffect(() => {
    // Retention pass on open: expired completed thoughts are removed for good.
    cleanup()
      .then((result) => {
        if (result.deleted > 0) queryClient.invalidateQueries({ queryKey: ["flow"] });
      })
      .catch(() => {});
  }, [cleanup, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length, isPending]);

  const grouped = useMemo(() => {
    const groups: Array<{ label: string; items: FlowMessage[] }> = [];
    for (const message of data?.messages ?? []) {
      const label = dayLabel(message.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(message);
      else groups.push({ label, items: [message] });
    }
    return groups;
  }, [data?.messages]);

  function patchMessage(id: string, patch: Partial<FlowMessage>) {
    queryClient.setQueryData<FlowData>(["flow"], (current) =>
      current
        ? {
            ...current,
            messages: current.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
          }
        : current,
    );
  }

  async function organizeInBackground(id: string) {
    try {
      const { messages } = await organize({ data: { id } });
      queryClient.setQueryData<FlowData>(["flow"], (current) =>
        current ? { ...current, messages } : current,
      );
    } catch {
      // AI is optional: the thought is already saved and fully usable.
      patchMessage(id, { ai_status: "failed" });
    }
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content) return;
    setDraft("");

    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    queryClient.setQueryData<FlowData>(["flow"], (current) =>
      current
        ? {
            ...current,
            messages: [
              ...current.messages,
              {
                id: tempId,
                content,
                is_completed: false,
                completed_at: null,
                ai_status: "pending",
                created_at: now,
                updated_at: now,
                edited_at: null,
                tags: [],

              },
            ],
          }
        : current,
    );

    try {
      const saved = await send({ data: { content } });
      patchMessage(tempId, saved as unknown as Partial<FlowMessage>);
      void organizeInBackground(saved.id);
    } catch (error) {
      queryClient.setQueryData<FlowData>(["flow"], (current) =>
        current ? { ...current, messages: current.messages.filter((m) => m.id !== tempId) } : current,
      );
      setDraft(content);
      toast.error(error instanceof Error ? error.message : "Could not save that thought");
    }
  }

  async function handleToggleComplete(message: FlowMessage) {
    const next = !message.is_completed;
    patchMessage(message.id, {
      is_completed: next,
      completed_at: next ? new Date().toISOString() : null,
    });
    try {
      await complete({ data: { id: message.id, completed: next } });
    } catch {
      patchMessage(message.id, {
        is_completed: message.is_completed,
        completed_at: message.completed_at,
      });
      toast.error("Could not update that thought");
    }
  }

  async function handleSaveEdit(message: FlowMessage) {
    const content = editDraft.trim();
    setEditingId(null);
    if (!content || content === message.content) return;

    patchMessage(message.id, {
      content,
      ai_status: "pending",
      edited_at: new Date().toISOString(),
    });
    try {
      await edit({ data: { id: message.id, content } });
      void organizeInBackground(message.id);
    } catch {
      patchMessage(message.id, { content: message.content });
      toast.error("Could not save that edit");
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth" });
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border/60 px-6 py-4">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl tracking-tight">Flow</h1>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            everything you send, kept and organized
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to="/settings"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <button
            onClick={handleSignOut}
            className="rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-5 py-8">
          {isPending ? (
            <p className="text-sm text-muted-foreground">Opening your Flow…</p>
          ) : grouped.length === 0 ? (
            <p className="mt-24 text-center text-[15px] leading-relaxed text-muted-foreground">
              This is your one continuous conversation.
              <br />
              Send your first thought below — it stays here forever.
            </p>
          ) : (
            grouped.map((group) => (
              <section key={group.label} className="mb-8">
                <div className="mb-4 text-center text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
                  {group.label}
                </div>
                <div className="space-y-2.5">
                  {group.items.map((message) => (
                    <MessageRow
                      key={message.id}
                      message={message}
                      isEditing={editingId === message.id}
                      editDraft={editDraft}
                      onEditDraft={setEditDraft}
                      onStartEdit={() => {
                        setEditingId(message.id);
                        setEditDraft(message.content);
                      }}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={() => handleSaveEdit(message)}
                      onToggleComplete={() => handleToggleComplete(message)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border/60 bg-background/80 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-end gap-3">
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const el = e.target as HTMLTextAreaElement;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
                if (composerRef.current) composerRef.current.style.height = "auto";
              }
            }}
            rows={1}
            placeholder="What's on your mind?"
            className="max-h-56 flex-1 resize-none rounded-3xl border border-border bg-card px-5 py-3.5 text-[15px] leading-relaxed text-foreground shadow-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-ring focus:shadow-md"
          />
          <button
            onClick={() => void handleSend()}
            disabled={!draft.trim()}
            className="mb-0.5 shrink-0 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageRow({
  message,
  isEditing,
  editDraft,
  onEditDraft,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleComplete,
}: {
  message: FlowMessage;
  isEditing: boolean;
  editDraft: string;
  onEditDraft: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggleComplete: () => void;
}) {
  const edited = Boolean(message.edited_at);

  return (
    <div className="group flex items-start justify-end gap-2">
      <div className="mt-2 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          onClick={onStartEdit}
          aria-label="Edit thought"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onToggleComplete}
          aria-label={message.is_completed ? "Mark as not done" : "Mark as done"}
          className={cn(
            "rounded-full p-1.5 transition-colors hover:bg-secondary",
            message.is_completed ? "text-accent-foreground opacity-100" : "text-muted-foreground",
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        className={cn(
          "max-w-[85%] rounded-3xl rounded-br-lg border px-4 py-3 text-[15px] leading-relaxed shadow-sm transition-colors",
          message.is_completed
            ? "border-transparent bg-secondary/60 text-muted-foreground"
            : "border-border/70 bg-card text-foreground",
        )}
      >
        {isEditing ? (
          <div>
            <textarea
              autoFocus
              value={editDraft}
              onChange={(e) => onEditDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSaveEdit();
                }
                if (e.key === "Escape") onCancelEdit();
              }}
              rows={Math.min(8, editDraft.split("\n").length + 1)}
              className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none"
            />
            <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
              <button onClick={onSaveEdit} className="hover:text-foreground">
                Save
              </button>
              <button onClick={onCancelEdit} className="hover:text-foreground">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className={cn("whitespace-pre-wrap", message.is_completed && "line-through decoration-1")}>
            {message.content}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/80">
          <span>{timeLabel(message.created_at)}</span>
          {edited && <span>· edited</span>}
          {message.is_completed && message.completed_at && (
            <span>· done {timeLabel(message.completed_at)}</span>
          )}
          {message.ai_status === "pending" && (
            <span className="inline-flex items-center gap-1">
              · <Loader2 className="h-3 w-3 animate-spin" /> organizing
            </span>
          )}
          {message.tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground"
            >
              <Sparkles className="h-2.5 w-2.5 opacity-60" />
              {tag.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
