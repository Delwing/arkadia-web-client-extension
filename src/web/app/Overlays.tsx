import { useAppServices } from "./appServices";
import { ErrorBoundary } from "./ErrorBoundary";
import { AfterFirstPaint } from "@web-ui/afterFirstPaint.tsx";
import { ContextMenuHost } from "../contextMenu";
import { suppressTitleUpdates } from "../FightTitle";
import { PlaybackControls } from "@web-ui/components";
import MobileDirectionButtons from "@web-ui/buttons/MobileDirectionButtons";
import DesktopButtons from "@web-ui/buttons/DesktopButtons";
import MobileCommandRadial from "@web-ui/buttons/MobileCommandRadial";
import MobileJoysticks from "@web-ui/buttons/MobileJoysticks";
import { WidgetLayer } from "@web-ui/widgets/WidgetLayer";
import BossKeyOverlay from "@web-ui/bossKey/BossKeyOverlay";

const getOutputArea = () => document.getElementById("main_text_output_msg_wrapper");

/**
 * What floats over the page: menus, on-screen buttons, widgets, the boss key
 * (each renders into document.body on its own), and the two tooltips the map
 * notes and the hover cards draw into.
 */
export function Overlays() {
    const { client } = useAppServices();

    return (
        <>
            <ErrorBoundary name="ContextMenuHost"><ContextMenuHost /></ErrorBoundary>
            {/* Mounted a frame late, so they do not hold up the first paint (afterFirstPaint). */}
            <AfterFirstPaint>
                <ErrorBoundary name="PlaybackControls"><PlaybackControls /></ErrorBoundary>
                <ErrorBoundary name="MobileDirectionButtons"><MobileDirectionButtons client={client} /></ErrorBoundary>
                <ErrorBoundary name="DesktopButtons"><DesktopButtons client={client} /></ErrorBoundary>
                <ErrorBoundary name="MobileCommandRadial"><MobileCommandRadial client={client} /></ErrorBoundary>
                <ErrorBoundary name="MobileJoysticks"><MobileJoysticks client={client} /></ErrorBoundary>
                {/* Widgets over the game output (Zegar, Witalne…). */}
                <ErrorBoundary name="WidgetLayer"><WidgetLayer getArea={getOutputArea} /></ErrorBoundary>
                {/* Boss key: Pause / ScrollLock drops a fake Word window over the whole
                    client, freezing the "Arkadia [5/7]" tab title while it is up. */}
                <ErrorBoundary name="BossKeyOverlay">
                    <BossKeyOverlay client={client} soundControl={client.SoundManager} suppressTitle={suppressTitleUpdates} />
                </ErrorBoundary>
            </AfterFirstPaint>
            {/* Filled by src/web/mapNoteTooltip.ts and src/shared/dom/tooltip.ts. */}
            <div id="map-note-tooltip" className="map-note-tooltip"></div>
            <div id="hover-tooltip" className="hover-tooltip"></div>
        </>
    );
}
