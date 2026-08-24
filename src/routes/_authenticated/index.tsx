import { createFileRoute } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  cleanupCompleted,
  deleteMessageNow,
  dismissReminder,
  getDueReminders,
  getPinnedMessages,
  getStreamPage,
  getTasks,
  getViewCounts,
  getWeekStats,
  organizeMessageFn,
  restoreOriginalMessage,
  addMessageTag,
  removeMessageTag,
  sendMessage,
  setMessageCompletion,
  setMessageReminder,
  setMessageType,
  setTaskDue,
  updateMessage,
} from "@/lib/flow.functions";
import type { FlowMessage, MessageType } from "@/lib/flow.server";
import type { FlowTask } from "@/lib/tasks.server";
import { htmlToText } from "@/lib/rich-text";
import { tagIdsFrom, type FilterMode } from "@/lib/tag-filter";
import { useAppearance } from "@/lib/use-appearance";
import { referenceKey, tagsKey, useReferenceNotes } from "@/lib/use-tags";
import { useActiveNotepadId } from "@/lib/use-notepad";
import { Composer, type CleanupMeta } from "@/components/flow/composer";
import { MessageRow } from "@/components/flow/message";
import { AttentionRail } from "@/components/flow/attention-rail";
import {
  STREAM_VIEWS,
  StreamTopBar,
  type StreamView,
} from "@/components/flow/stream-top-bar";
import { ReferenceList } from "@/components/flow/reference-list";
import { TaskList } from "@/components/flow/task-list";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    tags?: string | undefined;
    mode?: FilterMode | undefined;
    view?: StreamView | undefined;
  } => ({
    tags:
      typeof search["tags"] === "string" && search["tags"] ? (search["tags"] as string) : undefined,
    mode: search["mode"] === "and" ? "and" : undefined,
    view: STREAM_VIEWS.some((option) => option.value === search["view"])
      ? (search["view"] as StreamView)
      : undefined,
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

type Page = { notepadId: string; messages: FlowMessage[]; nextCursor: string | null };
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
  const restoreOriginal = useServerFn(restoreOriginalMessage);
  const remind = useServerFn(setMessageReminder);
  const dismiss = useServerFn(dismissReminder);
  const fetchPinned = useServerFn(getPinnedMessages);
  const fetchDue = useServerFn(getDueReminders);
  const changeType = useServerFn(setMessageType);
  const fetchCounts = useServerFn(getViewCounts);
  const fetchWeek = useServerFn(getWeekStats);
  const addTag = useServerFn(addMessageTag);
  const dropTag = useServerFn(removeMessageTag);
  const fetchTasks = useServerFn(getTasks);
  const setDue = useServerFn(setTaskDue);
  const navigate = Route.useNavigate();
  const { appearance } = useAppearance();
  const notepadId = useActiveNotepadId();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; preview: string } | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  // Small screens have no room for the rail: it opens as a sheet instead.
  const [panelSheet, setPanelSheet] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");

  // Debounced: typing never refetches on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  // Four views over the same notepad: All, Today, Pinned, and Reference.
  const view: StreamView = search.view ?? "all";
  const reference = useReferenceNotes();

  /** Local midnight, computed client-side: the server has no timezone. */
  const todaySince = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<number | null>(null);
  const settledRef = useRef(false);

  // The filter is part of the query identity: the same conversation, narrowed.
  const selectedTagIds = useMemo(() => tagIdsFrom(search.tags), [search.tags]);
  const mode: FilterMode = search.mode === "and" ? "and" : "or";
  const isFiltered = selectedTagIds.length > 0;
  // Each notepad is its own stream: switching never mixes two conversations.
  const streamKey = useMemo(
    () =>
      [
        "stream",
        notepadId ?? "none",
        selectedTagIds.join(","),
        selectedTagIds.length > 1 ? mode : "or",
        view,
        query,
      ] as const,
    [notepadId, selectedTagIds, mode, view, query],
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
        data: {
          notepadId,
          before: pageParam,
          limit: PAGE_SIZE,
          tagIds: selectedTagIds,
          mode,
          query: query || null,
          since: view === "today" ? todaySince : null,
          pinnedOnly: view === "pinned",
        },
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(notepadId) && view !== "reference",
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

  /** Lets a reply show how long after its parent it actually landed. */
  const createdAtById = useMemo(() => {
    const map = new Map<string, string>();
    for (const message of messages) map.set(message.id, message.created_at);
    return map;
  }, [messages]);

  useEffect(() => {
    // Retention pass on open: expired completed thoughts are removed for good.
    if (!notepadId) return;
    cleanup({ data: { notepadId } })
      .then((result) => {
        if (result.deleted > 0) queryClient.invalidateQueries({ queryKey: ["stream"] });
      })
      .catch(() => {});
  }, [cleanup, queryClient, notepadId]);

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
    if (!element) return;
    if (!hasNextPage || isFetchingNextPage) return;
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
      void queryClient.invalidateQueries({ queryKey: tagsKey(notepadId) });
    } catch {
      // Organizing is optional: the thought is already saved and fully usable.
      patchMessage(id, { ai_status: "failed" });
    }
  }

  /** Applies composer #tags as source 'user' so later AI passes leave them alone. */
  async function applyComposerTags(messageId: string, tagIds: string[]) {
    if (!tagIds.length) return;
    try {
      for (const tagId of tagIds) await addTag({ data: { messageId, tagId } });
    } catch {
      toast.error("Couldn’t apply one of those tags");
    }
  }

  /** Manual tagging from a note's tag row. */
  async function handleAddTag(message: FlowMessage, tagId: string) {
    if (message.tags.some((tag) => tag.id === tagId)) return;
    try {
      const { tag } = await addTag({ data: { messageId: message.id, tagId } });
      patchMessage(message.id, { tags: [...message.tags, tag] });
      void queryClient.invalidateQueries({ queryKey: tagsKey(notepadId) });
      void queryClient.invalidateQueries({ queryKey: referenceKey(notepadId) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t add that tag");
    }
  }

  async function handleRemoveTag(message: FlowMessage, tagId: string) {
    const previous = message.tags;
    patchMessage(message.id, { tags: previous.filter((tag) => tag.id !== tagId) });
    try {
      await dropTag({ data: { messageId: message.id, tagId } });
      void queryClient.invalidateQueries({ queryKey: tagsKey(notepadId) });
      void queryClient.invalidateQueries({ queryKey: referenceKey(notepadId) });
    } catch (error) {
      patchMessage(message.id, { tags: previous });
      toast.error(error instanceof Error ? error.message : "Couldn’t remove that tag");
    }
  }

  async function handleSend(html: string, cleanup: CleanupMeta, tagIds: string[] = []) {
    // Sending while the Reference view is open keeps the note there.
    if (view === "reference") {
      try {
        const saved = await send({
          data: {
            html,
            notepadId,
            type: "reference",
            originalHtml: cleanup?.originalHtml ?? null,
            cleanedHtml: cleanup?.cleanedHtml ?? null,
          },
        });
        await applyComposerTags(saved.id, tagIds);
        void queryClient.invalidateQueries({ queryKey: referenceKey(notepadId) });
        void organizeInBackground(saved.id).then(() =>
          queryClient.invalidateQueries({ queryKey: referenceKey(notepadId) }),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save that thought");
      }
      return;
    }

    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const parentMessageId = replyTo?.id ?? null;
    setReplyTo(null);
    patchStream((current) => [
      ...current,
      {
        id: tempId,
        type: "stream",
        content: htmlToText(html),
        content_html: html,
        is_completed: false,
        completed_at: null,
        ai_status: "pending",
        created_at: now,
        updated_at: now,
        edited_at: null,
        parent_message_id: parentMessageId,
        ai_cleaned: Boolean(cleanup),
        original_content: cleanup ? htmlToText(cleanup.originalHtml) : null,
        original_content_html: cleanup?.originalHtml ?? null,
        is_pinned: false,
        pinned_at: null,
        remind_at: null,
        reminder_dismissed_at: null,
        tags: [],
      },
    ]);
    requestAnimationFrame(scrollToBottom);

    try {
      const saved = await send({
        data: {
          html,
          parentMessageId,
          notepadId,
          originalHtml: cleanup?.originalHtml ?? null,
          cleanedHtml: cleanup?.cleanedHtml ?? null,
        },
      });
      patchMessage(tempId, saved as FlowMessage);
      refreshPinsAndReminders();
      await applyComposerTags(saved.id, tagIds);
      void organizeInBackground(saved.id);
    } catch (error) {
      patchStream((current) => current.filter((m) => m.id !== tempId));
      toast.error(error instanceof Error ? error.message : "Could not save that thought");
    }
  }

  /** Reference notes live outside the stream cache, so they refetch on change. */
  async function handleSaveReferenceEdit(id: string, html: string) {
    try {
      await edit({ data: { id, html } });
      void queryClient.invalidateQueries({ queryKey: referenceKey(notepadId) });
      void organizeInBackground(id).then(() =>
        queryClient.invalidateQueries({ queryKey: referenceKey(notepadId) }),
      );
    } catch {
      toast.error("Could not save that note");
    }
  }

  async function handleReferenceType(id: string, type: MessageType) {
    try {
      await changeType({ data: { id, type } });
      void queryClient.invalidateQueries({ queryKey: referenceKey(notepadId) });
      void queryClient.invalidateQueries({ queryKey: streamKey });
      toast.success("Moved back to your stream");
    } catch {
      toast.error("Could not move that note");
    }
  }

  async function handleReferenceDelete(id: string) {
    try {
      await destroy({ data: { id } });
      void queryClient.invalidateQueries({ queryKey: referenceKey(notepadId) });
      void queryClient.invalidateQueries({ queryKey: tagsKey(notepadId) });
    } catch {
      toast.error("Could not remove that note");
    }
  }

  /** Promotes a note between the stream, pinned, and reference kinds. */
  async function handleSetType(message: FlowMessage, type: MessageType) {
    const previous = message.type;
    patchMessage(message.id, { type });
    try {
      const saved = await changeType({ data: { id: message.id, type } });
      patchMessage(message.id, saved as FlowMessage);
      refreshPinsAndReminders();
      if (type === "reference" || previous === "reference") {
        void queryClient.invalidateQueries({ queryKey: referenceKey(notepadId) });
        void queryClient.invalidateQueries({ queryKey: streamKey });
      }
      toast.success(
        type === "reference" ? "Kept as reference" : type === "pinned" ? "Pinned" : "Back in stream",
      );
    } catch {
      patchMessage(message.id, { type: previous });
      toast.error("Could not change that note");
    }
  }

  /** Puts a cleaned note back to exactly what was typed. Tags stay as they are. */
  async function handleRestoreOriginal(message: FlowMessage) {
    try {
      const saved = await restoreOriginal({ data: { id: message.id } });
      patchMessage(message.id, saved as FlowMessage);
    } catch {
      toast.error("Could not restore the original text");
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

  /** Deleting a thought takes its replies with it — a reply can't outlive its parent. */
  async function handleDeleteNow(message: FlowMessage) {
    const doomed = new Set([message.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const candidate of messages) {
        const parentId = candidate.parent_message_id;
        if (parentId && doomed.has(parentId) && !doomed.has(candidate.id)) {
          doomed.add(candidate.id);
          grew = true;
        }
      }
    }

    queryClient.setQueryData<Stream>(streamKey, (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              messages: page.messages.filter((m) => !doomed.has(m.id)),
            })),
          }
        : current,
    );
    try {
      await destroy({ data: { id: message.id } });
      refreshPinsAndReminders();
      void queryClient.invalidateQueries({ queryKey: tagsKey(notepadId) });
      toast.success(doomed.size > 1 ? `Deleted ${doomed.size} thoughts` : "Deleted");
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

  const pinnedKey = useMemo(() => ["pinned", notepadId ?? "none"] as const, [notepadId]);
  const remindersKey = useMemo(() => ["reminders", notepadId ?? "none"] as const, [notepadId]);

  const { data: pinnedData } = useQuery({
    queryKey: pinnedKey,
    queryFn: () => fetchPinned({ data: { notepadId } }),
    enabled: Boolean(notepadId),
  });

  // Reminders are in-app only: a light poll is enough to raise them on time.
  const { data: dueData } = useQuery({
    queryKey: remindersKey,
    queryFn: () => fetchDue({ data: { notepadId } }),
    enabled: Boolean(notepadId),
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const countsKey = useMemo(
    () => ["view-counts", notepadId ?? "none", todaySince] as const,
    [notepadId, todaySince],
  );
  const { data: countsData } = useQuery({
    queryKey: countsKey,
    queryFn: () => fetchCounts({ data: { notepadId, since: todaySince } }),
    enabled: Boolean(notepadId),
  });
  const { data: weekData } = useQuery({
    queryKey: ["week-stats", notepadId ?? "none"] as const,
    queryFn: () => fetchWeek({ data: { notepadId } }),
    enabled: Boolean(notepadId),
  });

  const tasksKey = useMemo(() => ["tasks", notepadId ?? "none"] as const, [notepadId]);
  const tasksQuery = useQuery({
    queryKey: tasksKey,
    queryFn: () => fetchTasks({ data: { notepadId } }),
    enabled: Boolean(notepadId),
  });
  const allTasks = tasksQuery.data?.tasks ?? [];

  const tasks = useMemo(() => {
    if (!query) return allTasks;
    const needle = query.toLowerCase();
    return allTasks.filter(
      (task) =>
        task.content.toLowerCase().includes(needle) ||
        (task.label ?? "").toLowerCase().includes(needle) ||
        task.tags.some((tag) => tag.name.toLowerCase().includes(needle)),
    );
  }, [allTasks, query]);

  const refreshTasks = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: tasksKey });
  }, [queryClient, tasksKey]);

  async function handleTaskComplete(task: FlowTask) {
    try {
      await complete({ data: { id: task.id, completed: !task.is_completed } });
    } catch {
      toast.error("Could not update that task");
    }
    refreshTasks();
    refreshPinsAndReminders();
  }

  async function handleTaskDue(task: FlowTask, iso: string | null) {
    try {
      await setDue({ data: { id: task.id, dueAt: iso } });
      toast.success(iso ? "Due date set" : "Due date cleared");
    } catch {
      toast.error("Could not set that date");
    }
    refreshTasks();
  }

  /** Un-tasking is just removing the Tasks-group tags the note carries. */
  async function handleRemoveTask(task: FlowTask) {
    try {
      for (const tagId of task.taskTagIds) {
        await dropTag({ data: { messageId: task.id, tagId } });
      }
      toast.success("No longer a task");
    } catch {
      toast.error("Could not update that note");
    }
    refreshTasks();
    void queryClient.invalidateQueries({ queryKey: tagsKey(notepadId) });
  }

  const counts: Record<StreamView, number> = {
    all: countsData?.all ?? 0,
    today: countsData?.today ?? 0,
    tasks: allTasks.filter((task) => !task.is_completed).length,
    pinned: countsData?.pinned ?? 0,
    reference: countsData?.reference ?? 0,
  };

  const pinned = pinnedData?.messages ?? [];
  const dueReminders = dueData?.messages ?? [];

  const refreshPinsAndReminders = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: pinnedKey });
    void queryClient.invalidateQueries({ queryKey: remindersKey });
    void queryClient.invalidateQueries({ queryKey: ["view-counts"] });
    void queryClient.invalidateQueries({ queryKey: ["week-stats"] });
  }, [queryClient, pinnedKey, remindersKey]);

  /** Jumps to where a pinned or reminded thought actually lives in the stream. */
  const jumpToMessage = useCallback((id: string) => {
    const element = document.querySelector(`[data-message-id="${id}"]`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("flow-flash");
      window.setTimeout(() => element.classList.remove("flow-flash"), 1200);
    } else {
      toast("That thought is further back — scroll up to load it.");
    }
  }, []);

  async function handleSetReminder(message: FlowMessage, iso: string | null) {
    patchMessage(message.id, { remind_at: iso, reminder_dismissed_at: null });
    try {
      await remind({ data: { id: message.id, remindAt: iso } });
      refreshPinsAndReminders();
      toast.success(iso ? "Reminder set" : "Reminder removed");
    } catch {
      patchMessage(message.id, {
        remind_at: message.remind_at,
        reminder_dismissed_at: message.reminder_dismissed_at,
      });
      toast.error("Could not set that reminder");
    }
  }

  async function handleDismissReminder(message: FlowMessage) {
    patchMessage(message.id, { reminder_dismissed_at: new Date().toISOString() });
    try {
      await dismiss({ data: { id: message.id } });
    } catch {
      toast.error("Could not dismiss that reminder");
    }
    refreshPinsAndReminders();
  }

  async function handleCompleteFromReminder(message: FlowMessage) {
    await handleToggleComplete(message);
    await handleDismissReminder(message);
  }

  const referenceNotes = useMemo(() => {
    const notes = reference.data?.messages ?? [];
    if (!query) return notes;
    const needle = query.toLowerCase();
    return notes.filter(
      (note) =>
        note.content.toLowerCase().includes(needle) ||
        note.tags.some((tag) => tag.name.toLowerCase().includes(needle)),
    );
  }, [reference.data, query]);

  /** One set of panel handlers, shared by the rail and its small-screen sheet. */
  const railProps = {
    reminders: dueReminders,
    pinned,
    stats: {
      captured: weekData?.captured ?? 0,
      completed: weekData?.completed ?? 0,
      references: counts.reference,
    },
    onSnooze: (message: FlowMessage, iso: string) => void handleSetReminder(message, iso),
    onComplete: (message: FlowMessage) => void handleCompleteFromReminder(message),
    onDismiss: (message: FlowMessage) => void handleDismissReminder(message),
    onUnpin: (message: FlowMessage) => void handleSetType(message, "stream"),
    onJump: jumpToMessage,
  };


  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {/* min-w-0 keeps a long note from widening the column past the screen. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">

        <StreamTopBar
          view={view}
          onViewChange={(next) =>
            void navigate({
              search: (prev) => ({ ...prev, view: next === "all" ? undefined : next }),
            })
          }
          counts={counts}
          query={queryInput}
          onQueryChange={setQueryInput}
          attentionCount={dueReminders.length + pinned.length}
          onOpenPanel={() => setPanelSheet(true)}
        />

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto overscroll-contain"
      >
        <div
          className={cn(
            "flow-stream flow-shell flex min-h-full flex-col px-5 pb-8 pt-8 sm:px-8",
            appearance.alwaysShowDetails && "always-show",
            // Only the live stream reads bottom-up; the saved views are lists.
            view === "all" || view === "today" ? "justify-end" : "justify-start",
          )}
        >
          {view === "tasks" ? (
            <TaskList
              tasks={tasks}
              isPending={tasksQuery.isPending}
              onToggleComplete={(task) => void handleTaskComplete(task)}
              onSetDue={(task, iso) => void handleTaskDue(task, iso)}
              onRemoveTask={(task) => void handleRemoveTask(task)}
            />
          ) : view === "reference" ? (
            <ReferenceList
              notes={referenceNotes}
              isPending={reference.isPending}
              onSaveEdit={(id, html) => void handleSaveReferenceEdit(id, html)}
              onMoveToStream={(id) => void handleReferenceType(id, "stream")}
              onDelete={(id) => void handleReferenceDelete(id)}
            />
          ) : (
          <>
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
                {query ? (
                  <>No notes match &ldquo;{query}&rdquo; in this view.</>
                ) : view === "today" ? (
                  <>Nothing written today yet.</>
                ) : view === "pinned" ? (
                  <>Nothing pinned yet.</>
                ) : isFiltered ? (
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
            grouped.map((group) => {
              return (
                <section
                  key={group.label}
                  className={cn("mb-8", "last:mb-0")}
                >
                  <div className={"mb-4 flex items-center gap-3"}>
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
                            parentCreatedAt={
                              message.parent_message_id
                                ? createdAtById.get(message.parent_message_id)
                                : undefined
                            }

                            onAddTag={(tagId) => void handleAddTag(message, tagId)}
                            onRemoveTag={(tagId) => void handleRemoveTag(message, tagId)}
                            onSetReminder={(iso) => void handleSetReminder(message, iso)}
                            onSetType={(type) => void handleSetType(message, type)}
                            onToggleComplete={() => void handleToggleComplete(message)}
                            onDeleteNow={() => void handleDeleteNow(message)}
                            onRestoreOriginal={() => void handleRestoreOriginal(message)}
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
              );
            })
          )}
          </>
          )}
        </div>
      </div>

        <Composer
          onSend={(html, cleanup, tagIds) => void handleSend(html, cleanup, tagIds)}
          replyingTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>

      <AttentionRail {...railProps} open={railOpen} onOpenChange={setRailOpen} />

      {/* Same panel, reachable on phones and narrow windows. */}
      <Sheet open={panelSheet} onOpenChange={setPanelSheet}>
        <SheetContent
          side="right"
          className="w-[20rem] border-border bg-surface p-0 lg:hidden"
        >
          <SheetTitle className="sr-only">Needs attention</SheetTitle>
          <AttentionRail
            {...railProps}
            embedded
            open
            onOpenChange={() => setPanelSheet(false)}
            onJump={(id) => {
              setPanelSheet(false);
              jumpToMessage(id);
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
