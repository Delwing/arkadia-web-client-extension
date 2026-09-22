import type { ContextMenuEntry } from "@web/contextMenu";
import { registerMainMenuItem, unregisterMainMenuItem, updateMainMenuItem } from "./mainMenuRegistry";

type PopupMenuEntryRecord = {
  id: string;
  label: string | Node;
};

type ContextMenuEntryRecord = ContextMenuEntry & { id: string };

const popupMenuEntries = new Map<string, PopupMenuEntryRecord>();
const contextMenuEntries = new Map<string, ContextMenuEntryRecord>();

/**
 * Plugin entries of the stock "⋯" menu. The menu itself renders from
 * {@link registerMainMenuItem}'s registry; these keep the stable plugin API
 * (register / relabel / disable / remove by id). UIs without that menu (forge)
 * simply never render the entries, so plugins still load.
 */
export function registerPopupMenuEntry(
  id: string,
  label: string | Node,
  onSelect: () => void
): PopupMenuEntryRecord {
  registerMainMenuItem({ id, label, onSelect, order: 1000, source: "plugin" });
  const record: PopupMenuEntryRecord = { id, label };
  popupMenuEntries.set(id, record);
  return record;
}

export function updatePopupMenuEntryLabel(id: string, label: string | Node): void {
  const entry = popupMenuEntries.get(id);
  if (!entry) {
    return;
  }
  entry.label = label;
  updateMainMenuItem(id, { label });
}

export function setPopupMenuEntryDisabled(id: string, disabled: boolean): void {
  if (!popupMenuEntries.has(id)) {
    return;
  }
  updateMainMenuItem(id, { disabled });
}

export function unregisterPopupMenuEntry(id: string): void {
  if (!popupMenuEntries.delete(id)) {
    return;
  }
  unregisterMainMenuItem(id);
}

export function registerContextMenuEntry(
  id: string,
  label: string | Node,
  action: () => void
): ContextMenuEntryRecord {
  const record: ContextMenuEntryRecord = { id, label, action };
  contextMenuEntries.set(id, record);
  return record;
}

export function updateContextMenuEntry(
  id: string,
  updates: Partial<Pick<ContextMenuEntryRecord, "label" | "action">>
): void {
  const entry = contextMenuEntries.get(id);
  if (!entry) {
    return;
  }
  if (updates.label !== undefined) {
    entry.label = updates.label;
  }
  if (typeof updates.action === "function") {
    entry.action = updates.action;
  }
}

export function unregisterContextMenuEntry(id: string): void {
  contextMenuEntries.delete(id);
}

export function getContextMenuEntries(): ContextMenuEntryRecord[] {
  return Array.from(contextMenuEntries.values());
}
