import type { DockSide } from '../types';

/**
 * The dock sizes (`--dock-<side>-size`) are registered as non-inherited
 * (`@property` in layout.css): set on a shell ancestor, every change in a dock
 * edge drag restyled each element under it, thousands of output lines
 * included. So they go straight onto the elements whose CSS reads them - the
 * two shell grids and the compass rose kept clear of the right dock.
 */
const READER_IDS = ['main-container', 'content-area', 'compass-rose-box'];

function readers(): HTMLElement[] {
  return READER_IDS.flatMap(id => document.getElementById(id) ?? []);
}

export function setDockSizeVar(side: DockSide, value: string | null, els = readers()): void {
  for (const el of els) {
    if (value === null) el.style.removeProperty(`--dock-${side}-size`);
    else el.style.setProperty(`--dock-${side}-size`, value);
  }
}

export function setDockSizeVars(sizeFor: (side: DockSide) => string | null): void {
  const els = readers();
  for (const side of ['left', 'top', 'right', 'bottom'] as const) {
    setDockSizeVar(side, sizeFor(side), els);
  }
}
