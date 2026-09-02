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
  getReminders,
  getStreamPage,
  getTasks,
  getViewCounts,
  getWeekStats,
  organizeMessageFn,
  restoreOriginalMessage,
  addMessageTag,
  removeMessageTag,
  confirmMessageTag,
  acknowledgeTagGraduation,
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
import { useIsTouch } from "@/lib/use-touch";

import { useSettingsDialog } from "@/lib/use-settings-dialog";
import { Composer, type CleanupMeta } from "@/components/flow/composer";
import { MessageRow } from "@/components/flow/message";
import { AttentionRail } from "@/components/flow/attention-rail";
import { STREAM_VIEWS, StreamTopBar, type StreamView } from "@/components/flow/stream-top-bar";
import { ReferenceList } from "@/components/flow/reference-list";
import { TaskList } from "@/components/flow/task-list";
import { ReminderList } from "@/components/flow/reminder-list";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    tags?: string | undefined;
    mode?: FilterMode | undefined;
    view?: StreamView | undefined;
    q?: string | undefined;
    /** Set by the legacy /settings link: opens the settings modal on arrival. */
    settings?: true | undefined;
  } => ({
    tags:
      typeof search["tags"] === "string" && search["tags"] ? (search["tags"] as string) : undefined,
    mode: search["mode"] === "and" ? "and" : undefined,
    // In the URL so a search survives a reload and the back button, and so the
    // command menu can hand one over.
    q: typeof search["q"] === "string" && search["q"] ? (search["q"] as string) : undefined,
    view: STREAM_VIEWS.some((option) => option.value === search["view"])
      ? (search["view"] as StreamView)
      : undefined,
    settings:
      search["settings"] === true || search["settings"] === "true" ? (true as const) : undefined,
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
  const fetchAllReminders = useServerFn(getReminders);
  const changeType = useServerFn(setMessageType);
  const fetchCounts = useServerFn(getViewCounts);
  const fetchWeek = useServerFn(getWeekStats);
  const addTag = useServerFn(addMessageTag);
  const dropTag = useServerFn(removeMessageTag);
  const confirmTag = useServerFn(confirmMessageTag);
  const ackGraduation = useServerFn(acknowledgeTagGraduation);

  const fetchTasks = useServerFn(getTasks);
  const setDue = useServerFn(setTaskDue);
  const navigate = Route.useNavigate();
  const { appearance } = useAppearance();
  const notepadId = useActiveNotepadId();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; preview: string } | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  // Set when a task or reminder row asks for a note the current view can't show.
  const [pendingJumpId, setPendingJumpId] = useState<string | null>(null);
  // Small screens have no room for the rail: it opens as a sheet instead.
  const [panelSheet, setPanelSheet] = useState(false);
  // Phones keep the page to the notes alone: the composer opens as a sheet when
  // the stream is pulled past either end, the way pocket note apps do.
  const isTouch = useIsTouch();
  const [composerSheet, setComposerSheet] = useState(false);
  const [pull, setPull] = useState(0);
  const pullStart = useRef<{ y: number; atTop: boolean; atBottom: boolean } | null>(null);

  // The committed search lives in the URL; the sidebar owns the input.
  const query = search.q ?? "";

  // ?settings=true (from the old /settings path) opens the modal, then clears.
  const { openSettings } = useSettingsDialog();
  useEffect(() => {
    if (!search.settings) return;
    openSettings();
    void navigate({ search: (prev) => ({ ...prev, settings: undefined }), replace: true });
  }, [search.settings, openSettings, navigate]);



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
  const composerWrapRef = useRef<HTMLDivElement>(null);
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
    enabled:
      Boolean(notepadId) && view !== "reference" && view !== "tasks" && view !== "reminders",
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

  // Composer growing (or the mobile keyboard opening) must not hide the newest
  // note: while we're already near the bottom, stay pinned to it.
  useEffect(() => {
    const wrap = composerWrapRef.current;
    const element = scrollRef.current;
    if (!wrap || !element) return;
    const observer = new ResizeObserver(() => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      if (distance < 240) element.scrollTop = element.scrollHeight;
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

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

  /** ✓ on a suggested tag: it stays, and the tag moves a step toward trusted. */
  async function handleConfirmTag(message: FlowMessage, tagId: string) {
    const previous = message.suggestedTagIds;
    patchMessage(message.id, { suggestedTagIds: previous.filter((id) => id !== tagId) });
    try {
      await confirmTag({ data: { messageId: message.id, tagId } });
      void queryClient.invalidateQueries({ queryKey: tagsKey(notepadId) });
    } catch (error) {
      patchMessage(message.id, { suggestedTagIds: previous });
      toast.error(error instanceof Error ? error.message : "Couldn’t keep that tag");
    }
  }

  async function handleAcknowledgeGraduation(tagId: string) {
    try {
      await ackGraduation({ data: { tagId } });
    } finally {
      void queryClient.invalidateQueries({ queryKey: tagsKey(notepadId) });
    }
  }

  async function handleSend(
    html: string,
    cleanup: CleanupMeta,
    tagIds: string[] = [],
    remindAt: string | null = null,
  ) {
    // On phones the composer is a sheet: sending closes it again.
    setComposerSheet(false);

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
        remind_at: remindAt,
        reminder_dismissed_at: null,
        tags: [],
        tentativeTagIds: [],
        suggestedTagIds: [],
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
      // A time written into the note becomes a real reminder on the saved row.
      if (remindAt) {
        try {
          const withReminder = await remind({ data: { id: saved.id, remindAt } });
          patchMessage(saved.id, withReminder as FlowMessage);
        } catch {
          toast.error("Saved — but the reminder couldn’t be set");
        }
      }
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
        type === "reference"
          ? "Kept as reference"
          : type === "pinned"
            ? "Pinned"
            : "Back in stream",
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

    const snapshot = queryClient.getQueryData<Stream>(streamKey);
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
    // The delete is held briefly so it can be taken back: the row is gone from
    // the stream immediately, but nothing is destroyed until the window closes.
    let undone = false;
    const commit = window.setTimeout(() => {
      if (undone) return;
      destroy({ data: { id: message.id } })
        .then(() => {
          refreshPinsAndReminders();
          void queryClient.invalidateQueries({ queryKey: tagsKey(notepadId) });
        })
        .catch(() => {
          void queryClient.invalidateQueries({ queryKey: ["stream"] });
          toast.error("Could not delete that thought");
        });
    }, 6000);

    toast(doomed.size > 1 ? `Deleted ${doomed.size} thoughts` : "Deleted", {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          undone = true;
          window.clearTimeout(commit);
          queryClient.setQueryData<Stream>(streamKey, snapshot);
          toast.success("Restored");
        },
      },
    });
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

  const allRemindersKey = useMemo(() => ["reminders-all", notepadId ?? "none"] as const, [notepadId]);
  const allRemindersQuery = useQuery({
    queryKey: allRemindersKey,
    queryFn: () => fetchAllReminders({ data: { notepadId } }),
    enabled: Boolean(notepadId),
    refetchInterval: 60000,
  });
  const allReminders = allRemindersQuery.data?.messages ?? [];

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
    reminders: allReminders.length,
    pinned: countsData?.pinned ?? 0,
    reference: countsData?.reference ?? 0,
  };

  const pinned = pinnedData?.messages ?? [];
  const dueReminders = dueData?.messages ?? [];

  const refreshPinsAndReminders = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: pinnedKey });
    void queryClient.invalidateQueries({ queryKey: remindersKey });
    void queryClient.invalidateQueries({ queryKey: ["reminders-all"] });
    void queryClient.invalidateQueries({ queryKey: ["view-counts"] });
    void queryClient.invalidateQueries({ queryKey: ["week-stats"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
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

  /**
   * A task or reminder row points at an ordinary note: switch to the stream and
   * flash the note itself, loading it first if the view has to change.
   */
  const openNote = useCallback(
    (id: string) => {
      if (view === "all" || view === "today") {
        jumpToMessage(id);
        return;
      }
      setPendingJumpId(id);
      void navigate({ search: (prev) => ({ ...prev, view: undefined }) });
    },
    [view, jumpToMessage, navigate],
  );

  useEffect(() => {
    if (!pendingJumpId || isPending) return;
    if (view !== "all" && view !== "today") return;
    const timer = window.setTimeout(() => {
      jumpToMessage(pendingJumpId);
      setPendingJumpId(null);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [pendingJumpId, isPending, view, jumpToMessage]);

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

  /**
   * Pull the stream past either end to write. The composer stays out of the way
   * on phones — the page is the notes — and the gesture brings it up.
   */
  function onPullStart(event: React.TouchEvent) {
    const element = scrollRef.current;
    const touch = event.touches[0];
    if (!isTouch || !element || !touch) return;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    pullStart.current = {
      y: touch.clientY,
      atTop: element.scrollTop <= 1,
      atBottom: distanceToBottom <= 1,
    };
  }

  function onPullMove(event: React.TouchEvent) {
    const start = pullStart.current;
    const touch = event.touches[0];
    if (!start || !touch) return;
    const dy = touch.clientY - start.y;
    // Down at the top, or up at the newest note: both reach for the composer.
    const distance = start.atTop && dy > 0 ? dy : start.atBottom && dy < 0 ? -dy : 0;
    setPull(Math.min(110, Math.max(0, distance * 0.55)));
  }

  function onPullEnd() {
    const armed = pull > 44;
    pullStart.current = null;
    setPull(0);
    if (armed) setComposerSheet(true);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {/* min-w-0 keeps a long note from widening the column past the screen. */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <StreamTopBar
          attentionCount={dueReminders.length + pinned.length}
          onOpenPanel={() => setPanelSheet(true)}
        />

        {/* The pull affordance: quiet, and only while the gesture is happening. */}
        {pull > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2"
            style={{ opacity: Math.min(1, pull / 44) }}
          >
            <span className="rounded-full bg-surface/90 px-3 py-1 text-[11px] text-muted-foreground shadow-float">
              {pull > 44 ? "Release to write" : "Pull to write"}
            </span>
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={onScroll}
          onTouchStart={onPullStart}
          onTouchMove={onPullMove}
          onTouchEnd={onPullEnd}
          onTouchCancel={onPullEnd}
          className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        >

          <div
            className={cn(
              "flow-stream flow-shell flex min-h-full min-w-0 flex-col px-4 pt-5 pb-6 sm:px-8 sm:pt-8 sm:pb-8",
              appearance.rowMeta === "hover" && "meta-on-hover",
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
                onOpenNote={(task) => openNote(task.id)}
              />
            ) : view === "reminders" ? (
              <ReminderList
                reminders={allReminders}
                isPending={allRemindersQuery.isPending}
                onOpenNote={(message) => openNote(message.id)}
                onSnooze={(message, iso) => void handleSetReminder(message, iso)}
                onComplete={(message) => void handleCompleteFromReminder(message)}
                onDismiss={(message) => void handleDismissReminder(message)}
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
                  <p className="pb-6 text-center text-[11px] text-muted-foreground/50">
                    {isFetchingNextPage
                      ? "Loading earlier thoughts…"
                      : "Scroll up for earlier thoughts"}
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
                        <>Nothing tagged this way yet.</>
                      ) : (
                        <>Write your first thought below — it stays here.</>
                      )}
                    </p>
                  </div>
                ) : (
                  grouped.map((group) => {
                    return (
                      <section key={group.label} className={cn("mb-6 sm:mb-8", "last:mb-0")}>
                        <div className={"mb-3 flex items-center gap-3 sm:mb-4"}>
                          <span className="h-px flex-1 bg-border" />
                          <span className="text-[11px] font-medium text-muted-foreground/60">
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
                                  onConfirmTag={(tagId) => void handleConfirmTag(message, tagId)}
                                  onAcknowledgeGraduation={(tagId) =>
                                    void handleAcknowledgeGraduation(tagId)
                                  }

                                  onRemoveTag={(tagId) => void handleRemoveTag(message, tagId)}
                                  onSetReminder={(iso) => void handleSetReminder(message, iso)}
                                  onSetType={(type) => void handleSetType(message, type)}
                                  onToggleComplete={() => void handleToggleComplete(message)}
                                  onDeleteNow={() => void handleDeleteNow(message)}
                                  onRestoreOriginal={() => void handleRestoreOriginal(message)}
                                  onReply={() => {
                                    setReplyTo({
                                      id: message.id,
                                      preview: message.content.slice(0, 120),
                                    });
                                    // Touch: the writing sheet has to come up too.
                                    if (isTouch) setComposerSheet(true);
                                  }}

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

        {/* Pointer devices keep the always-there writing surface. */}
        {!isTouch && (
          <div ref={composerWrapRef}>
            <Composer
              onSend={(html, cleanup, tagIds, remindAt) =>
                void handleSend(html, cleanup, tagIds, remindAt)
              }
              replyingTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
            />
          </div>
        )}

        {/* A quiet way in, for anyone who never finds the pull gesture. */}
        {isTouch && !composerSheet && (
          <button
            type="button"
            onClick={() => setComposerSheet(true)}
            aria-label="Write a note"
            className="absolute bottom-5 right-5 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-float transition-colors active:bg-elevated active:text-foreground sm:hidden"
          >
            <Pencil className="h-4 w-4 [stroke-width:1.5]" />
          </button>
        )}
      </div>


      <AttentionRail {...railProps} open={railOpen} onOpenChange={setRailOpen} />

      {/* Same panel, reachable on phones and narrow windows. */}
      <Sheet open={panelSheet} onOpenChange={setPanelSheet}>
        <SheetContent side="right" className="w-[20rem] border-border bg-surface p-0 lg:hidden">
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

      {/* Phones: the writing surface arrives when it's asked for, then leaves. */}
      <Sheet
        open={composerSheet}
        onOpenChange={(open) => {
          setComposerSheet(open);
          if (!open) setReplyTo(null);
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] border-border bg-surface p-0 sm:hidden"
        >
          <SheetTitle className="sr-only">Write a note</SheetTitle>
          <Composer
            focusOnMount
            onSend={(html, cleanup, tagIds, remindAt) =>
              void handleSend(html, cleanup, tagIds, remindAt)
            }
            replyingTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
          />
        </SheetContent>
      </Sheet>

    </div>
  );
}
