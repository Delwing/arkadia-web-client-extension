import { useEffect, useState } from "react";

/**
 * Subscribes to a CSS media query and re-renders when it starts or stops
 * matching.
 *
 * The footer needs this because its mobile layout is not only CSS: a phone gets
 * its own, far more compact stat rendering, which is a different React tree
 * rather than a restyle of the desktop one. Anything that has to survive a
 * rotation or a resized window has to watch the query rather than read it once.
 *
 * Environments without `matchMedia` (jsdom in a few unit tests) simply never
 * match, so a component falls back to its desktop tree.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
