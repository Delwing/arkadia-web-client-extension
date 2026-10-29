// The document base + style.css + colour themes + layout.css, @imported into one
// chunk (main-theme.css) to lock the stock cascade order — see that file for why.
import './main-theme.css'
import './popups/popups.css'
import '@web-ui/messageFlair.css'
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
import {ConnectionController} from "./connection/connectionController";
import {WakeLock} from "./platform/wakeLock";
import {applyInitialLocation} from "./platform/initialLocation";
import {OPEN_SETTINGS_EVENT} from "./assistant/openSettings.ts";
import {AccountSession} from "./account/accountSession";
import eventBus from "@modules/core/eventBus";
import {installLongPressContextMenu} from "@shared/dom/longPressContextMenu.ts";
import {isIOS} from "@shared/dom/mobileOs.ts";
import {AppModal} from './modals/appModal';
import ObjectList from "./ObjectList";
import FightTitle from "./FightTitle";
import HpTitle from "./HpTitle";
import { registerBuiltinWidgets } from "@web-ui/widgets/builtinWidgets";
import { setWidgetEditMode } from "@modules/core/widgetLayout";
import {
    getRenderSettings,
    getShellSettings,
    onRenderSettingsChange,
    onShellSettingsChange,
} from "@modules/core/settings";

import "@client/main.ts"
import {bootstrapMap} from "./map/mapBootstrap";
import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {CLOSE_SETTINGS_EVENT, OPEN_SETTINGS_PAGE_EVENT, requestSettingsCategory, type OpenSettingsPageDetail} from "./settings/categories.ts";
import { OPEN_PLACE_EVENT, openPlace } from "./places/placesData.ts"
import {applyDefaultLayoutMode, setRailSpanSupported} from "@web/layout"
import {setOutputTimestampVisibility} from "@shared/dom/outputMessageHandler";
import {bufferOutputUntilMounted, getOutputHandler} from "./app/shell/outputHandle";
import {createCharPlaqueFeed} from "@shared/dom/charPlaque";
import {isMobileLikeViewport} from "@shared/dom/pointerEnvironment.ts";
import {setConnectionOffline, setConnectionStatus, setReconnectHandler} from "./commandInput/connectionView";
import {updateMainMenuItem} from "@modules/core/mainMenuRegistry";
import {registerBuiltinMainMenu, type MainMenuModal} from "./menu/mainMenu";
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

// The client seeds `binds` from the active keymap itself (KeyBindingManager),
// so any UI — including this one — picks up keybinds without a UI-side step.

// Build the client and wire all UI-agnostic startup concerns (migrations,
// scripts, session logging, Firebase sync, helper, sendCommand/NPC bridges)
// through the shared bootstrap. Port implementations are the one UI-specific
// piece, injected here before scripts run.
const { client, helperConnection } = bootstrapGameClient({ installPorts: installClientPorts });



applyInitialLocation(client);

// Keep a phone from sleeping the tab while connected (the wake-lock setting).
const wakeLock = new WakeLock();

// What the client prints before the output area renders is shown once it does
// (GameOutput sets up the output engine when it mounts).
bufferOutputUntilMounted(mudClient);
const getOutputWrapper = () => document.getElementById('main_text_output_msg_wrapper') as HTMLElement;

setOutputTimestampVisibility(getRenderSettings().showTimestamps);
onRenderSettingsChange((render) => {
    setOutputTimestampVisibility(render.showTimestamps);
});

// The character's plaque, once per character on login (Wygląd -> wizytówka).
const showCharPlaque = createCharPlaqueFeed((node, rebuild) => getOutputHandler()?.appendNode(node, rebuild));
eventBus.on('gmcp.char.info', (info) => {
    if (getRenderSettings().characterPlaque) showCharPlaque(info);
});

// iOS has no long-press contextmenu of its own; every right-click menu needs one.
if (isIOS()) installLongPressContextMenu();


// Middle-mouse-click-opens-radial-menu now lives inside the shared
// MobileCommandRadial component itself (src/ui/web/buttons) — it wires its
// own mousedown listener onto the content area.

// Map data and colours load in the background; MapPane shows the download.
const mapBootstrap = bootstrapMap(client, mapHost);

// The connection lifecycle (connect, autologin, reattach through the session
// proxy, checks on returning to the tab) lives in the controller; this file only
// renders its state onto the login screen and buttons.
const connection = new ConnectionController({
    connect: () => mudClient.connect(),
    disconnect: () => mudClient.disconnect(),
    isSocketOpen: () => mudClient.isSocketOpen(),
    checkConnection: () => mudClient.checkConnection(),
    sendGmcp: (path, payload) => mudClient.sendGmcp(path, payload),
    usesSessionProxy: () => mudClient.usesSessionProxy(),
    lastCloseCause: () => mudClient.lastCloseCause,
    prepareSounds: () => client.prepareSounds(),
    send: (text, echo, options) => client.send(text, echo, options),
    println: (text) => client.println(text),
    isResumeNoticeEnabled,
    on: (event, handler) => eventBus.on(event, handler),
    isSafari: /^((?!chrome|chromium|edg|android).)*safari/i.test(navigator.userAgent),
});
connection.start();

