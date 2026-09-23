import { useCallback, useEffect, useState } from "react";
import { LogViewer, Spinner, type LogSessionInfo, type PersistedPreferences } from "@ui/logViewer";
import { readPreferences, writePreferences } from "./preferences";
import { createSessionSource, type ListProgress, type SessionSource } from "./sessionAdapter";

/**
 * Standalone log browser.
 *
 * The page owns the data and the chrome; the viewer itself is the shared
 * component, so whatever is fixed here shows up in the in-client window too
 * (`src/web/LogBrowser.tsx`), and the other way round.
 *
 * This page reads the log database and never writes to it, so it has no import
 * of its own: an empty store here means opening the client's Logi window. That
 * is stated in the viewer's empty state rather than hidden behind a button
 * that cannot work.
 */
export default function LogViewerApp() {
    const [sessions, setSessions] = useState<LogSessionInfo[] | null>(null);
    const [listing, setListing] = useState<ListProgress | null>(null);
    const [source, setSource] = useState<SessionSource | null>(null);
    const [preferences] = useState<PersistedPreferences | null>(() => {
        const stored = readPreferences();
        // `?session=` is how the in-client log browser opens one session in a
        // new tab; it wins over the last-viewed session from preferences.
        const requested = new URLSearchParams(window.location.search).get("session");
        if (!requested) return stored;
        return { ...(stored ?? ({} as PersistedPreferences)), sessionId: requested };
    });

    useEffect(() => {
        // The session being written to right now, when this page was opened
        // from a client tab that passed it along.
        const liveSessionName = new URLSearchParams(window.location.search).get("live") ?? undefined;
        // The session the page opens on is listed first; the rest join the
        // list as they are indexed.
        const created = createSessionSource({ liveSessionName, priority: [preferences?.sessionId, liveSessionName] });
        const controller = new AbortController();
        setSource(created);
        setListing({ done: 0, total: 0 });
        created
            .list((partial, progress) => {
                if (controller.signal.aborted) return;
                setSessions(partial);
                setListing(progress);
            }, controller.signal)
            .then((all) => {
                if (controller.signal.aborted) return;
                setSessions(all);
                setListing(null);
            })
            .catch((error: unknown) => {
                console.error("[Logs] Failed to list sessions:", error);
                if (controller.signal.aborted) return;
                setSessions((previous) => previous ?? []);
                setListing(null);
            });
        return () => {
            controller.abort();
            created.release();
        };
    }, []);

    const loadSession = useCallback(
        (id: string) => (source ? source.load(id) : Promise.resolve(null)),
        [source],
    );

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
            loadSession={loadSession}
            loading={listing}
            preferences={preferences}
            onPreferencesChange={onPreferencesChange}
            noSessionsAction={
                <span className="lv-app__hint">
                    Logi sa zapisywane przez klienta. Zaimportowac je mozna w oknie „Logi” w kliencie.
                </span>
            }
        />
    );
}
