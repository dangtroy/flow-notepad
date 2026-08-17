import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { PanelLeft } from "lucide-react";

import { SidebarBody } from "@/components/flow/sidebar";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppShell,
});

function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-[var(--flow-sidebar-width,13.5rem)] shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <SidebarBody />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger
              aria-label="Open navigation"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
            >
              <PanelLeft className="h-4 w-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[15rem] border-sidebar-border bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarBody onNavigate={() => setDrawerOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-display text-lg tracking-tight">Flow</span>
        </div>

        {/* Required: nested routes render here. */}
        <Outlet />
      </div>
    </div>
  );
}
