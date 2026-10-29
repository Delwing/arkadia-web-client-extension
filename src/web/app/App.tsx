import { useAppServices } from "./appServices";
import { ErrorBoundary } from "./ErrorBoundary";
import { Shell, type ShellProps } from "./shell/Shell";
import { ContextMenuHost } from "../contextMenu";
import { suppressTitleUpdates } from "../FightTitle";
import { PlaybackControls } from "@web-ui/components";
import MobileDirectionButtons from "@web-ui/buttons/MobileDirectionButtons";
import DesktopButtons from "@web-ui/buttons/DesktopButtons";
import MobileCommandRadial from "@web-ui/buttons/MobileCommandRadial";
import MobileJoysticks from "@web-ui/buttons/MobileJoysticks";
import { WidgetLayer } from "@web-ui/widgets/WidgetLayer";
import BossKeyOverlay from "@web-ui/bossKey/BossKeyOverlay";

/** The wiring that still lives in main.ts, handed to the parts that need it. */
export type AppProps = ShellProps;

const getOutputArea = () => document.getElementById("main_text_output_msg_wrapper");

/**
 * The stock UI: the page itself, and the overlays over it, which render into
 * document.body on their own (menus, on-screen buttons, widgets, the boss key).
 * Each region has its own error boundary.
 */
export function App(props: AppProps) {
    const { client } = useAppServices();

    return (
        <>
            <Shell {...props} />

            <ErrorBoundary name="PlaybackControls"><PlaybackControls /></ErrorBoundary>
            <ErrorBoundary name="ContextMenuHost"><ContextMenuHost /></ErrorBoundary>
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
        </>
    );
}
