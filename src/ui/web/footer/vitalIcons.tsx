import type { ReactNode } from "react";

/**
 * The vital gems' glyphs, inlined on a 0-20 grid like the chip icons
 * (icons.tsx) and for the same reason: each renders its own `<svg>`, so no
 * host has to seed a symbol sheet first.
 */
const ICONS: Record<string, { width: number; paths: ReactNode }> = {
  hp: {
    width: 1.5,
    paths: <path d="M10 16.8C10 16.8 3.2 12.4 3.2 7.6A3.4 3.4 0 0 1 10 5.9 3.4 3.4 0 0 1 16.8 7.6C16.8 12.4 10 16.8 10 16.8Z" />,
  },
  fatigue: {
    width: 1.5,
    paths: (
      <>
        <circle cx="12.6" cy="4" r="2" />
        <path d="M11.7 5.9 9 11" />
        <path d="M9 11 12 12.6 12.4 15.8" />
        <path d="M9 11 6.6 13.9 4.7 15.6" />
        <path d="M11 6.7 14 7.3 13.4 9.4" />
        <path d="M11 6.7 8.4 7.1 7 9" />
        <path d="M2 7h3.2M1.4 10.5h3M2 14h3.2" />
      </>
    ),
  },
  stuffed: {
    width: 1.5,
    paths: (
      <>
        <path d="M3 9h14a7 7 0 0 1-14 0z" />
        <path d="M8 5c-.8-1 .4-2 0-3M11 5c-.8-1 .4-2 0-3M17 12H3" />
      </>
    ),
  },
  encumbrance: {
    width: 1.4,
    paths: (
      <>
        <path d="M6.5 8a3.5 3.5 0 0 1 7 0v8.5h-7z" />
        <path d="M6.5 11.5h7M9 8.2h2v2.3H9z" />
      </>
    ),
  },
  soaked: {
    width: 1.5,
    paths: (
      <>
        <path d="M10 2s5 6 5 9.5A5 5 0 0 1 5 11.5C5 8 10 2 10 2z" />
        <path d="M7.5 11a2.5 2.5 0 0 0 2.5 2.5" />
      </>
    ),
  },
  mana: {
    width: 1.4,
    paths: <path d="M10 2.5l1.7 5.8 5.8 1.7-5.8 1.7L10 17.5l-1.7-5.8L2.5 10l5.8-1.7z" />,
  },
  improve: {
    width: 1.5,
    paths: <path d="M5 11l5-5 5 5M5 15.5l5-5 5 5" />,
  },
  form: {
    width: 1.5,
    paths: (
      <>
        <path d="M4 6h4a3 3 0 0 1 3 3c0 3 2 4 4 4v3h-4a4 4 0 0 1-4-4" />
        <path d="M4 6v4" />
      </>
    ),
  },
  intox: {
    width: 1.4,
    paths: (
      <>
        <path d="M5 5h8v11H5zM13 7h2.5v4H13" />
        <path d="M5 8h8" />
      </>
    ),
  },
  headache: {
    width: 1.4,
    paths: (
      <>
        <circle cx="10" cy="11" r="4.5" />
        <path d="M10 3.5v-1.2M6 4.2l-.7-1M14 4.2l.7-1" />
      </>
    ),
  },
  panic: {
    width: 1.5,
    paths: (
      <>
        <path d="M10 3l7 13H3z" />
        <path d="M10 8.5v3.5M10 14.2v.1" />
      </>
    ),
  },
};

/** A vital's glyph, by its Char.State key. */
export function VitalIcon({ vital }: { vital: string }) {
  const icon = ICONS[vital];
  if (!icon) return null;
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={icon.width} strokeLinecap="round" strokeLinejoin="round">
      {icon.paths}
    </svg>
  );
}
