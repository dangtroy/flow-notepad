import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  cleanupCompleted,
  getStreamPage,
  organizeMessageFn,
  sendMessage,
  setMessageCompletion,
  updateMessage,
} from "@/lib/flow.functions";
import type { FlowMessage } from "@/lib/flow.server";
import { htmlToText } from "@/lib/rich-text";
import { Composer } from "@/components/flow/composer";
import { MessageRow } from "@/components/flow/message";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Flow — one continuous stream of your thoughts" },
      {
        name: "description",
        content:
          "Write anything into Flow: a one-line reminder or a long formatted entry. It's saved instantly and organized quietly afterwards.",
      },
      { property: "og:title", content: "Flow — your continuous thought stream" },
      {
        property: "og:description",
        content: "One permanent conversation where everything you write is kept and organized.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FlowPage,
});

type Page = { conversationId: string; messages: FlowMessage[]; nextCursor: string | null };
type Stream = InfiniteData<Page, string | null>;

const PAGE_SIZE = 40;
const STREAM_KEY = ["stream"] as const;

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

function FlowPage() {
  const queryClient = useQueryClient();
  const fetchPage = useServerFn(getStreamPage);
  const send = useServerFn(sendMessage);
  const edit = useServerFn(updateMessage);
  const complete = useServerFn(setMessageCompletion);
  const organize = useServerFn(organizeMessageFn);
  const cleanup = useServerFn(cleanupCompleted);

  const [editingId, setEditingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<number | null>(null);
  const settledRef = useRef(false);

  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery<
    Page,
    Error,
    Stream,
    typeof STREAM_KEY,
    string | null
  >({
    queryKey: STREAM_KEY,
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchPage({ data: { before: pageParam, limit: PAGE_SIZE } }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  // Pages arrive newest-first; render them oldest-first.
  const messages = useMemo(() => {
    const pages = data?.pages ?? [];
    const flat: FlowMessage[] = [];
    for (let i = pages.length - 1; i >= 0; i--) flat.push(...(pages[i]?.messages ?? []));
    return flat;
  }, [data]);

  /**
   * One continuous stream, but a reply sits directly beneath the thought it
   * answers. Nesting stays visually flat: a thread is a root plus its replies.
   */
  const threaded = useMemo(() => {
    const byId = new Map(messages.map((m) => [m.id, m]));
    const children = new Map<string, FlowMessage[]>();
    const roots: FlowMessage[] = [];
    for (const message of messages) {
      const parentId = message.parent_message_id;
      if (parentId && byId.has(parentId)) {
        const list = children.get(parentId) ?? [];
        list.push(message);
        children.set(parentId, list);
      } else {
        roots.push(message);
      }
    }

    const ordered: Array<{ message: FlowMessage; depth: number; rootAt: string }> = [];
    const walk = (message: FlowMessage, depth: number, rootAt: string) => {
      ordered.push({ message, depth, rootAt });
      for (const child of children.get(message.id) ?? []) walk(child, depth + 1, rootAt);
    };
    for (const root of roots) walk(root, 0, root.created_at);
    return ordered;
  }, [messages]);

  const grouped = useMemo(() => {
    const groups: Array<{ label: string; items: typeof threaded }> = [];
    for (const entry of threaded) {
      const label = dayLabel(entry.rootAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(entry);
      else groups.push({ label, items: [entry] });
    }
    return groups;
  }, [threaded]);


  useEffect(() => {
    // Retention pass on open: expired completed thoughts are removed for good.
    cleanup()
      .then((result) => {
        if (result.deleted > 0) queryClient.invalidateQueries({ queryKey: STREAM_KEY });
      })
      .catch(() => {});
  }, [cleanup, queryClient]);

  // Open where the user left off: at the bottom, without any visible motion.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || isPending) return;
    if (!settledRef.current && messages.length >= 0) {
      element.scrollTop = element.scrollHeight;
      settledRef.current = true;
      return;
    }
    // Older page prepended: keep the reading position exactly where it was.
    if (anchorRef.current !== null) {
      element.scrollTop = element.scrollHeight - anchorRef.current;
      anchorRef.current = null;
    }
  }, [messages, isPending]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element || !hasNextPage || isFetchingNextPage) return;
    if (element.scrollTop < 240) {
      anchorRef.current = element.scrollHeight - element.scrollTop;
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function scrollToBottom() {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }

  const patchStream = useCallback(
    (updater: (messages: FlowMessage[]) => FlowMessage[]) => {
      queryClient.setQueryData<Stream>(STREAM_KEY, (current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page, index) =>
            index === 0 ? { ...page, messages: updater(page.messages) } : page,
          ),
        };
      });
    },
    [queryClient],
  );

  const patchMessage = useCallback(
    (id: string, patch: Partial<FlowMessage>) => {
      queryClient.setQueryData<Stream>(STREAM_KEY, (current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
          })),
        };
      });
    },
    [queryClient],
  );

  async function organizeInBackground(id: string) {
    try {
      const { message } = await organize({ data: { id } });
      if (message) patchMessage(id, message);
    } catch {
      // Organizing is optional: the thought is already saved and fully usable.
      patchMessage(id, { ai_status: "failed" });
    }
  }

  async function handleSend(html: string) {
    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    patchStream((current) => [
      ...current,
      {
        id: tempId,
        content: htmlToText(html),
        content_html: html,
        is_completed: false,
        completed_at: null,
        ai_status: "pending",
        created_at: now,
        updated_at: now,
        edited_at: null,
        tags: [],
      },
    ]);
    requestAnimationFrame(scrollToBottom);

    try {
      const saved = await send({ data: { html } });
      patchMessage(tempId, saved as FlowMessage);
      void organizeInBackground(saved.id);
    } catch (error) {
      patchStream((current) => current.filter((m) => m.id !== tempId));
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

  async function handleSaveEdit(message: FlowMessage, html: string) {
    setEditingId(null);
    if (html === (message.content_html ?? "")) return;

    patchMessage(message.id, {
      content_html: html,
      content: htmlToText(html),
      ai_status: "pending",
      edited_at: new Date().toISOString(),
    });
    try {
      const saved = await edit({ data: { id: message.id, html } });
      patchMessage(message.id, saved as FlowMessage);
      void organizeInBackground(message.id);
    } catch (error) {
      patchMessage(message.id, {
        content_html: message.content_html,
        content: message.content,
        edited_at: message.edited_at,
      });
      toast.error(error instanceof Error ? error.message : "Could not save that edit");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-[46rem] flex-col justify-end px-5 pb-8 pt-8 sm:px-8">
          {hasNextPage && (
            <p className="pb-6 text-center text-[11px] uppercase tracking-[0.16em] text-muted-foreground/45">
              {isFetchingNextPage ? "Loading earlier thoughts…" : "Scroll up for earlier thoughts"}
            </p>
          )}

          {isPending ? (
            <p className="text-[13px] text-muted-foreground">Opening your Flow…</p>
          ) : grouped.length === 0 ? (
            <div className="mt-24 text-center">
              <p className="flow-prose text-muted-foreground">
                This is your one continuous conversation.
                <br />
                Write your first thought below — it stays here.
              </p>
            </div>
          ) : (
            grouped.map((group) => (
              <section key={group.label} className="mb-7">
                <div className="mb-3.5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                    {group.label}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-1">
                  {group.items.map((message) => (
                    <MessageRow
                      key={message.id}
                      message={message}
                      isEditing={editingId === message.id}
                      onStartEdit={() => setEditingId(message.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={(html) => void handleSaveEdit(message, html)}
                      onToggleComplete={() => void handleToggleComplete(message)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <Composer onSend={(html) => void handleSend(html)} />
    </div>
  );
}
