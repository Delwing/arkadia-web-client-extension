/**
 * The in-client log browser.
 *
 * This is a *host*, not a screen: the log reading — search, scopes, timeline,
 * ranges, channel filters, exports — is `@ui/logViewer`, the same component the
 * standalone page renders, and the sessions come from
 * `log-viewer/sessionAdapter.ts`, the one module that knows about IndexedDB.
 * What is left here is what only the client has: session management
 * (`LogManager`) and the link out to the standalone page.
 *
 * It is mounted twice and assumes nothing about its host: `logBrowserMount`
 * puts it in stock's Bootstrap modal, forge-ui puts it in its own modal shell.
 * The viewer brings its own palette (`lv-theme`), so neither host has to
 * provide one.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button, Icon, IconButton, LogViewer, MenuItem, Spinner } from "@ui/logViewer";
import type { LogSessionInfo, PersistedPreferences } from "@ui/logViewer";
import { readPreferences, writePreferences } from "../../log-viewer/preferences";
import { createSessionSource, type ListProgress, type SessionSource } from "../../log-viewer/sessionAdapter";
import { useLogsMigration } from "../../log-viewer/useLogsMigration";
import { LogManager } from "./LogManager";
import { currentSessionName } from "./sessionLogger";
import "./logBrowser.css";

export interface LogBrowserProps {
    /**
     * Rendered at the right end of the viewer's header — the host's close
     * control. The viewer has no chrome of its own to hang one on.
     */
    headerTrailing?: ReactNode;
    /** Opens with this in the search box ("Szukaj w logach"). */
    initialQuery?: string;
}

/** Opens the standalone page on one session, in a tab of its own. */
function openInNewTab(sessionId: string): void {
    const url = new URL("log-viewer/index.html", window.location.href);
    url.searchParams.set("session", sessionId);
    // So the page knows which log is still being written to, and badges it.
    url.searchParams.set("live", currentSessionName);
    window.open(url.toString(), "_blank");
}

