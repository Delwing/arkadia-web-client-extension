import { useSyncExternalStore } from "react";
import eventBus from "@modules/core/eventBus";
import type { CharStateData } from "./vitalsModel";

/**
 * Everything Char.State has reported this session, merged: the game sends
 * only what changed, so a vital (Postępy above all) may not come again for a
 * long while. Footer pieces read it here rather than collecting it themselves,
 * so one drawn afresh - a layout switched, a setting changed - starts from what
 * is known instead of from nothing.
 */
let state: Partial<CharStateData> = {};
/** Char.Options form, once the game has said; 0 is a character with no fighting form. */
let form: number | undefined;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

eventBus.on("gmcp.char.state", (next: Partial<CharStateData>) => {
  if (!next || typeof next !== "object") return;
  state = { ...state, ...next };
  notify();
});
eventBus.on("gmcp.char.options", (options: { form?: number }) => {
  if (!options || !("form" in options)) return;
  form = options.form;
  notify();
});

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The merged Char.State so far (a new object on every change). */
export function useCharState(): Partial<CharStateData> {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Char.Options form, `undefined` until the game reports it. */
export function useCharForm(): number | undefined {
  return useSyncExternalStore(subscribe, () => form, () => form);
}

/** The game says the character has no fighting form (Char.Options form 0). */
export function useFormDisabled(): boolean {
  return useCharForm() === 0;
}
