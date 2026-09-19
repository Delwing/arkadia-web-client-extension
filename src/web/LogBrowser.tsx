/**
 * The in-client log browser.
 *
 * Since the design-system migration this is a *host*, not a screen: the log
 * reading — search, scopes, timeline, ranges, channel filters, exports — is
 * the shared `@ui/logViewer`, the same component the standalone page renders,
 * and the sessions come from `log-viewer/sessionAdapter.ts`, the one module
 * that knows about IndexedDB. What is left here is what only the client has:
 * session management (`LogManager`) and the link out to the standalone page.
 *
 * It is mounted twice and assumes nothing about its host: `logBrowserMount`
 * puts it in a design-system dialog, forge-ui puts it in its own modal shell.
 * Hence the `.ark-root` boundary it carries itself — outside one, nothing in
 * the design system has any tokens to read.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Icon, IconButton, Spinner } from "@design";
import { LogViewer, type LogSession, type PersistedPreferences } from "@ui/logViewer";
import { readPreferences, writePreferences } from "../../log-viewer/preferences";
import { loadAllSessions } from "../../log-viewer/sessionAdapter";
import { LogManager } from "./LogManager";
import { currentSessionName } from "./sessionLogger";
import "./logBrowser.css";

export interface LogBrowserProps {
    /**
     * Rendered at the right end of the viewer's header — the host's close
     * control. The viewer has no chrome of its own to hang one on.
     */
    headerTrailing?: ReactNode;
}

/** Opens the standalone page on one session, in a tab of its own. */
function openInNewTab(sessionId: string): void {
    const url = new URL("log-viewer/index.html", window.location.href);
    url.searchParams.set("session", sessionId);
    // So the page knows which log is still being written to, and badges it.
    url.searchParams.set("live", currentSessionName);
    window.open(url.toString(), "_blank");
}

export function LogBrowser({ headerTrailing }: LogBrowserProps) {
    const [sessions, setSessions] = useState<LogSession[] | null>(null);
    const [manageOpen, setManageOpen] = useState(false);
    // Bumped when the store changes underneath us (a delete or an import).
    const [reloadToken, setReloadToken] = useState(0);

    /**
     * The stored view preferences, minus the last-viewed session.
     *
     * Channels, density and the rest are worth carrying over between the two
     * hosts; *which log* is not. In the client the answer is always the one
     * being recorded right now — and it has to be, or a second tab would open
     * the browser on the first tab's session rather than its own.
     */
    const [initialPreferences] = useState<PersistedPreferences | null>(() => {
        const stored = readPreferences();
        return stored ? { ...stored, sessionId: undefined } : null;
    });
    /** The session the viewer has open, for "Nowa karta". */
    const [openSessionId, setOpenSessionId] = useState<string | undefined>();

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            // A snapshot, taken each time the window opens. The pane does not
            // stream: the game's own output is where a line is watched as it
            // arrives, and re-reading the store on every line would fight the
            // virtualizer for no gain. The session still being written to is
            // marked live all the same — that is what opens it at its end
            // rather than at the top, which is where a player wants to land.
            const loaded = await loadAllSessions({ liveSessionName: currentSessionName });
            if (!cancelled) setSessions(loaded);
        })();
        return () => {
            cancelled = true;
        };
    }, [reloadToken]);

    const onPreferencesChange = useCallback((next: PersistedPreferences) => {
        writePreferences(next);
        setOpenSessionId(next.sessionId);
    }, []);

    const reload = useCallback(() => {
        setSessions(null);
        setReloadToken((token) => token + 1);
    }, []);

    return (
        <div className="ark-root logs-browser">
            {sessions === null ? (
                <div className="logs-browser__loading">
                    <Spinner size="lg" />
                    <span>Wczytywanie sesji...</span>
                </div>
            ) : (
                <LogViewer
                    sessions={sessions}
                    preferences={initialPreferences}
                    onPreferencesChange={onPreferencesChange}
                    // Icon-only, like the session arrows at the other end of
                    // the same header: labelled, these two pushed the header
                    // past the dialog's width on a small laptop and took the
                    // close control off the edge with them.
                    headerTrailing={
                        <>
                            <IconButton
                                disabled={!openSessionId}
                                onClick={() => openSessionId && openInNewTab(openSessionId)}
                                title="Otworz ten log w nowej karcie"
                            >
                                <Icon name="open-external" />
                            </IconButton>
                            <IconButton
                                onClick={() => setManageOpen(true)}
                                title="Zarzadzanie logami: usuwanie, archiwum, import"
                            >
                                <Icon name="archive" />
                            </IconButton>
                            {headerTrailing}
                        </>
                    }
                />
            )}

            <LogManager
                open={manageOpen}
                onOpenChange={setManageOpen}
                sessions={sessions ?? []}
                onSessionsChanged={reload}
            />
        </div>
    );
}
