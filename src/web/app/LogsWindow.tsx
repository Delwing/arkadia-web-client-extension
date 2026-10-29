import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { registerMainMenuItem, unregisterMainMenuItem } from "@modules/core/mainMenuRegistry";
import { setLogSearchHandler } from "../logSearchRequest";
import { AppModal, MODAL_EVENT } from "../modals/appModal";
import { ErrorBoundary } from "./ErrorBoundary";

// Loaded on the first opening: the browser and its parsers are not needed to play.
const LogBrowser = lazy(() => import("../LogBrowser").then((m) => ({ default: m.LogBrowser })));

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
 */
export function LogsWindow() {
    const ref = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState<string | undefined>();

    useEffect(() => {
        const modalEl = ref.current!;
        const show = () => {
            setQuery(pendingQuery);
            pendingQuery = undefined;
            setOpen(true);
        };
        const hide = () => setOpen(false);
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

        return () => {
            modalEl.removeEventListener(MODAL_EVENT.show, show);
            modalEl.removeEventListener(MODAL_EVENT.hidden, hide);
            unregisterMainMenuItem("logs-button");
            setLogSearchHandler(null);
        };
    }, []);

    return (
        <div id="logs-modal" className="app-modal app-modal--logs" hidden ref={ref}>
            <div className="app-modal__dialog app-modal__dialog--xl app-modal__dialog--fill app-modal__dialog--phone-full logs-modal-dialog" tabIndex={-1}>
                {/* No header of the shell: the viewer renders its own, with the
                    session title, the export menu and the close control. */}
                <div className="app-modal__body app-modal__body--panel logs-modal-body">
                    {open && (
                        <ErrorBoundary name="LogBrowser">
                            <Suspense fallback={null}>
                                <LogBrowser initialQuery={query} />
                            </Suspense>
                        </ErrorBoundary>
                    )}
                </div>
            </div>
        </div>
    );
}
