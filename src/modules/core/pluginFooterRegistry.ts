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

export type FooterContent = string | Node | ReactElement;

export interface FooterComponentRecord {
  id: string;
  /** The plugin-owned element; adopted into whichever UI renders the footer. */
  element: HTMLSpanElement;
}

interface InternalRecord {
  element: HTMLSpanElement;
  reactRoot: Root | null;
}

const records = new Map<string, InternalRecord>();

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
 * @param id - Unique component ID
 * @param content - HTML string, DOM node, or React element
 * @param position - Position in the footer ('start', 'end', or numeric order)
 */
export function registerFooterComponent(
  id: string,
  content: FooterContent,
  position: "start" | "end" | number = "end"
): FooterComponentRecord {
  // Replace an existing component with the same id.
  unregisterFooterComponent(id);

  const element = document.createElement("span");
  element.className = "plugin-footer-component";
  element.dataset.pluginFooterId = id;

  const reactRoot = renderContent(element, content, null);
  records.set(id, { element, reactRoot });

  registerFooterItem({ id, order: positionToOrder(position), node: element });

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
}
