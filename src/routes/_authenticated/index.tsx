import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  cleanupCompleted,
  deleteMessageNow,
  getStreamPage,
  organizeMessageFn,
  sendMessage,
  setMessageCompletion,
  updateMessage,
} from "@/lib/flow.functions";
import type { FlowMessage } from "@/lib/flow.server";
import { htmlToText } from "@/lib/rich-text";
import { tagIdsFrom, type FilterMode } from "@/lib/tag-filter";
import { useAppearance } from "@/lib/use-appearance";
import { TAGS_KEY } from "@/lib/use-tags";
import { Composer } from "@/components/flow/composer";
import { MessageRow } from "@/components/flow/message";


export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tags?: string | undefined; mode?: FilterMode | undefined } => ({
    tags:
      typeof search["tags"] === "string" && search["tags"] ? (search["tags"] as string) : undefined,
    mode: search["mode"] === "and" ? "and" : undefined,
  }),
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
  const search = Route.useSearch();
  const fetchPage = useServerFn(getStreamPage);
  const send = useServerFn(sendMessage);
  const edit = useServerFn(updateMessage);
  const complete = useServerFn(setMessageCompletion);
  const organize = useServerFn(organizeMessageFn);
  const cleanup = useServerFn(cleanupCompleted);
  const destroy = useServerFn(deleteMessageNow);
  const { appearance } = useAppearance();

  

  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; preview: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<number | null>(null);
  const settledRef = useRef(false);

  // The filter is part of the query identity: the same conversation, narrowed.
  const selectedTagIds = useMemo(() => tagIdsFrom(search.tags), [search.tags]);
  const mode: FilterMode = search.mode === "and" ? "and" : "or";
  const isFiltered = selectedTagIds.length > 0;
  const streamKey = useMemo(
    () => ["stream", selectedTagIds.join(","), selectedTagIds.length > 1 ? mode : "or"] as const,
    [selectedTagIds, mode],
  );

  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery<
    Page,
    Error,
    Stream,
    typeof streamKey,
    string | null
  >({
    queryKey: streamKey,
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      fetchPage({
        data: { before: pageParam, limit: PAGE_SIZE, tagIds: selectedTagIds, mode },
      }),
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

  /**
   * Days hold threads; threads hold a root note plus its replies. Grouping this
   * way lets each thread read as one distinct unit without becoming a card.
   */
  type Entry = (typeof threaded)[number];
  const grouped = useMemo(() => {
    const groups: Array<{ label: string; threads: Array<{ id: string; entries: Entry[] }> }> = [];
    for (const entry of threaded) {
      const label = dayLabel(entry.rootAt);
      let group = groups[groups.length - 1];
      if (!group || group.label !== label) {
        group = { label, threads: [] };
        groups.push(group);
      }
      const thread = group.threads[group.threads.length - 1];
      if (entry.depth === 0 || !thread) {
        group.threads.push({ id: entry.message.id, entries: [entry] });
      } else {
        thread.entries.push(entry);
      }
    }
    return groups;
  }, [threaded]);



  useEffect(() => {
    // Retention pass on open: expired completed thoughts are removed for good.
    cleanup()
      .then((result) => {
        if (result.deleted > 0) queryClient.invalidateQueries({ queryKey: ["stream"] });
      })
      .catch(() => {});
  }, [cleanup, queryClient]);

  // A filter change is a new view of the stream: land at the newest again.
  useEffect(() => {
    settledRef.current = false;
    anchorRef.current = null;
  }, [streamKey]);

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
      queryClient.setQueryData<Stream>(streamKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page, index) =>
            index === 0 ? { ...page, messages: updater(page.messages) } : page,
          ),
        };
      });
    },
    [queryClient, streamKey],
  );

  const patchMessage = useCallback(
    (id: string, patch: Partial<FlowMessage>) => {
      queryClient.setQueryData<Stream>(streamKey, (current) => {
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
    [queryClient, streamKey],
  );

  async function organizeInBackground(id: string) {
    try {
      const { message } = await organize({ data: { id } });
      if (message) patchMessage(id, message);
      // New links may have changed tag counts (and may have created a tag).
      void queryClient.invalidateQueries({ queryKey: TAGS_KEY });
    } catch {
      // Organizing is optional: the thought is already saved and fully usable.
      patchMessage(id, { ai_status: "failed" });
    }
  }

  async function handleSend(html: string) {
    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const parentMessageId = replyTo?.id ?? null;
    setReplyTo(null);
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
        parent_message_id: parentMessageId,
        tags: [],
      },
    ]);
    requestAnimationFrame(scrollToBottom);

    try {
      const saved = await send({ data: { html, parentMessageId } });
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

  async function handleDeleteNow(message: FlowMessage) {
    patchStream((current) => current.filter((m) => m.id !== message.id));
    queryClient.setQueryData<Stream>(streamKey, (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              messages: page.messages.filter((m) => m.id !== message.id),
            })),
          }
        : current,
    );
    try {
      await destroy({ data: { id: message.id } });
      void queryClient.invalidateQueries({ queryKey: TAGS_KEY });
      toast.success("Deleted");
    } catch {
      void queryClient.invalidateQueries({ queryKey: ["stream"] });
      toast.error("Could not delete that thought");
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
        <div className="flow-shell flex min-h-full flex-col justify-end px-5 pb-8 pt-8 sm:px-8">
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
                {isFiltered ? (
                  <>
                    Nothing tagged this way yet.
                    <br />
                    Choose All in the sidebar to see your whole stream.
                  </>
                ) : (
                  <>
                    This is your one continuous conversation.
                    <br />
                    Write your first thought below — it stays here.
                  </>
                )}
              </p>
            </div>
          ) : (
            grouped.map((group) => (
              <section key={group.label} className="mb-8 last:mb-0">
                <div className="mb-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                    {group.label}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>

                <div className="flex flex-col">
                  {group.threads.map((thread) => (
                    <div
                      key={thread.id}
                      className="flow-row-stack flow-thread-divider pt-[var(--flow-thread-gap)] first:border-t-0 first:pt-0"
                      style={{ paddingBottom: "var(--flow-thread-gap)" }}
                    >
                      {thread.entries.map(({ message, depth }) => (
                        <MessageRow
                          key={message.id}
                          message={message}
                          depth={depth}
                          isReplyTarget={replyTo?.id === message.id}
                          isEditing={editingId === message.id}
                          onStartEdit={() => setEditingId(message.id)}
                          onCancelEdit={() => setEditingId(null)}
                          onSaveEdit={(html) => void handleSaveEdit(message, html)}
                          showTags={appearance.showTags}
                          showTimestamps={appearance.showTimestamps}
                          showReplyTimestamps={appearance.showReplyTimestamps}
                          tagStyle={appearance.tagStyle}
                          tagPosition={appearance.tagPosition}

                          onToggleComplete={() => void handleToggleComplete(message)}
                          onDeleteNow={() => void handleDeleteNow(message)}
                          onReply={() =>
                            setReplyTo({
                              id: message.id,
                              preview: message.content.slice(0, 120),
                            })
                          }
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <Composer
        onSend={(html) => void handleSend(html)}
        replyingTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />

    </div>
  );
}
