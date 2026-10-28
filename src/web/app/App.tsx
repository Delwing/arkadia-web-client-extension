import { useAppServices } from "./appServices";
import { Island } from "./Island";
import { AppModals } from "./AppModals";
import { RecordingStopButton } from "./shell/RecordingStopButton";
import CommandLine, { type CommandLineDeps } from "../commandInput/CommandLine";
import { AuthOverlay, type AuthOverlayProps } from "../auth/AuthOverlay";
import { ToastStack, type ToastStackProps } from "../notifications/ToastStack";
import { LayoutManagerWrapper } from "../layout";
import { ContextMenuHost } from "../contextMenu";
import { suppressTitleUpdates } from "../FightTitle";
import { LocationLabel } from "@web-ui/components/map/LocationLabel";
import { PauseIcon } from "@web-ui/components/map/PauseIcon";
import { MapLostBadge } from "@web-ui/components/map/MapLostBadge";
import { PlaybackControls } from "@web-ui/components";
import StockFooter from "@web-ui/footer/layout/StockFooter";
import MobileDirectionButtons from "@web-ui/buttons/MobileDirectionButtons";
import DesktopButtons from "@web-ui/buttons/DesktopButtons";
import MobileCommandRadial from "@web-ui/buttons/MobileCommandRadial";
import MobileJoysticks from "@web-ui/buttons/MobileJoysticks";
import { WidgetLayer } from "@web-ui/widgets/WidgetLayer";
import BossKeyOverlay from "@web-ui/bossKey/BossKeyOverlay";

/** The wiring that still lives in main.ts, handed to the parts that need it. */
export interface AppProps {
    commandLine: CommandLineDeps;
    auth: AuthOverlayProps;
    /** Absent when the page has no #notification-center. */
    toasts: ToastStackProps | null;
}

const getOutputArea = () => document.getElementById("main_text_output_msg_wrapper");

/**
 * The stock UI's React tree. Each island renders into the index.html element it
 * always had (or portals itself), so the page's DOM and CSS are unchanged; what
 * changes is that they share one root and the services context.
 */
export function App({ commandLine, auth, toasts }: AppProps) {
    const { client } = useAppServices();

    return (
        <>
            {/* Map chrome. Each asks the map for its current state on mount. */}
            <Island name="LocationLabel" target="location-text"><LocationLabel /></Island>
            <Island name="PauseIcon" target="pause-icon"><PauseIcon /></Island>
            <Island name="MapLostBadge" target="map-lost-wrapper"><MapLostBadge /></Island>

            <Island name="CommandLine" target="command-line-root"><CommandLine deps={commandLine} /></Island>
            {toasts && <Island name="Toasts" target="notification-center"><ToastStack {...toasts} /></Island>}

            {/* Logowanie: the card over the game while offline. */}
            <Island name="AuthOverlay" target="auth-root"><AuthOverlay {...auth} /></Island>

            <Island name="RecordingStopButton" target="recording-button-root"><RecordingStopButton /></Island>

            {/* The footer: the location binds and the status line, as the footer layout arranges them. */}
            <Island name="StockFooter" target="footer-layout"><StockFooter /></Island>

            {/* These portal themselves to document.body. */}
            <Island name="PlaybackControls"><PlaybackControls /></Island>
            <Island name="ContextMenuHost"><ContextMenuHost /></Island>
            <Island name="MobileDirectionButtons"><MobileDirectionButtons client={client} /></Island>
            <Island name="DesktopButtons"><DesktopButtons client={client} /></Island>
            <Island name="MobileCommandRadial"><MobileCommandRadial client={client} /></Island>
            <Island name="MobileJoysticks"><MobileJoysticks client={client} /></Island>
            {/* Widgets over the game output (Zegar, Witalne…). */}
            <Island name="WidgetLayer"><WidgetLayer getArea={getOutputArea} /></Island>
            {/* Boss key: Pause / ScrollLock drops a fake Word window over the whole
                client, freezing the "Arkadia [5/7]" tab title while it is up. */}
            <Island name="BossKeyOverlay">
                <BossKeyOverlay client={client} soundControl={client.SoundManager} suppressTitle={suppressTitleUpdates} />
            </Island>

            {/* The page-level windows (Ustawienia, Klawisze, Miejsca…). */}
            <Island name="AppModals" target="app-modals"><AppModals /></Island>

            {/* The layout manager, with every dockable popup. */}
            <Island name="LayoutManager" target="layout-manager-root">
                <LayoutManagerWrapper
                    mapElement={document.getElementById("map")}
                    objectListElement={document.getElementById("objects-list")}
                    objectListOthersElement={document.getElementById("objects-list-others")}
                />
            </Island>
        </>
    );
}
