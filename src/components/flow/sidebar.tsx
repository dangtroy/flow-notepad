import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Inbox,
  LogOut,
  Moon,
  Pin,
  PinOff,
  Settings,
  Sun,
} from "lucide-react";
import { useState } from "react";

import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { clearCompleted, reorderTags, saveTag, saveTagGroup } from "@/lib/flow.functions";
import type { FlowTagDetail } from "@/lib/flow.server";
import { TAGS_KEY, TAG_GROUPS_KEY, useTagGroups, useTags } from "@/lib/use-tags";
import { tagAccent } from "@/lib/tag-colors";
import { tagIdsFrom, tagsParam, toggleTagId } from "@/lib/tag-filter";
import { buildTagSections, moveTagWithin, sortTags, type TagSection } from "@/lib/tag-organization";
import { useAppearance } from "@/lib/use-appearance";

import { cn } from "@/lib/utils";

const itemClass =
  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

/** Navigation, not a dashboard: All, pinned tags, the user's groups, then ungrouped. */
export function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { tags?: string; mode?: "or" | "and" };
  const tags = useTags();
  const groups = useTagGroups();
  const { appearance, update, mode: themeMode } = useAppearance();
  const showTags = appearance.showTags;
  const sort = appearance.tagSort;

  const clearDone = useServerFn(clearCompleted);
  const persistTag = useServerFn(saveTag);
  const persistGroup = useServerFn(saveTagGroup);
  const persistOrder = useServerFn(reorderTags);

  const [dragTagId, setDragTagId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  async function handleClearDone() {
    try {
      const { deleted } = await clearDone();
      void queryClient.invalidateQueries({ queryKey: ["stream"] });
      void queryClient.invalidateQueries({ queryKey: TAGS_KEY });
      toast.success(
        deleted > 0 ? `Cleared ${deleted} done ${deleted === 1 ? "note" : "notes"}` : "Nothing marked done",
      );
    } catch {
      toast.error("Could not clear done notes");
    }
  }

  const selected = tagIdsFrom(search.tags);
  const mode = search.mode === "and" ? "and" : "or";
  const list = tags.data ?? [];
  const sections = buildTagSections(list, groups.data ?? [], sort);

  async function signOut() {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth" });
  }

  function applyTag(id: string) {
    const next = toggleTagId(selected, id);
    onNavigate?.();
    void navigate({
      to: "/",
      search: { tags: tagsParam(next), mode: next.length > 1 ? mode : undefined },
    });
  }

  /** A group filters to any of its child tags — the group itself never tags a note. */
  function applyGroup(section: TagSection) {
    const ids = section.tags.map((tag) => tag.id);
    if (!ids.length) return;
    const same = ids.length === selected.length && ids.every((id) => selected.includes(id));
    onNavigate?.();
    void navigate({
      to: "/",
      search: same ? {} : { tags: tagsParam(ids), mode: undefined },
    });
  }

  async function togglePin(tag: FlowTagDetail) {
    queryClient.setQueryData<FlowTagDetail[]>(TAGS_KEY, (current) =>
      (current ?? []).map((row) => (row.id === tag.id ? { ...row, is_pinned: !row.is_pinned } : row)),
    );
    try {
      queryClient.setQueryData(TAGS_KEY, await persistTag({ data: { id: tag.id, isPinned: !tag.is_pinned } }));
    } catch {
      toast.error("Could not update that tag");
      void queryClient.invalidateQueries({ queryKey: TAGS_KEY });
    }
  }

  async function toggleCollapsed(section: TagSection) {
    if (!section.group) return;
    const next = !section.group.is_collapsed;
    try {
      queryClient.setQueryData(
        TAG_GROUPS_KEY,
        await persistGroup({ data: { id: section.group.id, isCollapsed: next } }),
      );
    } catch {
      toast.error("Could not update that group");
    }
  }

  /** Manual sorting: a drag sets both the order and the group it landed in. */
  async function handleDrop(section: TagSection, beforeId: string | null) {
    const id = dragTagId;
    setDragTagId(null);
    setDropTarget(null);
    if (!id) return;

    const targetGroupId = section.kind === "group" ? (section.group?.id ?? null) : null;
    const dragged = list.find((tag) => tag.id === id);
    if (!dragged) return;

    const membersOfTarget = sortTags(
      list.filter((tag) => (tag.group_id ?? null) === targetGroupId && tag.id !== id),
      sort,
    );
    const ordered = moveTagWithin([...membersOfTarget, dragged], id, beforeId);
    const items = ordered.map((tagId, index) => ({
      id: tagId,
      sortOrder: index,
      ...(tagId === id ? { groupId: targetGroupId } : {}),
    }));

    if (sort !== "manual") update({ tagSort: "manual" });
    try {
      queryClient.setQueryData(TAGS_KEY, await persistOrder({ data: { items } }));
    } catch {
      toast.error("Could not move that tag");
      void queryClient.invalidateQueries({ queryKey: TAGS_KEY });
    }
  }

  function tagRow(tag: FlowTagDetail, section: TagSection) {
    const isActive = selected.includes(tag.id);
    return (
      <div
        key={`${section.kind}-${section.group?.id ?? "none"}-${tag.id}`}
        draggable
        onDragStart={() => setDragTagId(tag.id)}
        onDragEnd={() => {
          setDragTagId(null);
          setDropTarget(null);
        }}
        onDragOver={(event) => {
          if (!dragTagId) return;
          event.preventDefault();
          setDropTarget(tag.id);
        }}
        onDrop={(event) => {
          event.preventDefault();
          void handleDrop(section, tag.id);
        }}
        className={cn(
          "group/tag relative",
          dropTarget === tag.id && dragTagId && "before:absolute before:-top-px before:left-2 before:right-2 before:h-px before:bg-primary",
        )}
      >
        <button
          type="button"
          onClick={() => applyTag(tag.id)}
          aria-pressed={isActive}
          className={cn(
            itemClass,
            "w-full text-left",
            isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
            !tag.is_enabled && "opacity-55",
          )}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: tagAccent(tag.color) }}
          />
          <span className="min-w-0 flex-1 truncate">{tag.name}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground/55 group-hover/tag:hidden">
            {tag.message_count}
          </span>
        </button>
        <button
          type="button"
          onClick={() => void togglePin(tag)}
          aria-label={tag.is_pinned ? `Unpin ${tag.name}` : `Pin ${tag.name}`}
          className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-1 text-muted-foreground/60 hover:text-foreground group-hover/tag:block"
        >
          {tag.is_pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-5 pt-5">
        <span className="font-display text-[1.35rem] tracking-tight text-foreground">Flow</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        <Link
          to="/"
          search={{}}
          onClick={onNavigate}
          activeOptions={{ exact: true, includeSearch: false }}
          className={cn(itemClass, selected.length === 0 && "bg-sidebar-accent text-sidebar-accent-foreground")}
        >
          <Inbox className="h-3.5 w-3.5" />
          All
        </Link>

        {sections.map((section) => {
          const collapsed = section.group?.is_collapsed ?? false;
          return (
            <div
              key={section.kind + (section.group?.id ?? "")}
              className="pt-5"
              onDragOver={(event) => {
                if (dragTagId) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                void handleDrop(section, null);
              }}
            >
              <div className="flex items-center gap-1 px-2.5">
                {section.kind === "group" ? (
                  <button
                    type="button"
                    onClick={() => void toggleCollapsed(section)}
                    aria-label={collapsed ? `Expand ${section.label}` : `Collapse ${section.label}`}
                    className="text-muted-foreground/50 transition-colors hover:text-foreground"
                  >
                    {collapsed ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => section.kind === "group" && applyGroup(section)}
                  disabled={section.kind !== "group"}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/50",
                    section.kind === "group" && "transition-colors hover:text-foreground",
                  )}
                >
                  {section.group?.color ? (
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: tagAccent(section.group.color) }}
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-left">{section.label}</span>
                  {section.kind === "group" && (
                    <span className="shrink-0 tracking-normal">{section.count}</span>
                  )}
                </button>
              </div>

              {!collapsed && (
                <div className="mt-1.5 min-h-[0.5rem] space-y-0.5">
                  {section.tags.map((tag) => tagRow(tag, section))}
                  {section.tags.length === 0 && (
                    <p className="px-2.5 text-[12px] leading-relaxed text-muted-foreground/45">
                      Drag tags here.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {list.length === 0 && (
          <p className="mt-5 px-2.5 text-[12px] leading-relaxed text-muted-foreground/45">
            Tags will appear here as your stream grows.
          </p>
        )}
      </nav>

      <div className="space-y-0.5 border-t border-sidebar-border px-2 py-2">
        <button
          type="button"
          onClick={() => update({ theme: themeMode === "dark" ? "light" : "dark" })}
          className={cn(itemClass, "w-full text-left")}
          aria-label={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {themeMode === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          {themeMode === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <button
          type="button"
          onClick={() => update({ showTags: !showTags, showTimestamps: !showTags })}
          className={cn(itemClass, "w-full text-left")}
          aria-pressed={!showTags}
        >
          {showTags ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showTags ? "Hide tags & timestamps" : "Show tags & timestamps"}
        </button>

        <button
          type="button"
          onClick={() => void handleClearDone()}
          className={cn(itemClass, "w-full text-left")}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Clear done notes
        </button>
        <Link to="/settings" onClick={onNavigate} className={itemClass}>
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Link>
        <button type="button" onClick={signOut} className={cn(itemClass, "w-full text-left")}>
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