export function LogBrowser({ headerTrailing, initialQuery }: LogBrowserProps) {
    /**
     * True inside stock's Bootstrap window, false under forge, which hosts the
     * same component in a shell of its own and supplies its own close control.
     */
    const [inStockModal] = useState(() => Boolean(document.getElementById("logs-modal")));
    const [sessions, setSessions] = useState<LogSessionInfo[] | null>(null);
    /** Set while the list is still being built; the manager waits for it. */
    const [listing, setListing] = useState<ListProgress | null>(null);
    const [source, setSource] = useState<SessionSource | null>(null);
    const [manageOpen, setManageOpen] = useState(false);
    /** Set when the manager should open straight on the file picker. */
    const [importOnOpen, setImportOnOpen] = useState(false);
    // Bumped when the store changes underneath us (a delete or an import).
    const [reloadToken, setReloadToken] = useState(0);

    /**
     * The stored view preferences, minus the last-viewed session.
     *
     * Channels, wrapping and the rest are worth carrying over between the two
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
        // A snapshot, taken each time the window opens. The pane does not
        // stream: the game's own output is where a line is watched as it
        // arrives, and re-reading the store on every line would fight the
        // virtualizer for no gain. The session still being written to is
        // marked live all the same — that is what opens it at its end rather
        // than at the top, which is where a player wants to land. The session
        // being recorded is listed first; older ones join as they are indexed.
        //
        // Closing the window (or a reload) stops the listing and lets go of
        // every parsed log: nothing of a large store outlives the window.
        const created = createSessionSource({ liveSessionName: currentSessionName, priority: [currentSessionName] });
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
    }, [reloadToken]);

    const loadSession = useCallback(
        (id: string) => (source ? source.load(id) : Promise.resolve(null)),
        [source],
    );

    const onPreferencesChange = useCallback((next: PersistedPreferences) => {
        writePreferences(next);
        setOpenSessionId(next.sessionId);
    }, []);

    const reload = useCallback(() => {
        setSessions(null);
        setReloadToken((token) => token + 1);
    }, []);

    // Old logs are listed once they have moved to the new store, not before;
    // until then the list says they are on their way. Listing again keeps the
    // viewer (and the log open in it) mounted, unlike `reload`.
    const relist = useCallback(() => setReloadToken((token) => token + 1), []);
    const migration = useLogsMigration(relist);
    const migrationNotice =
        migration === null
            ? undefined
            : migration === "pending"
              ? "Przenoszenie starszych logów do nowej bazy... Pojawią się tu po zakończeniu."
              : `Przenoszenie starszych logów do nowej bazy: ${migration.done} z ${migration.total}. Pojawią się tu po zakończeniu.`;

    const openManager = useCallback((startImport: boolean) => {
        setImportOnOpen(startImport);
        setManageOpen(true);
    }, []);

    // Stock's window has no header of the shell, so its close control lives
    // here, in the header and on the loading screen alike; the shell closes on
    // any [data-modal-dismiss] inside it. Under forge, where there is no
    // `#logs-modal`, the host's own shell carries one.
    const closeControl = inStockModal ? (
        <IconButton id="logs-close" data-modal-dismiss title="Zamknij  Esc">
            <Icon name="close" />
        </IconButton>
    ) : null;

    return (
        <div className="lv-theme logs-browser">
            {sessions === null ? (
                <div className="logs-browser__loading">
                    {/* The listing can take a while on a large store; closing
                        unmounts the browser, which aborts it. */}
                    {closeControl ? <div className="logs-browser__loading-close">{closeControl}</div> : null}
                    <Spinner size="lg" />
                    <span>Wczytywanie sesji...</span>
                </div>
            ) : (
                <LogViewer
                    sessions={sessions}
                    loadSession={loadSession}
                    loading={listing}
                    preferences={initialPreferences}
                    initialQuery={initialQuery}
                    listNotice={migrationNotice}
                    onPreferencesChange={onPreferencesChange}
                    // With no logs at all the viewer has nothing to offer, but
                    // this host does: importing is the one thing that gets a
                    // player out of an empty store.
                    noSessionsAction={
                        <Button variant="solid" icon={<Icon name="import" size={14} />} onClick={() => openManager(true)}>
                            Zaimportuj logi z pliku
                        </Button>
                    }
                    menuExtra={
                        <MenuItem
                            disabled={!openSessionId}
                            onSelect={() => openSessionId && openInNewTab(openSessionId)}
                        >
                            Otwórz w nowej karcie
                        </MenuItem>
                    }
                    // Labelled: an archive icon alone did not say "delete or
                    // import logs". It fits now that copying and exporting are
                    // one menu; on a phone the label goes and the icon stays.
                    headerTrailing={
                        <>
                            <Button
                                size="sm"
                                icon={<Icon name="archive" size={14} />}
                                // Deleting or importing reloads the list; not
                                // while it is still being built.
                                disabled={listing !== null}
                                onClick={() => openManager(false)}
                                title={
                                    listing
                                        ? "Zarządzanie logami - dostępne po wczytaniu listy"
                                        : "Zarządzanie logami: usuwanie, archiwum, import"
                                }
                            >
                                <span className="lv-hide-narrow">Zarządzaj</span>
                            </Button>
                            {headerTrailing}
                            {closeControl ? (
                                <>
                                    {/* Sets the window's own control apart from
                                        the log actions; between the two actions
                                        it split a pair that belongs together. */}
                                    <div className="lv-divider--vertical lv-hide-narrow" />
                                    {closeControl}
                                </>
                            ) : null}
                        </>
                    }
                />
            )}

            <LogManager
                open={manageOpen}
                onOpenChange={setManageOpen}
                startImport={importOnOpen}
                sessions={sessions ?? []}
                onSessionsChanged={reload}
            />
        </div>
    );
}
