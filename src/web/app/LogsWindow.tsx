import { Suspense, lazy, useEffect, useRef, useState, type ComponentType } from "react";
import { Button } from "@web-ui/primitives/index.ts";
import { registerMainMenuItem, unregisterMainMenuItem } from "@modules/core/mainMenuRegistry";
import type { LogBrowserProps } from "../LogBrowser";
import { setLogManagerHandler, setLogSearchHandler } from "../logSearchRequest";
import { AppModal, MODAL_EVENT } from "../modals/appModal";
import { reloadToLatest } from "../versionCheck";
import { ErrorBoundary } from "./ErrorBoundary";

/** The browser's chunk could not be fetched: a deploy has replaced it since this page loaded. */
class LogBrowserLoadError extends Error {
    constructor(readonly reason: unknown) {
        super(`Failed to load the log browser: ${String(reason)}`);
        this.name = "LogBrowserLoadError";
    }
}

let loading: Promise<{ default: ComponentType<LogBrowserProps> }> | null = null;

/**
 * Fetches the browser once per page, for the window and the preload alike.
 *
 * A failure is final for the page: the browser keeps a module that failed to
 * fetch and rejects every later import of it without asking the network again,
 * so there is nothing to retry short of a reload.
 */
function loadLogBrowser(): Promise<{ default: ComponentType<LogBrowserProps> }> {
    // Awaited apart from the `import()`: Vite wraps the expression it sits in
    // to preload the chunk's dependencies (its CSS too), and a handler inside
    // that wrapper would miss a dependency that failed.
    loading ??= (async () => {
        try {
            const pending = import("../LogBrowser");
            const m = await pending;
            return { default: m.LogBrowser };
        } catch (error) {
            throw new LogBrowserLoadError(error);
        }
    })();
    return loading;
}

const LogBrowser = lazy(loadLogBrowser);

/**
 * How long after the window mounts the browser is fetched in the background.
 * It is not needed to play, so it waits out the startup; but a page left open
 * for hours outlives the deploy that removes its chunks, and a chunk already
 * loaded is never asked for again.
 */
const PRELOAD_DELAY_MS = 10_000;

function preloadWhenIdle(): () => void {
    let idle: number | undefined;
    const timer = window.setTimeout(() => {
        const run = () => void loadLogBrowser().catch(() => undefined);
        if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(run, { timeout: 10_000 });
        else run();
    }, PRELOAD_DELAY_MS);
    return () => {
        window.clearTimeout(timer);
        if (idle !== undefined) window.cancelIdleCallback(idle);
    };
}

/**
 * In place of a browser that failed. The window has no header of its own (the
 * browser renders the close control), so this one brings it.
 */
function LogBrowserFailed({ error }: { error: unknown }) {
    const [reloading, setReloading] = useState(false);
    const outdated = error instanceof LogBrowserLoadError;
    return (
        <div className="logs-failed">
            <button type="button" className="app-modal__close logs-failed__close" data-modal-dismiss="" title="Zamknij">&times;</button>
            <p className="logs-failed__title">
                {outdated ? "Nie udało się wczytać okna logów." : "Okno logów napotkało błąd."}
            </p>
            <p className="logs-failed__text">
                {outdated
                    ? "Klient został w międzyczasie zaktualizowany. Odśwież stronę, kiedy skończysz grać."
                    : "Odśwież stronę, kiedy skończysz grać."}{" "}
                Zapisane logi są bezpieczne.
            </p>
            <Button
                variant="solid"
                disabled={reloading}
                onClick={() => {
                    setReloading(true);
                    void reloadToLatest();
                }}
            >
                Odśwież
            </Button>
        </div>
    );
}

/** The query "Szukaj w logach" asked for, taken by the next opening. */
let pendingQuery: string | undefined;

/**
 * Logi: the log browser's window, its main-menu entry and the "Szukaj w logach"
 * handler.
 *
 * The browser is mounted only while the window is open. It lists every session
 * when it mounts, and the client must not touch the log database at startup;
 * unmounting on close also stops a listing still under way and lets go of the
 * parsed logs and the database connection underneath them, which is what lets
 * another tab create its own session (see `e2e/logs-multi-tab.spec.ts`).
 * Its code is fetched in the background a little after startup, which loads
 * nothing from the database.
 */
export function LogsWindow() {
    const ref = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState<string | undefined>();
    /** Bumped by each "open on Zarządzaj" request; the browser opens its manager on a change. */
    const [manageRequest, setManageRequest] = useState(0);

    useEffect(() => preloadWhenIdle(), []);

    useEffect(() => {
        const modalEl = ref.current!;
        const show = () => {
            setQuery(pendingQuery);
            pendingQuery = undefined;
            setOpen(true);
        };
        const hide = () => {
            setOpen(false);
            // A request is for the opening it came with, not every later one.
            setManageRequest(0);
        };
        modalEl.addEventListener(MODAL_EVENT.show, show);
        modalEl.addEventListener(MODAL_EVENT.hidden, hide);

        const openWindow = () => AppModal.for(modalEl).show();
        registerMainMenuItem({
            id: "logs-button",
            label: "Logi",
            group: "narzedzia",
            icon: "file-text",
            order: 170,
            source: "builtin",
            onSelect: openWindow,
        });
        setLogSearchHandler((nextQuery) => {
            pendingQuery = nextQuery;
            openWindow();
        });
        setLogManagerHandler(() => {
            setManageRequest((count) => count + 1);
            openWindow();
        });

        return () => {
            modalEl.removeEventListener(MODAL_EVENT.show, show);
            modalEl.removeEventListener(MODAL_EVENT.hidden, hide);
            unregisterMainMenuItem("logs-button");
            setLogSearchHandler(null);
            setLogManagerHandler(null);
        };
    }, []);

    return (
        <div id="logs-modal" className="app-modal app-modal--logs" hidden ref={ref}>
            <div className="app-modal__dialog app-modal__dialog--xl app-modal__dialog--fill app-modal__dialog--phone-full logs-modal-dialog" tabIndex={-1}>
                {/* No header of the shell: the viewer renders its own, with the
                    session title, the export menu and the close control. */}
                <div className="app-modal__body app-modal__body--panel logs-modal-body">
                    {open && (
                        <ErrorBoundary name="LogBrowser" fallback={(error) => <LogBrowserFailed error={error} />}>
                            <Suspense fallback={null}>
                                <LogBrowser initialQuery={query} manageRequest={manageRequest} />
                            </Suspense>
                        </ErrorBoundary>
                    )}
                </div>
            </div>
        </div>
    );
}
