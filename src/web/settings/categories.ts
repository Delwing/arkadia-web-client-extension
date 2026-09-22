/**
 * The navigation tree of the settings dialog.
 *
 * Character settings and UI settings are stored separately (per-character
 * `settings` vs the global UI slices), so the sidebar keeps them in two groups
 * rather than mixing them by topic — the group a page sits in is where its
 * values are saved. The third group, "Dane", holds sync, backup and import:
 * they act at once and are not part of Save.
 *
 * `scripts/build-assistant-kb.ts` reads `SettingsCategoryKey` to check its own
 * panel map, and the assistant's "open that panel" action finds a page by its
 * label — so labels are unique across both groups.
 */

export type SettingsGroup = "character" | "ui" | "data";

export type SettingsCategoryKey =
    | "character-general"
    | "character-items"
    | "character-combat"
    | "character-guilds"
    | "character-magics"
    | "ui-appearance"
    | "ui-windows"
    | "ui-commands"
    | "ui-buttons"
    | "ui-mobile-buttons"
    | "ui-radial"
    | "ui-footer"
    | "ui-map"
    | "ui-sound"
    | "ui-other"
    | "data-sync"
    | "data-backup"
    | "data-devices"
    | "data-import";

export interface SettingsCategory {
    key: SettingsCategoryKey;
    group: SettingsGroup;
    label: string;
    /** Extra search terms matching the whole page; never shown. */
    keywords?: string;
}

export const SETTINGS_GROUP_LABELS: Record<SettingsGroup, string> = {
    character: "Postać",
    ui: "Interfejs",
    data: "Dane",
};

export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
    { key: "character-general", group: "character", label: "Ogólne", keywords: "wyjscia roza wiatrow jezyk" },
    { key: "character-items", group: "character", label: "Przedmioty", keywords: "pojemniki zbieranie monety ziola" },
    { key: "character-combat", group: "character", label: "Walka", keywords: "bron atak gagi" },
    { key: "character-guilds", group: "character", label: "Gildie", keywords: "wrogowie sojusznicy" },
    { key: "character-magics", group: "character", label: "Magiki" },
    { key: "ui-appearance", group: "ui", label: "Wygląd", keywords: "motyw czcionka kolory paleta" },
    { key: "ui-windows", group: "ui", label: "Okna", keywords: "uklad bufor lista obiektow" },
    { key: "ui-commands", group: "ui", label: "Komendy", keywords: "multibindy bindy wpisywanie" },
    { key: "ui-buttons", group: "ui", label: "Przyciski", keywords: "makra" },
    { key: "ui-mobile-buttons", group: "ui", label: "Przyciski mobilne", keywords: "makra kierunki telefon druzyna" },
    { key: "ui-radial", group: "ui", label: "Menu kołowe", keywords: "radialne gest komendy telefon" },
    { key: "ui-footer", group: "ui", label: "Stopka", keywords: "paski kondycja" },
    { key: "ui-map", group: "ui", label: "Mapa" },
    { key: "ui-sound", group: "ui", label: "Dźwięk i powiadomienia", keywords: "dzwieki beep powiadomienia push" },
    { key: "ui-other", group: "ui", label: "Inne", keywords: "telefon logi dysk zapis" },
    { key: "data-sync", group: "data", label: "Synchronizacja", keywords: "firebase konto logowanie chmura eksport import" },
    { key: "data-backup", group: "data", label: "Kopia zapasowa", keywords: "eksport import plik google drive backup" },
    { key: "data-devices", group: "data", label: "Urządzenia", keywords: "urzadzenie grupa synchronizacji" },
    { key: "data-import", group: "data", label: "Import z innych klientów", keywords: "mudlet blowtorch klient arkadii wiedza zlom postepy multibindy aliasy baza db" },
];

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

export function requestSettingsCategory(category: SettingsCategoryKey, options: { overview?: boolean } = {}): void {
    window.dispatchEvent(new CustomEvent<ShowSettingsDetail>(SHOW_SETTINGS_EVENT, { detail: { category, ...options } }));
}

/**
 * Ask the host UI to show the settings dialog on a page — for a button outside
 * the dialog (a window's "Import z Mudleta" shortcut). `anchor` is the DOM id
 * of an element on that page to scroll into view. Hosts close their other
 * modals first; the dialog itself picks the page from `SHOW_SETTINGS_EVENT`.
 */
export const OPEN_SETTINGS_PAGE_EVENT = "open-settings-page";

export interface OpenSettingsPageDetail {
    category: SettingsCategoryKey;
    anchor?: string;
}

export function openSettingsPage(category: SettingsCategoryKey, anchor?: string): void {
    window.dispatchEvent(new CustomEvent<OpenSettingsPageDetail>(OPEN_SETTINGS_PAGE_EVENT, { detail: { category, anchor } }));
}

/** Dispatched by the host's Save button. */
export const SAVE_SETTINGS_EVENT = "save-settings";
/** Dispatched by the dialog after saving, asking the host to close it. */
export const CLOSE_SETTINGS_EVENT = "close-settings";
/** DOM id of the element whose Bootstrap `show.bs.modal`/`hidden.bs.modal` the dialog follows. */
export const SETTINGS_MODAL_ID = "settings-modal";
