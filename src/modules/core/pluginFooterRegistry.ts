/**
 * Plugin Footer Registry — lets plugins add custom components to the footer.
 *
 * This is the plugin-facing adapter over the common footer registry
 * (`footerRegistry`): each plugin footer component is backed by a real `<span>`
 * (the handle's `.element`, which plugins may manipulate directly), and that
 * span is registered as a `node` item in the common registry. Every UI then
 * renders it — the forge HUD interleaves it with its chips, the stock UI hosts
 * it in `#plugin-footer-components` — so plugin footer components now appear in
 * both UIs, not just the stock DOM footer they used to be pinned to.
 *
 * Supports the same three content types as before: HTML strings, DOM nodes and
 * React elements.
 */

import { isValidElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  registerFooterItem,
  unregisterFooterItem,
} from "./footerRegistry";

/**
 * Who owns a footer component, for the settings panel's label. Passed in rather
 * than parsed back out of the registry id: a pluginId is usually the plugin's
 * URL, so `plugin:https://example.com/x.js:chip` has colons everywhere and
 * nothing can be recovered from it by splitting.
 */
export interface FooterComponentOwner {
  pluginId: string;
  /** The id the plugin chose, without the `plugin:<pluginId>:` prefix. */
  localId: string;
}

export type FooterContent = string | Node | ReactElement;

export interface FooterComponentRecord {
  id: string;
  /** The plugin-owned element; adopted into whichever UI renders the footer. */
  element: HTMLSpanElement;
}

interface InternalRecord {
  element: HTMLSpanElement;
  reactRoot: Root | null;
  /** Which plugin owns it, and what it called itself - for the settings panel's label. */
  pluginId: string;
  localId: string;
  position: "start" | "end" | number;
}

const records = new Map<string, InternalRecord>();

/**
 * Plugin display names, learned late. A plugin registers its footer component
 * during `init()`, which runs before the manager knows what the plugin is
 * called, so the name arrives afterwards via `updateFooterComponentPluginName`
 * - the same shape `pluginButtonMacroRegistry` uses for the same reason.
 */
const pluginNames = new Map<string, string>();

/**
 * What the footer settings panel calls this component. The plugin's name where
 * we have it, falling back to the id the plugin chose; a plugin with more than
 * one component gets the local id alongside the name, so its two rows are
 * distinguishable.
 */
function labelFor(record: InternalRecord): string {
  const name = pluginNames.get(record.pluginId);
  if (!name) return record.localId;
  let othersFromSamePlugin = false;
  for (const other of records.values()) {
    if (other !== record && other.pluginId === record.pluginId) {
      othersFromSamePlugin = true;
      break;
    }
  }
  return othersFromSamePlugin ? `${name}: ${record.localId}` : name;
}

/** Re-register one plugin's items so the common registry picks up their labels. */
function refreshPlugin(pluginId: string): void {
  for (const [id, record] of records) {
    if (record.pluginId !== pluginId) continue;
    registerFooterItem({
      id,
      order: positionToOrder(record.position),
      source: "plugin",
      label: labelFor(record),
      node: record.element,
    });
  }
}

/**
 * Tell the registry what a plugin is called, so its footer components can be
 * listed under a readable name. Safe to call repeatedly and before or after the
 * components themselves are registered.
 */
export function updateFooterComponentPluginName(pluginId: string, pluginName: string): void {
  if (pluginNames.get(pluginId) === pluginName) return;
  pluginNames.set(pluginId, pluginName);
  refreshPlugin(pluginId);
}

function getContentType(content: FooterContent): "html" | "node" | "react" {
  if (typeof content === "string") return "html";
  if (isValidElement(content)) return "react";
  return "node";
}

/** Render content into the plugin's span, managing its React root if any. */
function renderContent(
  element: HTMLSpanElement,
  content: FooterContent,
  existingRoot: Root | null
): Root | null {
  const contentType = getContentType(content);

  // Tear down a React root when switching away from React content.
  if (existingRoot && contentType !== "react") {
    existingRoot.unmount();
  }

  if (contentType === "html") {
    element.innerHTML = content as string;
    return null;
  }

  if (contentType === "react") {
    const root = existingRoot ?? createRoot(element);
    root.render(content as ReactElement);
    return root;
  }

  element.innerHTML = "";
  element.appendChild((content as Node).cloneNode(true));
  return null;
}

/** Map the public position to the registry's numeric `order`. */
function positionToOrder(position: "start" | "end" | number): number {
  if (position === "start") return 0;
  if (typeof position === "number") return position;
  return 1000; // "end" (and any unexpected value) — after the built-in chips
}

/**
 * Register a footer component.
 * @param id - Unique component ID, as `plugin:<pluginId>:<local id>`
 * @param content - HTML string, DOM node, or React element
 * @param position - Position in the footer ('start', 'end', or numeric order)
 * @param owner - Which plugin this belongs to, for the footer settings label
 */
export function registerFooterComponent(
  id: string,
  content: FooterContent,
  position: "start" | "end" | number = "end",
  owner?: FooterComponentOwner
): FooterComponentRecord {
  // Replace an existing component with the same id.
  unregisterFooterComponent(id);

  const element = document.createElement("span");
  element.className = "plugin-footer-component";
  element.dataset.pluginFooterId = id;

  const reactRoot = renderContent(element, content, null);
  const pluginId = owner?.pluginId ?? id;
  records.set(id, { element, reactRoot, pluginId, localId: owner?.localId ?? id, position });

  // The whole plugin, not just this component: gaining a second one changes
  // what the first should be called.
  refreshPlugin(pluginId);

  return { id, element };
}

/**
 * Update a footer component's content.
 * @param id - Component ID
 * @param content - New HTML string, DOM node, or React element
 */
export function updateFooterComponent(id: string, content: FooterContent): void {
  const record = records.get(id);
  if (!record) return;
  // The span is stable and already hosted by the UI; re-rendering into it is
  // enough — no need to touch the registry.
  record.reactRoot = renderContent(record.element, content, record.reactRoot);
}

/**
 * Set a footer component's visibility.
 * @param id - Component ID
 * @param visible - Whether the component should be visible
 */
export function setFooterComponentVisible(id: string, visible: boolean): void {
  const record = records.get(id);
  if (!record) return;
  record.element.style.display = visible ? "" : "none";
}

/**
 * Unregister a footer component.
 * @param id - Component ID to remove
 */
export function unregisterFooterComponent(id: string): void {
  const record = records.get(id);
  if (!record) return;
  if (record.reactRoot) record.reactRoot.unmount();
  records.delete(id);
  unregisterFooterItem(id);
  // Down to one component, the survivor goes back to the plain plugin name.
  refreshPlugin(record.pluginId);
}
