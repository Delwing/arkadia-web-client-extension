import { useCallback, useEffect, useState } from "react";
import { applyTheme, Spinner, type ThemeId } from "@design";
import { LogViewer, type LogSession, type PersistedPreferences } from "@ui/logViewer";
import { readPreferences, writePreferences } from "./preferences";
import { loadAllSessions } from "./sessionAdapter";

const THEME_KEY = "arkadia.logViewer.theme";

/**
 * Standalone log browser.
 *
 * The page owns the data and the chrome; the viewer itself is the shared
 * component, so whatever is fixed here shows up in the in-client window too
 * (`src/web/LogBrowser.tsx`), and the other way round.
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
