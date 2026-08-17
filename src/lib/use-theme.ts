import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "flow-theme";

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/**
 * Dark stays the default look; light mode is a remembered preference.
 * Read after hydration so server and client markup always match.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const next: Theme = stored === "light" || stored === "dark" ? stored : "dark";
    setTheme(next);
    apply(next);
  }, []);

  const set = useCallback((next: Theme) => {
    setTheme(next);
    apply(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => set(theme === "dark" ? "light" : "dark"), [set, theme]);

  return { theme, setTheme: set, toggleTheme: toggle };
}
