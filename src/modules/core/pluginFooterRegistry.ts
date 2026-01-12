/**
 * Plugin Footer Registry - Manages dynamic footer components registered by plugins.
 *
 * Plugins can add custom components to the footer bar (next to built-in components
 * like Rozkaz timer, Clock, etc.) using this registry.
 *
 * Supports three content types:
 * - HTML strings
 * - DOM nodes
 * - React elements
 */

import { isValidElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

export type FooterContent = string | Node | ReactElement;

export interface FooterComponentRecord {
  id: string;
  element: HTMLSpanElement;
  position: 'start' | 'end' | number;
  reactRoot: Root | null;
  contentType: 'html' | 'node' | 'react';
}

const footerComponents = new Map<string, FooterComponentRecord>();

/**
 * Gets the plugin footer container element (#plugin-footer-components)
 * This is where plugin components are inserted
 */
function getPluginFooterContainer(): HTMLElement | null {
  return document.getElementById("plugin-footer-components");
}

/**
 * Determines the content type
 */
function getContentType(content: FooterContent): 'html' | 'node' | 'react' {
  if (typeof content === 'string') {
    return 'html';
  }
  if (isValidElement(content)) {
    return 'react';
  }
  return 'node';
}

/**
 * Renders content to an element based on its type
 */
function renderContent(
  element: HTMLSpanElement,
  content: FooterContent,
  existingRoot: Root | null
): Root | null {
  const contentType = getContentType(content);

  // Clean up existing React root if switching away from React
  if (existingRoot && contentType !== 'react') {
    existingRoot.unmount();
  }

  if (contentType === 'html') {
    element.innerHTML = content as string;
    return null;
  }

  if (contentType === 'react') {
    const reactElement = content as ReactElement;
    let root = existingRoot;
    if (!root) {
      root = createRoot(element);
    }
    root.render(reactElement);
    return root;
  }

  // DOM node
  element.innerHTML = '';
  element.appendChild((content as Node).cloneNode(true));
  return null;
}

/**
 * Register a footer component
 * @param id - Unique component ID
 * @param content - HTML string, DOM node, or React element
 * @param position - Position in footer ('start', 'end', or numeric index)
 */
export function registerFooterComponent(
  id: string,
  content: FooterContent,
  position: 'start' | 'end' | number = 'end'
): FooterComponentRecord {
  const container = getPluginFooterContainer();
  if (!container) {
    throw new Error("Plugin footer container not found");
  }

  // Remove existing component with the same ID if present
  const existing = footerComponents.get(id);
  if (existing) {
    if (existing.reactRoot) {
      existing.reactRoot.unmount();
    }
    existing.element.remove();
    footerComponents.delete(id);
  }

  // Create the container element
  const element = document.createElement('span');
  element.className = 'plugin-footer-component';
  element.dataset.pluginFooterId = id;

  // Render content
  const contentType = getContentType(content);
  const reactRoot = renderContent(element, content, null);

  // Insert element based on position
  if (position === 'start') {
    container.insertBefore(element, container.firstChild);
  } else if (position === 'end' || typeof position !== 'number') {
    container.appendChild(element);
  } else {
    // Numeric position - insert at specific index
    const children = Array.from(container.children);
    if (position >= children.length) {
      container.appendChild(element);
    } else {
      container.insertBefore(element, children[position]);
    }
  }

  const record: FooterComponentRecord = {
    id,
    element,
    position,
    reactRoot,
    contentType
  };

  footerComponents.set(id, record);
  return record;
}

/**
 * Update footer component content
 * @param id - Component ID
 * @param content - New HTML string, DOM node, or React element
 */
export function updateFooterComponent(
  id: string,
  content: FooterContent
): void {
  const record = footerComponents.get(id);
  if (!record) {
    return;
  }

  const newContentType = getContentType(content);
  record.reactRoot = renderContent(record.element, content, record.reactRoot);
  record.contentType = newContentType;
}

/**
 * Set footer component visibility
 * @param id - Component ID
 * @param visible - Whether the component should be visible
 */
export function setFooterComponentVisible(id: string, visible: boolean): void {
  const record = footerComponents.get(id);
  if (!record) {
    return;
  }
  record.element.style.display = visible ? '' : 'none';
}

/**
 * Unregister a footer component
 * @param id - Component ID to remove
 */
export function unregisterFooterComponent(id: string): void {
  const record = footerComponents.get(id);
  if (!record) {
    return;
  }

  // Clean up React root if present
  if (record.reactRoot) {
    record.reactRoot.unmount();
  }

  record.element.remove();
  footerComponents.delete(id);
}

/**
 * Get all registered footer components
 */
export function getFooterComponents(): FooterComponentRecord[] {
  return Array.from(footerComponents.values());
}
