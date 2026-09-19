/**
 * Where the viewer's view preferences live.
 *
 * One key, shared by both hosts: the standalone page and the in-client window
 * are the same screen, so channel filters, density, wrapping and the search
 * scope should not have to be set twice. Opening a log in a new tab therefore
 * lands on the view you already had.
 *
 * Plain `localStorage` rather than `TypedStorage`: the standalone page is its
 * own entry point with no character context, and these are a convenience, not
 * state the viewer needs in order to work.
 */
import type { PersistedPreferences } from "@ui/logViewer";

const PREFERENCES_KEY = "arkadia.logViewer.preferences";

export function readPreferences(): PersistedPreferences | null {
    try {
        const raw = window.localStorage.getItem(PREFERENCES_KEY);
        return raw ? (JSON.parse(raw) as PersistedPreferences) : null;
    } catch {
        return null;
    }
}

export function writePreferences(preferences: PersistedPreferences): void {
    try {
        window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
        // Private mode or a full quota: preferences are a convenience, not state
        // the viewer needs to work.
    }
}
