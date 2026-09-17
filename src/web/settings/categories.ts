/**
 * The navigation tree of the settings dialog.
 *
 * Character settings and UI settings are stored separately (per-character
 * `settings` vs the global UI slices), so the sidebar keeps them in two groups
 * rather than mixing them by topic — the group a page sits in is where its
 * values are saved.
 *
 * `scripts/build-assistant-kb.ts` reads `SettingsCategoryKey` to check its own
 * panel map, and the assistant's "open that panel" action finds a page by its
 * label — so labels are unique across both groups.
 */

export type SettingsGroup = "character" | "ui";

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
    | "ui-other";

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
    { key: "ui-other", group: "ui", label: "Inne", keywords: "telefon" },
];

export const DEFAULT_SETTINGS_CATEGORY: Record<SettingsGroup, SettingsCategoryKey> = {
    character: "character-general",
    ui: "ui-appearance",
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
}

export function requestSettingsCategory(category: SettingsCategoryKey): void {
    window.dispatchEvent(new CustomEvent<ShowSettingsDetail>(SHOW_SETTINGS_EVENT, { detail: { category } }));
}

/** Dispatched by the host's Save button. */
export const SAVE_SETTINGS_EVENT = "save-settings";
/** Dispatched by the dialog after saving, asking the host to close it. */
export const CLOSE_SETTINGS_EVENT = "close-settings";
/** DOM id of the element whose Bootstrap `show.bs.modal`/`hidden.bs.modal` the dialog follows. */
export const SETTINGS_MODAL_ID = "settings-modal";
