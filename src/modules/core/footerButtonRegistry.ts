import { globalStorage } from "./storage";
import type { FooterButtonConfig } from "@shared/uiSettingsTypes";

/**
 * The buttons the player keeps next to the command line — their own commands,
 * one click away, without a bind to remember.
 *
 * Two sources meet here: the player's own buttons (`uiSettings.footerButtons`,
 * edited in Ustawienia → Stopka) and buttons registered by plugins. Both are
 * plain data, so every UI can render the row its own way; the stock footer puts
 * them between Wyślij and the ⋯ menu, and the phone sheet lays the same list out
 * as a grid.
 *
 * A button may light up: `state` names a flag, and whoever knows whether the
 * mode is on — a trigger, a script, a plugin — flips that flag with
 * {@link setFooterButtonState}. The button then draws itself filled, with a dot.
 */
export interface FooterButton {
  /** Stable unique id; re-registering the same id replaces the button. */
  id: string;
  label: string;
  /** Sent on click: a command, an alias or anything the command line accepts. */
  command: string;
  /** Neutral unless the button is worth a colour of its own. */
  tone: FooterButtonTone;
  /** Flag this button lights up from, if any (see {@link setFooterButtonState}). */
  state?: string;
  order: number;
  source: "user" | "plugin";
  /** For a plugin's button: whose it is, for the settings list. */
  pluginName?: string;
  /** Whether `state` is currently on — resolved here, so a UI just renders it. */
  on: boolean;
}

export type FooterButtonTone = "neutral" | "accent" | "danger";

export const FOOTER_BUTTON_TONES: readonly FooterButtonTone[] = ["neutral", "accent", "danger"];

export function isFooterButtonTone(value: unknown): value is FooterButtonTone {
  return typeof value === "string" && (FOOTER_BUTTON_TONES as readonly string[]).includes(value);
}

const pluginButtons = new Map<string, FooterButton>();
const states = new Map<string, boolean>();
const listeners = new Set<() => void>();

let snapshot: FooterButton[] = [];

/** The player's own buttons, as stored. Invalid entries are simply skipped. */
function readUserButtons(): FooterButton[] {
  const settings = globalStorage.get("uiSettings") as { footerButtons?: unknown } | null;
  const list = Array.isArray(settings?.footerButtons) ? settings.footerButtons : [];
  const buttons: FooterButton[] = [];
  (list as FooterButtonConfig[]).forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    if (typeof item.id !== "string" || !item.id) return;
    if (typeof item.label !== "string" || !item.label.trim()) return;
    if (typeof item.command !== "string" || !item.command.trim()) return;
    if (item.hidden) return;
    buttons.push({
      id: item.id,
      label: item.label.trim(),
      command: item.command.trim(),
      tone: isFooterButtonTone(item.tone) ? item.tone : "neutral",
      state: typeof item.state === "string" && item.state.trim() ? item.state.trim() : undefined,
      order: typeof item.order === "number" ? item.order : index,
      source: "user",
      on: false,
    });
  });
  return buttons;
}

function recompute(): void {
  const all = [...readUserButtons(), ...pluginButtons.values()];
  snapshot = all
    .map(button => ({ ...button, on: !!button.state && states.get(button.state) === true }))
    .sort((a, b) => a.order - b.order);
}

function emit(): void {
  recompute();
  for (const listener of listeners) listener();
}

recompute();
globalStorage.onChange("uiSettings", () => emit());

/** Add or replace a plugin's button. */
export function registerFooterButton(button: Omit<FooterButton, "source" | "on">): void {
  pluginButtons.set(button.id, { ...button, source: "plugin", on: false });
  emit();
}

/** Remove a plugin's button by id (no-op if absent). */
export function unregisterFooterButton(id: string): void {
  if (pluginButtons.delete(id)) emit();
}

/** Every button to render, user and plugin, in order. Stable until the next change. */
export function getFooterButtons(): FooterButton[] {
  return snapshot;
}

export function subscribeFooterButtons(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Turn a named flag on or off. Buttons whose `state` is that name draw
 * themselves as on — that is the whole of the "Tryb: podroz" behaviour, and it
 * is deliberately open: a trigger (`/przycisk podroz on`), a script or a plugin
 * can be the one that knows.
 */
export function setFooterButtonState(name: string, on: boolean): void {
  const key = name.trim();
  if (!key) return;
  if (states.get(key) === on) return;
  if (on) states.set(key, true);
  else states.delete(key);
  emit();
}

export function getFooterButtonState(name: string | undefined): boolean {
  return !!name && states.get(name.trim()) === true;
}

/** Which flags are on right now, for a settings panel offering them. */
export function getFooterButtonStates(): string[] {
  return [...states.keys()].sort();
}

/** Tests and a full settings reload start from nothing. */
export function resetFooterButtons(): void {
  pluginButtons.clear();
  states.clear();
  emit();
}
