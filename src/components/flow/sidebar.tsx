import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, LogOut, Settings } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Navigation, not a dashboard: one destination now, room for tags later. */
export function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth" });
  }

  const itemClass =
    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-5 pt-5">
        <span className="font-display text-[1.35rem] tracking-tight text-foreground">Flow</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        <Link
          to="/"
          onClick={onNavigate}
          activeOptions={{ exact: true }}
          activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
          className={itemClass}
        >
          <Inbox className="h-3.5 w-3.5" />
          All
        </Link>

        <div className="pt-6">
          <p className="px-2.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/50">
            Tags
          </p>
          <p className="mt-1.5 px-2.5 text-[12px] leading-relaxed text-muted-foreground/45">
            Tags will appear here as your stream grows.
          </p>
        </div>
      </nav>

      <div className="space-y-0.5 border-t border-sidebar-border px-2 py-2">
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
