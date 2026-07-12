import type { ContextMenuEntry } from "@web/contextMenu";

type PopupMenuEntryRecord = {
  id: string;
  label: string | Node;
  element: HTMLLIElement;
  button: HTMLButtonElement;
  listener: (event: MouseEvent) => void;
};

type ContextMenuEntryRecord = ContextMenuEntry & { id: string };

const popupMenuEntries = new Map<string, PopupMenuEntryRecord>();
const contextMenuEntries = new Map<string, ContextMenuEntryRecord>();

function getMenuListElement(): HTMLUListElement | null {
  const dropdown = document.querySelector<HTMLDivElement>("#input-area .dropdown");
  if (!dropdown) {
    return null;
  }
  return dropdown.querySelector<HTMLUListElement>(".dropdown-menu");
}

export function registerPopupMenuEntry(
  id: string,
  label: string | Node,
  onSelect: () => void
): PopupMenuEntryRecord {
  // The stock UI hosts this entry inside #input-area's dropdown. Alternate UIs
  // (e.g. forge-ui) don't render that menu, so fall back to a detached element
  // instead of throwing — plugins still get a working handle and don't fail to load.
  const menu = getMenuListElement();

  const existing = popupMenuEntries.get(id);
  if (existing) {
    existing.button.removeEventListener("click", existing.listener);
    existing.element.remove();
    popupMenuEntries.delete(id);
  }

  const listItem = document.createElement("li");
  listItem.dataset.pluginMenuEntryId = id;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "w-100 p-1";
  if (typeof label === 'string') {
    button.textContent = label;
  } else {
    button.appendChild(label.cloneNode(true));
  }

  const listener = (event: MouseEvent) => {
    event.preventDefault();
    onSelect();
  };

  button.addEventListener("click", listener);
  listItem.appendChild(button);
  menu?.appendChild(listItem);

  const record: PopupMenuEntryRecord = {
    id,
    label,
    element: listItem,
    button,
    listener
  };

  popupMenuEntries.set(id, record);
  return record;
}

export function updatePopupMenuEntryLabel(id: string, label: string | Node): void {
  const entry = popupMenuEntries.get(id);
  if (!entry) {
    return;
  }
  entry.label = label;
  entry.button.innerHTML = '';
  if (typeof label === 'string') {
    entry.button.textContent = label;
  } else {
    entry.button.appendChild(label.cloneNode(true));
  }
}

export function setPopupMenuEntryDisabled(id: string, disabled: boolean): void {
  const entry = popupMenuEntries.get(id);
  if (!entry) {
    return;
  }
  entry.button.disabled = disabled;
}

export function unregisterPopupMenuEntry(id: string): void {
  const entry = popupMenuEntries.get(id);
  if (!entry) {
    return;
  }
  entry.button.removeEventListener("click", entry.listener);
  entry.element.remove();
  popupMenuEntries.delete(id);
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
