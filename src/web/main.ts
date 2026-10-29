// Component sheets that come BEFORE the base and the themes, so the page's own
// rules win ties with them (footer.css's .footer-buttons__panel over popups.css's
// .popup-popover, for one). They used to land there by accident: forge-ui shared
// them, so Rollup split them into chunks loaded ahead of client.css. Imported here
// first, Rollup emits each where it is first imported, which pins that order
// whatever the other entries share. Keep new component sheets out of this list
// unless they need to lose to the base.
import './documentation/docs.css'
import './CombatStatusPopup.css'
import './CoverDebugPopup.css'
import './LineInspectorPopup.css'
import './WorldTimePopup.css'
import './knowledge/knowledge.css'
import './automation/automation.css'
import '@web-ui/footer/chip.css'
import '@web-ui/bossKey/bossKey.css'
import '@web-ui/messageFlair.css'
import './pluginLabelIcon.css'
import './popups/popups.css'
import './options/footerEditor/footerEditor.css'
import './settings/settingsDialog.css'
import './uiSettings/palettePreview.css'
import './keys/keys.css'
// The document base + style.css + colour themes + layout.css, @imported into one
// chunk (main-theme.css) to lock the stock cascade order — see that file for why.
import './main-theme.css'
import '@web-ui/buttons/desktopButtons.css'
import '@web-ui/buttons/mobileCommandRadial.css'
import '@web-ui/buttons/mobileDirectionButtons.css'
import '@web-ui/buttons/mobileJoysticks.css'
// The Kuźnia theme's skin, after the window and button sheets it re-skins.
import './themes/forged/shell.css'
import './themes/forged/windows.css'
import './themes/forged/buttons.css'
import './themes/forged/footer.css'
import './themes/forged/output.css'
import './themes/forged/login.css'
import mudClient from "./MudClient.ts";
import {
    DEFAULT_SESSION_PROXY_URL,
    isResumeNoticeEnabled,
    setResumeNoticeEnabled,
} from "./proxySession.ts";
import {startConnection} from "./connection/startConnection";
import {applyInitialLocation} from "./platform/initialLocation";
import eventBus from "@modules/core/eventBus";
import {installLongPressContextMenu} from "@shared/dom/longPressContextMenu.ts";
import {isIOS} from "@shared/dom/mobileOs.ts";
import {openWindow} from './modals/pageWindows';
import {shareLocation} from "./locationShare/locationShare";
import ObjectList from "./ObjectList";
import FightTitle from "./FightTitle";
import HpTitle from "./HpTitle";
import { registerBuiltinWidgets } from "@web-ui/widgets/builtinWidgets";
import { setWidgetEditMode } from "@modules/core/widgetLayout";
import {getRenderSettings, onRenderSettingsChange} from "@modules/core/settings";

import "@client/main.ts"
import {bootstrapMap} from "./map/mapBootstrap";
import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {applyDefaultLayoutMode, setRailSpanSupported} from "@web/layout"
import {bufferOutputUntilMounted} from "./app/shell/outputHandle";
import {registerBuiltinMainMenu} from "./menu/mainMenu";
import {harvestOutputLines} from "./commandInput/outputWords";
import {installClientPorts} from "./installClientPorts";
import {bootstrapGameClient} from "./clientBootstrap";
import {setupToasts} from "./notifications/setupToasts";
import type {CommandLineDeps} from "./commandInput/CommandLine";
import {prepareStockFooter} from "@web-ui/footer/prepareStockFooter.tsx";
import {App, type AppProps} from "./app/App";
import {mapHost, objectListHost, objectListOthersHost} from "./app/shell/mapHosts";
import {AppProviders} from "./app/AppProviders";
import {initTextToSpeech} from "./voice/textToSpeech.ts";

// Build the client and wire all UI-agnostic startup concerns (migrations,
// scripts, session logging, Firebase sync, helper, sendCommand/NPC bridges)
// through the shared bootstrap. Port implementations are the one UI-specific
// piece, injected here before scripts run.
const { client, helperConnection } = bootstrapGameClient({ installPorts: installClientPorts });

applyInitialLocation(client);

// What the client prints before the output area renders is shown once it does
// (GameOutput sets up the output engine when it mounts).
bufferOutputUntilMounted(mudClient);
const getOutputWrapper = () => document.getElementById('main_text_output_msg_wrapper') as HTMLElement;

