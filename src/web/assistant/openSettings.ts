/**
 * Ask the host UI to open the settings page holding a given setting.
 *
 * `src/web` has two hosts — the stock UI (a Bootstrap modal created in
 * `main.ts`) and forge (its own modal host) — and neither exposes its modal
 * instance as an import. The established seam for reaching them is a window
 * event, the same way the menu picks the dialog's opening page
 * (`SHOW_SETTINGS_EVENT`). The dialog itself switches to the named page.
 *
 * A host that does not implement the event simply does nothing, and the card
 * still shows the navigation path as text — so the button degrades to a no-op
 * rather than to a broken promise.
 */

export const OPEN_SETTINGS_EVENT = 'assistant:open-settings';

/** Which sidebar group holds a key, decided by its storage prefix. */
export type SettingsSurface = 'character' | 'ui';

export interface OpenSettingsDetail {
    /** Registry-form key, e.g. `uiSettings.footerComponents`. */
    settingKey: string;
    surface: SettingsSurface;
    /**
     * The page's own label, e.g. "Stopka" — not a category key.
     *
     * The label is what the knowledge base's navigation paths carry; the dialog
     * maps it back through its category list, so renaming a page is one edit.
     */
    tabLabel?: string;
}

/**
 * The page segment of a navigation path.
 *
 * Paths are uniformly `Menu (⋮) → Ustawienia → <group> → <page> → <section>`,
 * so the page is always the fourth segment.
 */
export function tabLabelOf(uiLocation: string | undefined): string | undefined {
    if (!uiLocation) return undefined;
    const parts = uiLocation.split('→').map(part => part.trim()).filter(Boolean);
    return parts[3];
}

/**
 * UI-scoped slices live in the "Interfejs" group; everything else is a
 * character setting in the "Postać" group. Derived from the storage key the
 * proposal carries, so it needs no per-setting table to maintain.
 */
export function surfaceFor(settingKey: string): SettingsSurface {
    const head = settingKey.split('.')[0];
    return head === 'uiSettings' ||
        head === 'renderSettings' ||
        head === 'shellSettings' ||
        head === 'mapSettings' ||
        head === 'behaviorSettings'
        ? 'ui'
        : 'character';
}

export function openSettingsFor(settingKey: string, uiLocation?: string): void {
    const detail: OpenSettingsDetail = {
        settingKey,
        surface: surfaceFor(settingKey),
        tabLabel: tabLabelOf(uiLocation),
    };
    window.dispatchEvent(new CustomEvent<OpenSettingsDetail>(OPEN_SETTINGS_EVENT, { detail }));
}
