/**
 * Ask the host UI to open the settings panel holding a given setting.
 *
 * `src/web` has two hosts — the stock UI (Bootstrap modals created in
 * `main.ts`) and forge (its own modal host) — and neither exposes its modal
 * instances as an import. The established seam for reaching them is a window
 * event, which `CharacterSettings.tsx` already uses for tab switching
 * (`show-general-settings`, `show-guild-settings`). This follows that pattern
 * rather than inventing a second mechanism.
 *
 * A host that does not implement the event simply does nothing, and the card
 * still shows the navigation path as text — so the button degrades to a no-op
 * rather than to a broken promise.
 */

export const OPEN_SETTINGS_EVENT = 'assistant:open-settings';

/** Which dialog holds a key, decided by its storage prefix. */
export type SettingsSurface = 'character' | 'ui';

export interface OpenSettingsDetail {
    /** Registry-form key, e.g. `uiSettings.footerComponents`. */
    settingKey: string;
    surface: SettingsSurface;
    /**
     * The tab's own label, e.g. "Stopka" — not a tab id.
     *
     * Both dialogs define their tabs with Polish labels next to the ids, and the
     * ids are private to each component. Passing the label lets each host map it
     * with its own list, instead of this module holding a copy of both tables
     * that would silently rot when a tab is renamed.
     */
    tabLabel?: string;
}

/**
 * The tab segment of a navigation path.
 *
 * Paths are uniformly `Menu (⋮) → <dialog> → <tab> → <section>`, in both
 * dialogs, so the tab is always the third segment.
 */
export function tabLabelOf(uiLocation: string | undefined): string | undefined {
    if (!uiLocation) return undefined;
    const parts = uiLocation.split('→').map(part => part.trim()).filter(Boolean);
    return parts[2];
}

/**
 * UI-scoped slices live in the "Interfejs" dialog; everything else is a
 * character setting in the "Opcje" dialog. Derived from the storage key the
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
