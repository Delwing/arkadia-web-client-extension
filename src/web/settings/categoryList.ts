/**
 * The pages of the settings dialog as plain data, with no imports:
 * `scripts/build-assistant-kb.ts` runs this file under plain node, which
 * resolves no path aliases. The rest of the navigation lives in
 * `categories.ts`, which re-exports everything here.
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
    | "ui-joysticks"
    | "ui-footer"
    | "ui-map"
    | "ui-sound"
    | "ui-other"
    | "ui-experimental"
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
    { key: "character-general", group: "character", label: "Ogólne", keywords: "wyjścia róża wiatrów język" },
    { key: "character-items", group: "character", label: "Przedmioty", keywords: "pojemniki zbieranie monety zioła" },
    { key: "character-combat", group: "character", label: "Walka", keywords: "broń atak gagi" },
    { key: "character-guilds", group: "character", label: "Gildie", keywords: "wrogowie sojusznicy" },
    { key: "character-magics", group: "character", label: "Magiki" },
    { key: "ui-appearance", group: "ui", label: "Wygląd", keywords: "motyw czcionka kolory paleta" },
    { key: "ui-windows", group: "ui", label: "Okna", keywords: "układ bufor lista obiektów ustawienia okien tło krycie czcionka" },
    { key: "ui-commands", group: "ui", label: "Komendy", keywords: "multibindy bindy wpisywanie funkcyjny kolory format stopka" },
    { key: "ui-buttons", group: "ui", label: "Przyciski", keywords: "makra" },
    { key: "ui-mobile-buttons", group: "ui", label: "Przyciski mobilne", keywords: "makra kierunki telefon drużyna" },
    { key: "ui-radial", group: "ui", label: "Menu kołowe", keywords: "radialne gest komendy telefon" },
    { key: "ui-joysticks", group: "ui", label: "Joysticki", keywords: "gałka gest przesunięcie kierunki telefon fado" },
    { key: "ui-footer", group: "ui", label: "Stopka", keywords: "paski kondycja" },
    { key: "ui-map", group: "ui", label: "Mapa" },
    { key: "ui-sound", group: "ui", label: "Dźwięk i powiadomienia", keywords: "dźwięki beep powiadomienia push mowa tts głos czytanie lektor" },
    { key: "ui-other", group: "ui", label: "Inne", keywords: "telefon logi dysk zapis" },
    { key: "ui-experimental", group: "ui", label: "Eksperymentalne", keywords: "eksperyment kolejka kroków mapa znacznik poprawianie lag blokada" },
    { key: "data-sync", group: "data", label: "Synchronizacja", keywords: "firebase konto logowanie chmura eksport import" },
    { key: "data-backup", group: "data", label: "Kopia zapasowa", keywords: "eksport import plik google drive backup" },
    { key: "data-devices", group: "data", label: "Urządzenia", keywords: "urządzenie grupa synchronizacji" },
    { key: "data-import", group: "data", label: "Import z innych klientów", keywords: "mudlet blowtorch klient arkadii wiedza złom postępy multibindy aliasy baza db" },
];