/*
Konto: logging in by e-mail, creating an account and a character over GMCP.
Only the direct connection speaks it (see account/accountProtocol.ts), and
while it runs the login card stays up over the live connection.
*/
const accountSession = new AccountSession({
    sendGmcp: (path, payload) => mudClient.sendGmcp(path, payload ?? ''),
    onGmcp: (path, listener) => {
        const event = `gmcp.${path}` as const;
        mudClient.on(event, listener);
        return () => mudClient.off(event, listener);
    },
    whenReady: (run) => connection.whenGameReady(run),
    disconnect: () => connection.leaveAccount(),
}, {
    onLoginFailed: (message) => connection.accountLoginFailed(message),
    onEnteredGame: () => {
        updateConnectButtons();
        if (!isMobileLikeViewport()) document.getElementById('message-input')?.focus();
    },
});
connection.subscribe(() => updateConnectButtons());
connection.onLeftGame(() => accountSession.reset());

connection.onConnected(() => {
    eventBus.emit('refreshPositionWhenAble');
    if (getShellSettings().wakeLock !== false) {
        wakeLock.activate();
    }
    console.log('Client connected to Arkadia server.');
});
connection.onSessionLost(() => wakeLock.deactivate());

// The command line's connection view and the menu's Połącz/Rozłącz follow the
// connection; the login card (AuthOverlay) renders the same state itself.
function updateConnectButtons() {
    const {connected, connecting, disconnecting, authClosed} = connection.getState();

    // Offline with the login screen dismissed: the command line shows the closed
    // connection and offers to reconnect in place of the send button.
    setConnectionOffline(!connected && !connecting && authClosed);
    setConnectionStatus(connected ? 'connected' : connecting ? 'connecting' : 'disconnected', mudClient.getProxyMode());

    updateMainMenuItem('disconnect-button', connected
        ? { label: 'Rozłącz', disabled: disconnecting, tone: 'danger' }
        : { label: 'Połącz', disabled: connecting, tone: undefined });
}



// Direction (numpad movement) keybinds and the `binds` seed now live in the
// client (src/client/scripts/directionBinds.ts + KeyBindingManager), so every
// UI gets them identically. This UI only supplies the modal-open suppression
// via UiPort.shouldSuppressKeys (see installClientPorts).

