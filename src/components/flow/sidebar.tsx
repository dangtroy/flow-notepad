import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Eye, EyeOff, Inbox, LogOut, Moon, Settings, Sun } from "lucide-react";

import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { clearCompleted } from "@/lib/flow.functions";
import { TAGS_KEY } from "@/lib/use-tags";
import { tagAccent } from "@/lib/tag-colors";
import { tagIdsFrom, tagsParam, toggleTagId } from "@/lib/tag-filter";
import { useShowTags } from "@/lib/use-show-tags";
import { useTags } from "@/lib/use-tags";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

/** Navigation, not a dashboard: All plus the user's own tags as filters. */
export function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { tags?: string; mode?: "or" | "and" };
  const tags = useTags();
  const { theme, toggleTheme } = useTheme();
  const { showTags, toggleTags } = useShowTags();
  const clearDone = useServerFn(clearCompleted);

  async function handleClearDone() {
    try {
      const { deleted } = await clearDone();
      void queryClient.invalidateQueries({ queryKey: ["stream"] });
      void queryClient.invalidateQueries({ queryKey: TAGS_KEY });
      toast.success(deleted > 0 ? `Cleared ${deleted} done ${deleted === 1 ? "note" : "notes"}` : "Nothing marked done");
    } catch {
      toast.error("Could not clear done notes");
    }
  }

  const selected = tagIdsFrom(search.tags);
  const mode = search.mode === "and" ? "and" : "or";

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

  const itemClass =
    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-5 pt-5">
        <span className="font-display text-[1.35rem] tracking-tight text-foreground">Flow</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
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

        <div className="pt-6">
          <p className="px-2.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/50">
            Tags
          </p>

          <div className="mt-1.5 space-y-0.5">
            {(tags.data ?? []).map((tag) => {
              const isActive = selected.includes(tag.id);
              return (
                <button
                  key={tag.id}
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
                  <span className="shrink-0 text-[11px] text-muted-foreground/55">
                    {tag.message_count}
                  </span>
                </button>
              );
            })}

            {tags.data?.length === 0 && (
              <p className="px-2.5 text-[12px] leading-relaxed text-muted-foreground/45">
                Tags will appear here as your stream grows.
              </p>
            )}
          </div>
        </div>
      </nav>

      <div className="space-y-0.5 border-t border-sidebar-border px-2 py-2">
        <button
          type="button"
          onClick={toggleTheme}
          className={cn(itemClass, "w-full text-left")}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <button
          type="button"
          onClick={toggleTags}
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
