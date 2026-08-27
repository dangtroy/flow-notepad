import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { PanelLeft } from "lucide-react";

import { CommandMenu, useCommandMenu } from "@/components/flow/command-menu";
import { SidebarBody } from "@/components/flow/sidebar";
import { SettingsDialog } from "@/components/flow/settings/settings-dialog";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NotepadSwitcher } from "@/components/flow/notepad-switcher";
import { NotepadProvider } from "@/lib/use-notepad";
import { SettingsDialogProvider } from "@/lib/use-settings-dialog";
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
  const commandMenu = useCommandMenu();

  return (
    <NotepadProvider>
      <SettingsDialogProvider>
      <CommandMenu open={commandMenu.open} onOpenChange={commandMenu.setOpen} />
      <SettingsDialog />
      <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-[var(--flow-sidebar-width,13.5rem)] shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <SidebarBody />
      </aside>


      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phones get a bare header: one round control per side, nothing else. */}
        <div className="flex items-center gap-2 px-3 py-2 md:hidden">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger
              aria-label="Open navigation"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
            >
              <PanelLeft className="h-4 w-4" />
            </SheetTrigger>
            {/* The sheet's own close button sits top-right, so the header makes room. */}
            <SheetContent
              side="left"
              className="w-[15rem] border-sidebar-border bg-sidebar p-0 [&_[data-sidebar-head]]:pr-11"
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarBody onNavigate={() => setDrawerOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex min-w-0 flex-1 items-center justify-center">
            <NotepadSwitcher onNavigate={() => setDrawerOpen(false)} />
          </div>
          {/* The stream fills this slot with its attention-panel control. */}
          <div id="flow-header-right" className="flex h-9 w-9 shrink-0 items-center justify-end" />
        </div>

        {/* Required: nested routes render here. */}
        <Outlet />
        </div>
      </div>
      </SettingsDialogProvider>
    </NotepadProvider>
  );
}
