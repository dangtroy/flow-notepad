import { useEffect, useState } from "react";

/**
 * True on coarse-pointer devices (phones, tablets). Resolved after hydration so
 * the server and the first client render always agree.
 */
export function useIsTouch() {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(hover: none) and (pointer: coarse)");
    const sync = () => setIsTouch(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isTouch;
}
