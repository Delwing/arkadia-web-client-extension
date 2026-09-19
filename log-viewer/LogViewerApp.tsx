import { useCallback, useEffect, useState } from "react";
import { applyTheme, Spinner, type ThemeId } from "@design";
import { LogViewer, type LogSession, type PersistedPreferences } from "@ui/logViewer";
import { loadAllSessions } from "./sessionAdapter";

const PREFERENCES_KEY = "arkadia.logViewer.preferences";
const THEME_KEY = "arkadia.logViewer.theme";

function readPreferences(): PersistedPreferences | null {
    try {
        const raw = window.localStorage.getItem(PREFERENCES_KEY);
        return raw ? (JSON.parse(raw) as PersistedPreferences) : null;
    } catch {
        return null;
    }
}

function writePreferences(preferences: PersistedPreferences): void {
    try {
        window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
        // Private mode or a full quota: preferences are a convenience, not state
        // the viewer needs to work.
    }
}

/**
 * Standalone log browser.
 *
 * The page owns the data and the chrome; the viewer itself is the shared
 * component, so whatever is fixed here shows up in the in-client modal when
 * that lands.
 */
export default function LogViewerApp() {
    const [sessions, setSessions] = useState<LogSession[] | null>(null);
    const [preferences] = useState<PersistedPreferences | null>(() => {
        const stored = readPreferences();
        // `?session=` is how the in-client log browser opens one session in a
        // new tab; it wins over the last-viewed session from preferences.
        const requested = new URLSearchParams(window.location.search).get("session");
        if (!requested) return stored;
        return { ...(stored ?? ({} as PersistedPreferences)), sessionId: requested };
    });

    useEffect(() => {
        const root = document.getElementById("root");
        if (!root) return;
        const stored = window.localStorage.getItem(THEME_KEY);
        applyTheme(root, { theme: (stored as ThemeId | null) ?? "arkadia" });
    }, []);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            // The session being written to right now, when this page was opened
            // from a client tab that passed it along.
            const liveSessionName = new URLSearchParams(window.location.search).get("live") ?? undefined;
            const loaded = await loadAllSessions({ liveSessionName });
            if (!cancelled) setSessions(loaded);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const onPreferencesChange = useCallback((next: PersistedPreferences) => writePreferences(next), []);

    if (sessions === null) {
        return (
            <div className="lv-app__loading">
                <Spinner size="lg" />
                <span>Wczytywanie sesji...</span>
            </div>
        );
    }

    return (
        <LogViewer
            sessions={sessions}
            preferences={preferences}
            onPreferencesChange={onPreferencesChange}
        />
    );
}