// iOS has no long-press contextmenu of its own; every right-click menu needs one.
if (isIOS()) installLongPressContextMenu();

// Map data and colours load in the background; MapPane shows the download.
const mapBootstrap = bootstrapMap(client, mapHost);

// Connecting, the e-mail account, the wake lock, and the command line's and the
// menu's view of the connection (see connection/startConnection.ts).
const { connection, accountSession, refreshConnectionView, focusCommandLine } = startConnection(client, mudClient);

document.addEventListener('DOMContentLoaded', () => {
    // Desktop gets the window manager by default (one-time flip). Must run
    // before anything reads the layout state — panels and popups decide
    // whether to auto-open from it.
    applyDefaultLayoutMode();
    // The shell renders #layout-left/right-dock-host, so the player may let the
    // side docks span the full height (Okna → Menedżer Okien). Must run before
    // the LayoutProvider mounts.
    setRailSpanSupported(true);

    let clearInputOnSend = getRenderSettings().clearInputOnSend;
    onRenderSettingsChange((render) => {
        clearInputOnSend = render.clearInputOnSend;
    });
    const commandLineDeps: CommandLineDeps = {
        getOutputWrapper,
        sendCommand: (cmd, echo, opts, skip, fromUser) => client.sendCommand(cmd, echo, opts, skip, fromUser),
        isPasswordMode: () => mudClient.isPasswordMode(),
        getCommandLineSuggestions: () => client.commandLineSuggestions ?? [],
        getClearInputOnSend: () => clearInputOnSend,
        // What is on screen is the vocabulary the recogniser lacks.
        getVoiceVocabulary: () => [...harvestOutputLines(getOutputWrapper()), ...(client.commandLineSuggestions ?? [])],
    };

    initTextToSpeech(client);

    const toasts = setupToasts(client);

    registerBuiltinMainMenu({
        openModal: openWindow,
        shareLocation: () => shareLocation(client.Map.currentRoom?.id),
        isConnected: () => connection.getState().connected,
        toggleConnection: () => connection.toggle(),
    });
    // The menu's Połącz/Rozłącz now exists to show the connection.
    refreshConnectionView();

    // The login screen's connection footer: the mode (direct / helper / proxy),
    // what the helper is doing, and each mode's settings (proxy URL, MCCP).
    const proxyControlsProps: AppProps['auth']['proxyControls'] = {
        defaultProxy: DEFAULT_SESSION_PROXY_URL,
        initialResumeNotice: isResumeNoticeEnabled(),
        onResumeNoticeChange: (enabled: boolean) => setResumeNoticeEnabled(enabled),
        initialMode: mudClient.getProxyMode(),
        initialUrl: mudClient.getUserProxyUrl() ?? '',
        onModeChange: (mode) => {
            mudClient.setProxyMode(mode);
            refreshConnectionView();
        },
        onUrlChange: (url: string) => mudClient.setUserProxyUrl(url),
        onUseProxy: (url: string) => {
            mudClient.setUserProxyUrl(url);
            mudClient.setProxyMode('proxy');
        },
        initialMccp: mudClient.isMccpEnabled(),
        onMccpChange: (enabled: boolean) => mudClient.setMccpEnabled(enabled),
        helper: helperConnection,
        onHelperHelp: () => openWindow('helper'),
    };

    const fightTitle = new FightTitle();
    new HpTitle(fightTitle);
    new ObjectList(client, {list: objectListHost.element, others: objectListOthersHost.element});

    prepareStockFooter();
    registerBuiltinWidgets();
    eventBus.on('widgets.edit', ({ on }) => setWidgetEditMode(on));

    // The whole page, as one React tree, into #root. Synchronously, so the page is
    // complete when start-up finishes.
    const appRoot = createRoot(document.getElementById('root')!);
    flushSync(() => appRoot.render(createElement(
        AppProviders,
        {services: {client, helperConnection, connection, accountSession}},
        createElement(App, {
            commandLine: commandLineDeps,
            auth: {
                proxyControls: proxyControlsProps,
                getProxyMode: () => mudClient.getProxyMode(),
                // Dismissing the login screen without connecting leaves the command
                // line as the place to type, same as after a connect.
                onDismissed: focusCommandLine,
            },
            toasts,
            mapLoad: mapBootstrap,
        }),
    )));
});

window.client = mudClient;
