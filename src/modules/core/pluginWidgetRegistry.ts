/**
 * Plugin Widget Registry — lets plugins offer widgets of their own.
 *
 * The plugin-facing adapter over widgetRegistry, in the shape of
 * pluginFooterRegistry: each plugin widget is backed by a real `<div>` (the
 * handle's `.element`, which plugins may manipulate directly), registered as a
 * `node` widget type. The player places it from "Dodaj widżet" like any other;
 * where it sits is theirs, so it comes back there when the plugin loads again.
 */

import type { Root } from "react-dom/client";
import { renderContent, type FooterContent } from "./pluginFooterRegistry";
import { registerWidgetType, unregisterWidgetType, type WidgetCorner } from "./widgetRegistry";

export type WidgetContent = FooterContent;

export interface PluginWidgetOwner {
  pluginId: string;
  /** The id the plugin chose, without the `plugin:<pluginId>:` prefix. */
  localId: string;
}

export interface PluginWidgetOptions {
  /** Name in "Dodaj widżet"; defaults to the plugin's name. */
  label?: string;
  /** Where a newly added one lands. */
  corner?: WidgetCorner;
}

interface InternalRecord {
  element: HTMLDivElement;
  reactRoot: Root | null;
  pluginId: string;
  localId: string;
  options: PluginWidgetOptions;
}

const records = new Map<string, InternalRecord>();
// A plugin registers during init(), before the manager knows its name.
const pluginNames = new Map<string, string>();

function labelFor(record: InternalRecord): string {
  if (record.options.label) return record.options.label;
  const name = pluginNames.get(record.pluginId);
  if (!name) return record.localId;
  const shared = [...records.values()].some((other) => other !== record && other.pluginId === record.pluginId);
  return shared ? `${name}: ${record.localId}` : name;
}

function publish(id: string, record: InternalRecord): void {
  registerWidgetType({
    id,
    label: labelFor(record),
    defaultCorner: record.options.corner,
    source: "plugin",
    node: record.element,
  });
}

function refreshPlugin(pluginId: string): void {
  for (const [id, record] of records) {
    if (record.pluginId === pluginId) publish(id, record);
  }
}

/** Tell the registry what a plugin is called, so its widgets get a readable name. */
export function updateWidgetPluginName(pluginId: string, pluginName: string): void {
  if (pluginNames.get(pluginId) === pluginName) return;
  pluginNames.set(pluginId, pluginName);
  refreshPlugin(pluginId);
}

/**
 * Register a plugin widget type.
 * @param id - Unique id, as `plugin:<pluginId>:<local id>`; also what placed copies remember
 */
export function registerPluginWidget(
  id: string,
  content: WidgetContent,
  options: PluginWidgetOptions = {},
  owner?: PluginWidgetOwner,
): { id: string; element: HTMLDivElement } {
  unregisterPluginWidget(id);
  const element = document.createElement("div");
  element.className = "plugin-widget";
  element.dataset.pluginWidgetId = id;
  const reactRoot = renderContent(element, content, null);
  const pluginId = owner?.pluginId ?? id;
  records.set(id, { element, reactRoot, pluginId, localId: owner?.localId ?? id, options });
  refreshPlugin(pluginId);
  return { id, element };
}

export function updatePluginWidget(id: string, content: WidgetContent): void {
  const record = records.get(id);
  if (!record) return;
  record.reactRoot = renderContent(record.element, content, record.reactRoot);
}

export function unregisterPluginWidget(id: string): void {
  const record = records.get(id);
  if (!record) return;
  record.reactRoot?.unmount();
  records.delete(id);
  unregisterWidgetType(id);
  refreshPlugin(record.pluginId);
}
