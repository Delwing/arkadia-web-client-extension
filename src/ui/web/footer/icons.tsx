import type { ReactNode } from "react";

/**
 * Footer-chip glyphs, inlined on a 0-20 grid at a 1.5 hairline.
 *
 * These are self-contained (each `ChipIcon` renders its own `<svg>`) rather than
 * `<use href="#id">` references into an SVG symbol library, so the shared chips
 * render identically in any host — the forge HUD, the stock footer, a test —
 * without that host having to seed a symbol sheet first.
 */
const PATHS: Record<string, ReactNode> = {
  lamp: (
    <>
      <path d="M10 3c1.6 2.4 3 3.4 3 5.6a3 3 0 0 1-6 0c0-1.2.6-2.1 1.3-2.9" />
      <path d="M8 16.5h4" />
    </>
  ),
  wheel: (
    <>
      {/* spoked wagon wheel: rim, 8 spokes, solid hub masking the crossing */}
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3v14M3 10h14M5.05 5.05l9.9 9.9M14.95 5.05l-9.9 9.9" />
      <circle cx="10" cy="10" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  sword: (
    <>
      <path d="M10 2.5V12" />
      <path d="M6.8 12h6.4" />
      <path d="M10 12v4.4" />
      <path d="M8.3 16.6h3.4" />
    </>
  ),
  shield: <path d="M10 2.6 4.8 4.4v5c0 3.7 2.4 6.3 5.2 7.6 2.8-1.3 5.2-3.9 5.2-7.6v-5z" />,
  target: (
    <>
      <circle cx="10" cy="10" r="6.6" />
      <circle cx="10" cy="10" r="2.7" />
    </>
  ),
  team: (
    <>
      <circle cx="6.8" cy="7.4" r="2.4" />
      <circle cx="13.2" cy="7.4" r="2.4" />
      <path d="M2.6 16c0-2.5 1.9-4.1 4.2-4.1s4.2 1.6 4.2 4.1" />
      <path d="M11 16c.2-2.1 1.9-3.4 3.4-3.4S17.4 13.9 17.6 16" />
    </>
  ),
  box: (
    <>
      <path d="M10 2.6 16.6 6v8L10 17.4 3.4 14V6z" />
      <path d="M3.6 6 10 9.6 16.4 6M10 9.6v7.8" />
    </>
  ),
  mail: (
    <>
      <path d="M3 5.5h14v9H3z" />
      <path d="M3.4 6 10 10.8 16.6 6" />
    </>
  ),
  skull: (
    <>
      <path d="M10 3a6 6 0 0 0-4.4 10.1V16h8.8v-2.9A6 6 0 0 0 10 3z" />
      <circle cx="7.7" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12.3" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <path d="M8.4 16v-2M11.6 16v-2" />
    </>
  ),
  warn: (
    <>
      <path d="M10 3l7 13H3z" />
      <path d="M10 8.5v3.6M10 14.4v.1" />
    </>
  ),
  clock: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 5.6V10l3 2" />
    </>
  ),
  banner: (
    <>
      <path d="M6 3v14.5" />
      <path d="M6 3.5h9l-2.4 3.2 2.4 3.2H6" />
    </>
  ),
};

export type ChipIconName = keyof typeof PATHS;

/**
 * A chip's leading glyph, wrapped in the `.chip__ico` slot the skins size.
 * `fill` adds the `chip__ico--fill` modifier so the skin can tint the glyph's
 * interior a shade of the icon colour (rather than leaving a bare outline) — a
 * cheap on/off state signal localised to the icon, e.g. the shield filling in
 * when the cover guard is held.
 */
export function ChipIcon({ name, fill = false }: { name: ChipIconName; fill?: boolean }) {
  return (
    <span className={fill ? "chip__ico chip__ico--fill" : "chip__ico"}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {PATHS[name]}
      </svg>
    </span>
  );
}
