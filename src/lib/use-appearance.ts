import { useCallback, useEffect, useState } from "react";

import {
  APPEARANCE_EVENT,
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  applyAppearance,
  readAppearance,
  resolveTheme,
  type Appearance,
} from "./appearance";

/**
 * One shared source of truth for how Flow looks. Read after hydration so the
 * server and client markup always match, then broadcast so every mounted view
 * (sidebar, stream, settings) stays in sync.
 */
export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    const stored = readAppearance();
    setAppearance(stored);
    applyAppearance(stored);
  }, []);

  useEffect(() => {
    const listener = (event: Event) =>
      setAppearance((event as CustomEvent<Appearance>).detail);
    window.addEventListener(APPEARANCE_EVENT, listener);
    return () => window.removeEventListener(APPEARANCE_EVENT, listener);
  }, []);

  // System theme follows the operating system while it is the chosen mode.
  useEffect(() => {
    if (appearance.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyAppearance(appearance);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [appearance]);

  const update = useCallback((patch: Partial<Appearance>) => {
    const next = { ...readAppearance(), ...patch };
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
    applyAppearance(next);
    window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT, { detail: next }));
  }, []);

  const mode = resolveTheme(appearance.theme);

  return { appearance, update, mode };
}
