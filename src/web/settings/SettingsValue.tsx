/** Marks the element {@link SettingsValue} renders; search skips it. */
export const SETTINGS_VALUE_ATTR = "data-settings-value";

/**
 * Puts an editor's whole value on its page as hidden text, for unsaved-change
 * detection (see settingsDirty.ts), which only sees what is rendered. Editors
 * that show one item at a time (a button's config popup, a selected button's
 * form) render most of their value nowhere once the item is closed; they mark
 * their controls `data-settings-ignore` and render this instead.
 */
export function SettingsValue({ value }: { value: unknown }) {
    return <span hidden {...{ [SETTINGS_VALUE_ATTR]: "" }}>{JSON.stringify(value)}</span>;
}
