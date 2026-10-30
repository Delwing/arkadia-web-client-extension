import { useLayoutEffect, useRef } from "react";
import CommandLine, { type CommandLineDeps } from "@web/commandInput/CommandLine.tsx";
import { AuthOverlay, type AuthOverlayProps } from "@web/auth/AuthOverlay.tsx";
import type { ToastStackProps } from "@web/notifications/ToastStack.tsx";
import { LayoutManagerWrapper } from "@web/layout";
import type { MapBootstrap } from "@web/map/mapBootstrap.ts";
import { ErrorBoundary } from "../ErrorBoundary";
import { AppModals } from "../AppModals";
import { LogsWindow } from "../LogsWindow";
import { CompassRose } from "./CompassRose";
import { Footer } from "./Footer";
import { GameOutput } from "./GameOutput";
import { MapPane } from "./MapPane";
import { RecordingStopButton } from "./RecordingStopButton";
import { installContentAreaFocus } from "./contentAreaFocus";
import { mapHost, objectListHost, objectListOthersHost } from "./mapHosts";
import { DEFAULT_SLOT } from "@web/layout/movableHost.ts";

export interface ShellProps {
    commandLine: CommandLineDeps;
    auth: AuthOverlayProps;
    toasts: ToastStackProps | null;
    /** The map download, for the progress bar. */
    mapLoad: MapBootstrap;
}

/**
 * The page (#main-container): the content area (layout manager, map, game
 * output, compass rose), the footer, the object lists, the command line, the
 * dock hosts, the page-level windows and the login card. The element ids,
 * classes and order are the ones the stylesheets, the themes and the tests know.
 */
export function Shell({ commandLine, auth, toasts, mapLoad }: ShellProps) {
    const mainRef = useRef<HTMLDivElement>(null);
    const contentAreaRef = useRef<HTMLDivElement>(null);
    const recordingRef = useRef<HTMLButtonElement>(null);

    // Here, not in a child: a child's layout effect runs before this element's
    // refs are set, and the lists go between two of its children.
    useLayoutEffect(() => {
        installContentAreaFocus(contentAreaRef.current!);

        // The object lists' default place: straight inside #main-container (the
        // vertical-rails grid places its direct children) right after the footer,
        // whenever no layout panel shows them.
        const main = mainRef.current!;
        const detachList = objectListHost.attach(main, DEFAULT_SLOT, recordingRef.current);
        const detachOthers = objectListOthersHost.attach(main, DEFAULT_SLOT, recordingRef.current);
        return () => { detachList(); detachOthers(); };
    }, []);

    return (
        <div id="main-container" ref={mainRef}>
            <div id="content-area" ref={contentAreaRef}>
                {/* The layout manager, with every dockable popup. */}
                <div id="layout-manager-root">
                    <ErrorBoundary name="LayoutManager">
                        <LayoutManagerWrapper mapHost={mapHost} objectListHost={objectListHost} objectListOthersHost={objectListOthersHost} />
                    </ErrorBoundary>
                </div>
                <ErrorBoundary name="MapPane"><MapPane mapLoad={mapLoad} /></ErrorBoundary>
                <ErrorBoundary name="GameOutput"><GameOutput toasts={toasts} /></ErrorBoundary>
                <ErrorBoundary name="CompassRose"><CompassRose /></ErrorBoundary>
            </div>
            {/* The footer: #multi-binds and #char-state, as @web-ui/footer/layout arranges them. */}
            <Footer />
            {/* #objects-list / #objects-list-others go here, unless a layout panel holds them. */}
            <ErrorBoundary name="RecordingStopButton"><RecordingStopButton ref={recordingRef} /></ErrorBoundary>

            <span id="content-width-measure" style={{ visibility: "hidden", position: "absolute", whiteSpace: "pre" }}>M</span>
            <ErrorBoundary name="AppModals"><AppModals /></ErrorBoundary>
            {/* Command line (history, field, microphone, send, the menu). */}
            <div id="command-line-root" style={{ display: "contents" }}>
                <ErrorBoundary name="CommandLine"><CommandLine deps={commandLine} /></ErrorBoundary>
            </div>

            <div id="layout-bottom-dock-host"></div>
            {/* The side docks portal here when they span the full height (layout.css). */}
            <div id="layout-left-dock-host"></div>
            <div id="layout-right-dock-host"></div>

            {/* Logowanie: #auth-overlay and the ids password managers recognise. */}
            <ErrorBoundary name="AuthOverlay"><AuthOverlay {...auth} /></ErrorBoundary>

            {/* Logi, the log browser's window. */}
            <ErrorBoundary name="LogsWindow"><LogsWindow /></ErrorBoundary>
        </div>
    );
}
