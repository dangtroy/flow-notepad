import { NotebookPen, Palette, Database, Layers, Tag } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AppearanceSettings } from "@/components/flow/appearance-settings";
import { NotepadsSettings } from "@/components/flow/notepads-settings";
import { useSettingsDialog, type SettingsSection } from "@/lib/use-settings-dialog";
import { cn } from "@/lib/utils";
import { DataSection } from "./data-section";
import { GroupsSection } from "./groups-section";
import { TagsSection } from "./tags-section";

const SECTIONS: Array<{
  value: SettingsSection;
  label: string;
  icon: typeof Tag;
  title: string;
}> = [
  { value: "notepads", label: "Notepads", icon: NotebookPen, title: "Notepads" },
  { value: "tags", label: "Tags", icon: Tag, title: "Tags" },
  { value: "groups", label: "Groups", icon: Layers, title: "Groups" },
  { value: "appearance", label: "Appearance", icon: Palette, title: "Appearance" },
  { value: "data", label: "Data", icon: Database, title: "Data & retention" },
];

/** Settings as a modal with its own section rail — never a page you navigate to. */
export function SettingsDialog() {
  const { open, setOpen, section, setSection } = useSettingsDialog();
  const active = SECTIONS.find((item) => item.value === section) ?? SECTIONS[0]!;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="flex h-[min(88dvh,44rem)] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden border-border bg-background p-0 sm:flex-row"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>

        {/* Section rail: a column on desktop, a scrolling row on phones. */}
        <nav
          className={cn(
            "shrink-0 border-border bg-sidebar",
            "flow-scroll-x flex gap-1 overflow-x-auto border-b p-2 pr-11",
            "sm:w-48 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3 sm:pr-3",
          )}
        >
          <p className="hidden px-2 pb-2 text-[13px] font-medium text-foreground sm:block">
            Settings
          </p>
          {SECTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setSection(item.value)}
              aria-pressed={section === item.value}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                section === item.value
                  ? "bg-accent-quiet text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <h2 className="text-[15px] font-medium tracking-tight text-foreground">{active.title}</h2>
          <div className="mt-3">
            {section === "notepads" && <NotepadsSettings />}
            {section === "tags" && <TagsSection />}
            {section === "groups" && <GroupsSection />}
            {section === "appearance" && <AppearanceSettings />}
            {section === "data" && <DataSection />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
