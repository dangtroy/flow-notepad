import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "flow-show-tags";

/**
 * Tags can be hidden entirely so the stream reads as a clean notepad.
 * Read after hydration so server and client markup always match.
 */
export function useShowTags() {
  const [showTags, setShowTags] = useState(true);

  useEffect(() => {
    setShowTags(window.localStorage.getItem(STORAGE_KEY) !== "hidden");
  }, []);

  const set = useCallback((next: boolean) => {
    setShowTags(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "shown" : "hidden");
    window.dispatchEvent(new CustomEvent("flow-show-tags", { detail: next }));
  }, []);

  useEffect(() => {
    const listener = (event: Event) => setShowTags((event as CustomEvent<boolean>).detail);
    window.addEventListener("flow-show-tags", listener);
    return () => window.removeEventListener("flow-show-tags", listener);
  }, []);

  const toggle = useCallback(() => set(!showTags), [set, showTags]);

  return { showTags, setShowTags: set, toggleTags: toggle };
}
