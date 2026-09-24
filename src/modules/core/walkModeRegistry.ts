import type { BindSettings, WalkModifiers } from "./keymapTypes";

/**
 * Walk modes: a modifier held with a direction key walks that one step
 * differently, without touching the move mode the ` key cycles.
 *
 * A walk mode has no keys of its own - it rides on the direction keys, so
 * moving the directions to the arrows carries every walk mode along. The player
 * picks each mode's modifier in Klawisze (stored per keymap in
 * `BindSettings.walkModes`); Alt+numpad can sneak while Ctrl+numpad does a
 * plugin's own walking, and neither needs a bind per direction.
 *
 * Two sources meet here: the built-in sneaks, which prefix the step, and modes
 * registered by plugins, which get the direction and walk it themselves.
 */
export interface WalkMode {
  /** Stable id; the stored modifier is keyed by it, so it must survive reloads. */
  id: string;
  label: string;
  /** Used until the player sets a modifier of their own. */
  defaultModifiers?: WalkModifiers;
  source: "builtin" | "plugin";
  /** For a plugin's mode: whose it is, for the Klawisze list. */
  pluginName?: string;
  /** A built-in sneak: the step is sent as `${prefix}${direction}`. */
  prefix?: string;
  /** A plugin's mode: walks the step itself (`n`, `ne`, `u`, or a special exit's command). */
  onMove?: (direction: string) => void;
}

const BUILTIN: readonly WalkMode[] = [
  { id: "sneak", label: "Przemknij", source: "builtin", prefix: "przemknij " },
  { id: "sneakTeam", label: "Przemknij z drużyną", source: "builtin", prefix: "przemknij z druzyna " },
];

const BUILTIN_IDS = new Set(BUILTIN.map(m => m.id));

const pluginModes = new Map<string, WalkMode>();
const listeners = new Set<() => void>();

let snapshot: WalkMode[] = [...BUILTIN];

function emit(): void {
  snapshot = [...BUILTIN, ...pluginModes.values()];
  for (const listener of listeners) listener();
}

/** Add or replace a plugin's walk mode. A built-in id cannot be taken over. */
export function registerWalkMode(mode: Omit<WalkMode, "source" | "prefix">): boolean {
  if (BUILTIN_IDS.has(mode.id)) return false;
  pluginModes.set(mode.id, { ...mode, source: "plugin" });
  emit();
  return true;
}

export function unregisterWalkMode(id: string): void {
  if (pluginModes.delete(id)) emit();
}

/** Every walk mode, built-ins first. Stable until the next change. */
export function getWalkModes(): WalkMode[] {
  return snapshot;
}

export function subscribeWalkModes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const NONE: WalkModifiers = { ctrl: false, alt: false, shift: false };

/** The modifier this mode listens on: the player's choice, else the mode's default, else none. */
export function walkModifiersOf(binds: Pick<BindSettings, "walkModes"> | undefined, mode: WalkMode): WalkModifiers {
  const chosen = binds?.walkModes?.[mode.id] ?? mode.defaultModifiers ?? NONE;
  return { ctrl: !!chosen.ctrl, alt: !!chosen.alt, shift: !!chosen.shift };
}

/**
 * The modifiers the direction keys already hold (Shift+arrows, say). A walk
 * mode cannot use them: holding one is what the plain direction already asks
 * for, so they are taken out of every mode and Klawisze greys them out.
 */
export function directionModifiers(directions: Iterable<WalkModifiers | undefined> | undefined): WalkModifiers {
  const taken: WalkModifiers = { ctrl: false, alt: false, shift: false };
  for (const bind of directions ?? []) {
    if (!bind) continue;
    if (bind.ctrl) taken.ctrl = true;
    if (bind.alt) taken.alt = true;
    if (bind.shift) taken.shift = true;
  }
  return taken;
}

/** A mode's modifier with the ones the direction keys hold taken out: what it actually adds. */
export function effectiveWalkModifiers(mods: WalkModifiers, taken: WalkModifiers): WalkModifiers {
  return { ctrl: !!mods.ctrl && !taken.ctrl, alt: !!mods.alt && !taken.alt, shift: !!mods.shift && !taken.shift };
}

export function hasWalkModifier(mods: WalkModifiers): boolean {
  return !!(mods.ctrl || mods.alt || mods.shift);
}

export function sameWalkModifiers(a: WalkModifiers, b: WalkModifiers): boolean {
  return !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt && !!a.shift === !!b.shift;
}

/** Tests start from the built-ins alone. */
export function resetWalkModes(): void {
  pluginModes.clear();
  emit();
}
