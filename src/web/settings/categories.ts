/**
 * The navigation tree of the settings dialog.
 *
 * Character settings and UI settings are stored separately (per-character
 * `settings` vs the global UI slices), so the sidebar keeps them in two groups
 * rather than mixing them by topic — the group a page sits in is where its
 * values are saved. The third group, "Dane", holds sync, backup and import:
 * they act at once and are not part of Save.
 *
 * `scripts/build-assistant-kb.ts` reads `SettingsCategoryKey` (in `categoryList.ts`) to check its own
 * panel map, and the assistant's "open that panel" action finds a page by its
 * label — so labels are unique across both groups.
 */

import { closeOptionWindows, openWindow, prepareWindow } from "@web/modals/pageWindows.ts";
import { SETTINGS_CATEGORIES, type SettingsCategory, type SettingsCategoryKey, type SettingsGroup } from "./categoryList";

export * from "./categoryList";

export const DEFAULT_SETTINGS_CATEGORY: Record<SettingsGroup, SettingsCategoryKey> = {
    character: "character-general",
    ui: "ui-appearance",
    data: "data-sync",
};

export function settingsCategory(key: SettingsCategoryKey): SettingsCategory {
    return SETTINGS_CATEGORIES.find(c => c.key === key)!;
}

export function settingsCategoryByLabel(label: string | undefined): SettingsCategory | undefined {
    if (!label) return undefined;
    return SETTINGS_CATEGORIES.find(c => c.label === label);
}

/**
 * Hosts dispatch this before showing the dialog to pick the page it opens on.
 * The dialog itself listens; a missing `category` keeps the current page.
 */
export const SHOW_SETTINGS_EVENT = "show-settings";

export interface ShowSettingsDetail {
    category?: SettingsCategoryKey;
    /**
     * A general "open settings" rather than a particular page: on a phone the
     * dialog starts on its list of pages (with `category` still the one the
     * wide layout shows).
     */
    overview?: boolean;
}

/** Before showing the dialog as it was left: pages that refresh on opening hear it, the page stays. */
export function requestSettingsResume(): void {
    // The dialog mounts on first use; it has to be there to hear this.
    prepareWindow("settings");
    window.dispatchEvent(new CustomEvent<ShowSettingsDetail>(SHOW_SETTINGS_EVENT, { detail: {} }));
}

export function requestSettingsCategory(category: SettingsCategoryKey, options: { overview?: boolean } = {}): void {
    prepareWindow("settings");
    window.dispatchEvent(new CustomEvent<ShowSettingsDetail>(SHOW_SETTINGS_EVENT, { detail: { category, ...options } }));
}

/**
 * Show the settings dialog on a page — for a button outside the dialog (a
 * window's "Import z Mudleta" shortcut). The other option windows close first;
 * the dialog picks the page from `SHOW_SETTINGS_EVENT`. `anchor` is the DOM id
 * of an element on that page to scroll into view.
 */
export function openSettingsPage(category: SettingsCategoryKey, anchor?: string): void {
    closeOptionWindows();
    requestSettingsCategory(category);
    openWindow("settings");
    if (anchor) window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ block: "center" }), 350);
}

/** Dispatched by the host's Save button. */
export const SAVE_SETTINGS_EVENT = "save-settings";
/** DOM id of the window whose open/close events (MODAL_EVENT, appModal.ts) the dialog follows. */
export const SETTINGS_MODAL_ID = "settings-modal";
