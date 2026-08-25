import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Settings is a modal, not a page: it opens over the stream so you never lose
 * your place. One tiny context so the sidebar (and the legacy /settings link)
 * can open it from anywhere in the shell.
 */
export type SettingsSection = "notepads" | "tags" | "groups" | "appearance" | "data";

type SettingsDialogValue = {
  open: boolean;
  section: SettingsSection;
  openSettings: (section?: SettingsSection) => void;
  setSection: (section: SettingsSection) => void;
  setOpen: (open: boolean) => void;
};

const SettingsDialogContext = createContext<SettingsDialogValue | null>(null);

export function SettingsDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection>("notepads");

  const openSettings = useCallback((next?: SettingsSection) => {
    if (next) setSection(next);
    setOpen(true);
  }, []);

  const value = useMemo(
    () => ({ open, section, openSettings, setSection, setOpen }),
    [open, section, openSettings],
  );

  return (
    <SettingsDialogContext.Provider value={value}>{children}</SettingsDialogContext.Provider>
  );
}

export function useSettingsDialog(): SettingsDialogValue {
  const value = useContext(SettingsDialogContext);
  if (!value) throw new Error("useSettingsDialog must be used inside SettingsDialogProvider");
  return value;
}