document.addEventListener('DOMContentLoaded', () => {
    // Desktop gets the window manager by default (one-time flip). Must run
    // before anything reads the layout state — panels and popups decide
    // whether to auto-open from it.
    applyDefaultLayoutMode();
    // index.html provides #layout-left/right-dock-host, so the player may let
    // the side docks span the full height (Okna → Menedżer Okien). Must run
    // before the LayoutProvider mounts.
    setRailSpanSupported(true);

    let clearInputOnSend = getRenderSettings().clearInputOnSend;
    onRenderSettingsChange((render) => {
        clearInputOnSend = render.clearInputOnSend;
    });
    // The command line renders with the rest of the app below; #message-input is
    // looked up when needed, not here.
    const commandLineDeps: CommandLineDeps = {
        getOutputWrapper,
        sendCommand: (cmd, echo, opts, skip, fromUser) => client.sendCommand(cmd, echo, opts, skip, fromUser),
        isPasswordMode: () => mudClient.isPasswordMode(),
        getCommandLineSuggestions: () => client.commandLineSuggestions ?? [],
        getClearInputOnSend: () => clearInputOnSend,
        // What is on screen is the vocabulary the recogniser lacks.
        getVoiceVocabulary: () => [...harvestOutputLines(getOutputWrapper()), ...(client.commandLineSuggestions ?? [])],
    };
    const getMessageInput = () => document.getElementById('message-input') as HTMLTextAreaElement | null;
    onShellSettingsChange((shell) => {
        if (shell.wakeLock && connection.getState().connected) {
            wakeLock.activate();
        } else {
            wakeLock.deactivate();
        }
    });

    // The page-level windows (AppModals.tsx, src/web/modals/appModal.ts). Looked up
    // when used: they render with the app tree at the end of this handler.
    const settingsModal = () => AppModal.byId('settings-modal');
    const characterManagementModal = () => AppModal.byId('character-management-modal');
    const bindsModal = () => AppModal.byId('binds-modal');
    const scriptsModal = () => AppModal.byId('scripts-modal');
    const automationModal = () => AppModal.byId('automation-modal');
    const recordingsModal = () => AppModal.byId('recordings-modal');
    const placesModal = () => AppModal.byId('places-modal');
    const helperModal = () => AppModal.byId('helper-modal');
    const locationShareModal = () => AppModal.byId('location-share-modal');

    const focusCommandInputOnConnect = () => {
        const messageInput = getMessageInput();
        if (!messageInput) return;
        if (isMobileLikeViewport()) return;
        if (document.hidden) return;
        // The account screens are still up: the game comes once a character is chosen.
        if (accountSession.isActive()) return;
        messageInput.focus();
    };
    mudClient.on('client.connect', focusCommandInputOnConnect);

    initTextToSpeech(client);

    const toasts = setupToasts(client);

    window.addEventListener('close-options', () => {
        (document.activeElement as HTMLElement)?.blur?.();
        for (const modal of [settingsModal, bindsModal, scriptsModal, automationModal, recordingsModal, placesModal]) {
            modal()?.hide();
        }
    });

    // Sync, backup and devices are the "Dane" pages of the settings dialog;
    // the old "show-export-import" request opens it on Synchronizacja.
    window.addEventListener(OPEN_SETTINGS_PAGE_EVENT, (event) => {
        const { category, anchor } = (event as CustomEvent<OpenSettingsPageDetail>).detail;
        window.dispatchEvent(new Event('close-options'));
        requestSettingsCategory(category);
        settingsModal()?.show();
        if (anchor) window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ block: 'center' }), 350);
    });

    window.addEventListener('show-export-import', () => {
        requestSettingsCategory('data-sync');
        settingsModal()?.show();
    });

    // Helper settings sends the user here: its shortcuts are edited in Klawisze.
    window.addEventListener('show-binds', () => {
        bindsModal()?.show();
    });

    window.addEventListener('show-character-management', () => {
        characterManagementModal()?.show();
    });

    window.addEventListener(CLOSE_SETTINGS_EVENT, () => {
        (document.activeElement as HTMLElement)?.blur?.();
        settingsModal()?.hide();
    });

    /**
     * The assistant asking for the panel that holds a setting it may not change
     * itself (drag-and-drop editors, nested config). The modal instance lives in
     * this scope and is not importable, so the panel reaches it by event.
     *
     * Only the dialog is opened, never the setting itself: these are exactly the
     * settings a human is supposed to edit by hand. SettingsDialog handles the
     * same event and switches to the page named in it.
     */
    window.addEventListener(OPEN_SETTINGS_EVENT, () => {
        settingsModal()?.show();
    });

    // The map's "Dodaj skrót" and "Notatka" (and /notatka) open Miejsca on that room.
    window.addEventListener(OPEN_PLACE_EVENT, () => placesModal()?.show());
    eventBus.on('shortcuts.addWithRoom', ({ roomId }) => openPlace(roomId, 'shortcut'));
    eventBus.on('locationNote.edit', ({ roomId }) => openPlace(roomId, 'note'));
    eventBus.on('locationNote.open', ({ roomId }) => openPlace(roomId, 'note'));

    // The ⋯ menu's Kod QR lokacji: a link that opens the map on this room.
    const shareLocation = () => {
        const roomId = client.Map.currentRoom?.id;
        const locationQrImage = document.getElementById('location-qr-image') as HTMLImageElement | null;
        if (!roomId || !locationQrImage) {
            return;
        }
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set('locationId', roomId.toString());
        locationQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url.toString())}`;
        locationShareModal()?.show();
    };
    const modals: Record<MainMenuModal, () => AppModal | null> = {
        automation: automationModal,
        binds: bindsModal,
        places: placesModal,
        recordings: recordingsModal,
        scripts: scriptsModal,
        helper: helperModal,
        settings: settingsModal,
    };
    registerBuiltinMainMenu({
        openModal: (modal) => modals[modal]()?.show(),
        shareLocation,
        isConnected: () => connection.getState().connected,
        toggleConnection: () => connection.toggle(),
    });

    // The command line's reconnect while offline.
    setReconnectHandler(() => connection.toggle());

    updateConnectButtons();

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
            updateConnectButtons();
        },
        onUrlChange: (url: string) => mudClient.setUserProxyUrl(url),
        onUseProxy: (url: string) => {
            mudClient.setUserProxyUrl(url);
            mudClient.setProxyMode('proxy');
        },
        initialMccp: mudClient.isMccpEnabled(),
        onMccpChange: (enabled: boolean) => mudClient.setMccpEnabled(enabled),
        helper: helperConnection,
        onHelperHelp: () => helperModal()?.show(),
    };

    // Initialize button state
    updateConnectButtons();

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
                onDismissed: focusCommandInputOnConnect,
            },
            toasts,
            mapLoad: mapBootstrap,
        }),
    )));
});


window.client = mudClient;



