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
import {installMapLayoutOffsets} from "./platform/iosViewport";
import {applyInitialLocation} from "./platform/initialLocation";
import {OPEN_SETTINGS_EVENT} from "./assistant/openSettings.ts";
import {ProxyControls} from "./hostProxy/ProxyControls.tsx";
import {AccountSession} from "./account/accountSession";
import {AccountScreen} from "./account/AccountScreen";
import recordingManager from "./RecordingManager.ts";
import eventBus from "@modules/core/eventBus";
import {setupOutputContextMenu} from "./outputContextMenu";
import {installLongPressContextMenu} from "@shared/dom/longPressContextMenu.ts";
import {isIOS} from "@shared/dom/mobileOs.ts";
import {AppModal} from './modals/appModal';
import ObjectList from "./ObjectList";
import {mountMigratedComponents} from "@web-ui/mountComponents.tsx";
import {setupMobileFooter} from "./mobileFooter.ts";
import FightTitle, {suppressTitleUpdates} from "./FightTitle";
import HpTitle from "./HpTitle";
import BossKeyOverlay from "@web-ui/bossKey/BossKeyOverlay";
import MobileDirectionButtons from "@web-ui/buttons/MobileDirectionButtons";
import DesktopButtons from "@web-ui/buttons/DesktopButtons";
import MobileCommandRadial from "@web-ui/buttons/MobileCommandRadial";
import MobileJoysticks from "@web-ui/buttons/MobileJoysticks";
import { WidgetLayer } from "@web-ui/widgets/WidgetLayer";
import { registerBuiltinWidgets } from "@web-ui/widgets/builtinWidgets";
import { setWidgetEditMode } from "@modules/core/widgetLayout";
import SettingsDialog from "./settings/SettingsDialog";
import {
    getRenderSettings,
    getShellSettings,
    getDeviceViewSettings,
    onRenderSettingsChange,
    onShellSettingsChange,
} from "@modules/core/settings";

import "@client/main.ts"
import {bootstrapMap} from "./map/mapBootstrap";
import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {LocationLabel} from "@web-ui/components/map/LocationLabel"
import {PauseIcon} from "@web-ui/components/map/PauseIcon"
import {MapLostBadge} from "@web-ui/components/map/MapLostBadge"
import Keys from "./keys/Keys.tsx"
import { isHelperSupported } from "./helperDownload"
import Scripts from "./options/Scripts.tsx"
import AutomationWindow from "./automation/AutomationWindow.tsx"
import Recordings from "./options/Recordings.tsx"
import {CLOSE_SETTINGS_EVENT, OPEN_SETTINGS_PAGE_EVENT, SAVE_SETTINGS_EVENT, requestSettingsCategory, type OpenSettingsPageDetail} from "./settings/categories.ts";
import CharacterManagement from "./options/CharacterManagementModal.tsx"
import Places from "./places/Places.tsx"
import { OPEN_PLACE_EVENT, openPlace } from "./places/placesData.ts"
import HelperSettings from "./options/HelperSettings.tsx"
import {applyDefaultLayoutMode, LayoutManagerWrapper, setRailSpanSupported} from "@web/layout"
import {globalStorage} from "@modules/core/storage"
import {setOutputTimestampVisibility, setupOutputMessageHandler} from "@shared/dom/outputMessageHandler";
import {createCharPlaqueFeed} from "@shared/dom/charPlaque";
import {setupLoginFire} from "./loginFire";
import {isLikelyTouchDevice, isMobileLikeViewport, isTouchPointerType} from "@shared/dom/pointerEnvironment.ts";
import CommandLine from "./commandInput/CommandLine";
import {installOutputSearch} from "./outputSearch/installOutputSearch";
import {setConnectionOffline, setConnectionStatus, setReconnectHandler} from "./commandInput/connectionView";
import {updateMainMenuItem} from "@modules/core/mainMenuRegistry";
import {registerBuiltinMainMenu, type MainMenuModal} from "./menu/mainMenu";
import {harvestOutputLines} from "./commandInput/outputWords";
import {installClientPorts} from "./installClientPorts";
import {installContentWidthMeasurer} from "./contentWidthMeasurer";
import {bootstrapGameClient} from "./clientBootstrap";
import {mountToasts} from "@web/notifications/mountToasts.tsx";
import {initTextToSpeech} from "./voice/textToSpeech.ts";
import {reloadToLatest, watchForNewVersion} from "./versionCheck";

// The client seeds `binds` from the active keymap itself (KeyBindingManager),
// so any UI — including this one — picks up keybinds without a UI-side step.

// Build the client and wire all UI-agnostic startup concerns (migrations,
// scripts, session logging, Firebase sync, helper, sendCommand/NPC bridges)
// through the shared bootstrap. Port implementations are the one UI-specific
// piece, injected here before scripts run.
const { client, helperConnection } = bootstrapGameClient({ installPorts: installClientPorts });

// The client core is DOM-free; the web UI measures terminal column width from
// the DOM and pushes it in.
installContentWidthMeasurer(client);


applyInitialLocation(client);

// Keep a phone from sleeping the tab while connected (the wake-lock setting).
const wakeLock = new WakeLock();
let wakeLockButton: HTMLButtonElement | null = null;

function updateWakeLockButton() {
    if (wakeLockButton) {
        wakeLockButton.textContent = wakeLock.isEnabled() ? 'NoSleep ON' : 'NoSleep OFF';
    }
}
wakeLock.subscribe(updateWakeLockButton);

installMapLayoutOffsets(
    document.getElementById("iframe-container"),
    document.getElementById("main-container"),
);

const progressContainer = document.getElementById('map-progress-container')!;
const progressBar = document.getElementById('map-progress-bar') as HTMLElement;

progressContainer.style.display = 'none';

const outputWrapper = document.getElementById('main_text_output_msg_wrapper') as HTMLElement;
const splitBottom = document.getElementById('split-bottom') as HTMLElement;
const splitHandle = document.getElementById('split-handle')!;
const stickyArea = document.getElementById('sticky-area') as HTMLElement;
// Holds #multi-binds once the footer layout renders (mountMigratedComponents).
const footerLayoutElement = document.getElementById('footer-layout');
const STICKY_LINES = 50;
const DOUBLE_CLICK_TIMEOUT_MS = 300;

setOutputTimestampVisibility(getRenderSettings().showTimestamps);
onRenderSettingsChange((render) => {
    setOutputTimestampVisibility(render.showTimestamps);
});

// Scroll/wheel/resize/drag split-view detection, trimming, and sticky-mirror
// live in the shared engine (also used by forge-ui).
const outputMessageHandler = setupOutputMessageHandler(mudClient, {
    outputWrapper,
    splitBottom,
    splitHandle,
    stickyArea,
    stickyLines: STICKY_LINES,
    maxElements: () => getDeviceViewSettings().outputMaxElements,
    onSplitViewResize: (heightPx) => {
        if (heightPx < 60) return;
        const settings = globalStorage.get('uiSettings');
        if (settings) {
            settings.splitViewHeight = heightPx;
            globalStorage.set('uiSettings', settings);
        }
    },
});

// The character's plaque, once per character on login (Wygląd -> wizytówka).
const showCharPlaque = createCharPlaqueFeed(outputMessageHandler.appendNode);
eventBus.on('gmcp.char.info', (info) => {
    if (getRenderSettings().characterPlaque) showCharPlaque(info);
});

// Multibinds appearing or disappearing is stock-only layout churn, so its
// extra suppression + forced rescroll stays here, layered on top of the
// shared engine via the returned handle.
if (footerLayoutElement) {
    const mutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && (mutation.target as Element).id === 'multi-binds') {
                outputMessageHandler.suppressSplitView(500);

                // Force scroll to bottom after layout settles
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        // The split pane lies over the text, so only the real bottom counts
                        const isAtBottom = outputWrapper.scrollTop + outputWrapper.clientHeight >= outputWrapper.scrollHeight - 1;
                        if (isAtBottom) {
                            outputWrapper.scrollTop = outputWrapper.scrollHeight;
                        }
                    });
                });
            }
        }
    });
    mutationObserver.observe(footerLayoutElement, {
        attributes: true,
        attributeFilter: ['class'],
        subtree: true,
    });
}

setupOutputContextMenu(outputWrapper);
// iOS has no long-press contextmenu of its own; every right-click menu needs one.
if (isIOS()) installLongPressContextMenu();


function closeHistoryScrollback() {
    outputMessageHandler.closeSplitView();
}

document.getElementById('split-close')?.addEventListener('click', () => {
    closeHistoryScrollback();
    (document.getElementById('message-input') as HTMLElement | null)?.focus();
});


let lastTap = 0;
outputWrapper.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap < DOUBLE_CLICK_TIMEOUT_MS) {
        e.preventDefault();
        closeHistoryScrollback();
    }
    lastTap = now;
});

let lastClick = 0;
let lastClickTarget: EventTarget | null = null;
outputWrapper.addEventListener('click', (event) => {
    if (event.button !== 0) {
        return;
    }
    const now = Date.now();
    if (lastClickTarget === event.target && now - lastClick < DOUBLE_CLICK_TIMEOUT_MS) {
        closeHistoryScrollback();
        lastClick = 0;
        lastClickTarget = null;
        return;
    }
    lastClick = now;
    lastClickTarget = event.target;
});

// Middle-mouse-click-opens-radial-menu now lives inside the shared
// MobileCommandRadial component itself (src/ui/web/buttons) — it wires its
// own mousedown listener onto the content area.

// Map data and colours load in the background; the bar follows the download.
const mapBootstrap = bootstrapMap(client, {
    // Rendered before the map initialises, so they hear the first location.
    beforeInitialize: () => {
        const locationTextElement = document.getElementById('location-text');
        if (locationTextElement) {
            createRoot(locationTextElement).render(createElement(LocationLabel));
        }

        const pauseIconElement = document.getElementById('pause-icon');
        if (pauseIconElement) {
            createRoot(pauseIconElement).render(createElement(PauseIcon));
        }

        const mapLostBadgeElement = document.getElementById('map-lost-wrapper');
        if (mapLostBadgeElement) {
            createRoot(mapLostBadgeElement).render(createElement(MapLostBadge));
        }
    },
});
mapBootstrap.subscribeProgress(({visible, percent, loadedBytes}) => {
    progressContainer.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    if (percent === null) {
        // Indeterminate progress: version check, or download of unknown total size
        progressBar.style.width = '100%';
        progressBar.textContent = loadedBytes !== undefined ? `${Math.floor(loadedBytes / 1024)} KB` : '';
    } else {
        progressBar.style.width = `${percent}%`;
        progressBar.textContent = `${Math.floor(percent)}%`;
    }
});


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
accountSession.subscribe(() => updateConnectButtons());
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

// Function to update the connect button state
function updateConnectButtons() {
    const authPanel = document.getElementById('auth-panel');
    const authOverlay = document.getElementById('auth-overlay') as HTMLElement | null;
    const account = accountSession.getState();
    const {connected, connecting, disconnecting, authClosed, playback, accountLeaving, loginNotice} = connection.getState();

    // Connecting: the form and the connect button give way to the spinner, which
    // also covers an e-mail login waiting for the game's answer.
    authPanel?.classList.toggle('is-connecting', connecting || account.loggingIn);
    authPanel?.classList.toggle('is-account', account.view !== 'off');
    authPanel?.classList.toggle('is-direct', mudClient.getProxyMode() === 'direct');

    // Offline with the login screen dismissed: the command line shows the closed
    // connection and offers to reconnect in place of the send button.
    setConnectionOffline(!connected && !connecting && authClosed);
    setConnectionStatus(connected ? 'connected' : connecting ? 'connecting' : 'disconnected', mudClient.getProxyMode());


    if (authOverlay) {
        // Leaving an account keeps the card up through the close: there is no game
        // under it to show for the moment the socket takes to go.
        const accountUp = accountSession.isActive() || (accountLeaving && disconnecting);
        const authShown = (!connected || accountUp) && !playback && !authClosed;
        authOverlay.style.display = authShown ? 'flex' : 'none';
        // What a theme that takes the screen for the login keys on (Kuźnia hides the game under it).
        document.body.classList.toggle('auth-open', authShown);
    }

    updateMainMenuItem('disconnect-button', connected
        ? { label: 'Rozłącz', disabled: disconnecting, tone: 'danger' }
        : { label: 'Połącz', disabled: connecting, tone: undefined });

    renderSystemLoginMessage(!connected && !connecting ? loginNotice : null);
}

/**
 * What the game said about the last login, over the form. A wrong password
 * also empties the password field and marks it, ready to be typed again.
 */
let shownSystemLoginMessage: string | null = null;
function renderSystemLoginMessage(message: string | null) {
    const el = document.getElementById('system-login-message');
    if (!el || message === shownSystemLoginMessage) return;
    shownSystemLoginMessage = message;
    el.textContent = '';
    const aboutPassword = message != null && /has(l|\u0142)o/i.test(message);
    document.getElementById('auth-panel')?.classList.toggle('has-password-error', aboutPassword);
    const password = document.getElementById('login-password') as HTMLInputElement | null;
    if (password) {
        password.placeholder = aboutPassword ? 'Wpisz ponownie' : '';
        if (aboutPassword) {
            password.value = '';
            password.dispatchEvent(new Event('input'));
        }
    }
    if (!message) return;
    const text = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = message;
    const source = document.createElement('span');
    source.textContent = 'wiadomość od serwera gry';
    text.append(strong, source);
    el.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20z"></path><path d="M12 10v4"></path><path d="M12 18h.01"></path></svg>';
    el.append(text);
}

// Returning to the tab reflows the output; the split view must not take that for a scroll.
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) outputMessageHandler.suppressSplitView(500);
});


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

    const commitInfo = document.getElementById('commit-info') as HTMLElement | null;
    if (commitInfo) {
        const formatCommitDate = (raw: string): string => {
            if (!raw || raw === 'unknown') return raw;
            const parsed = new Date(raw);
            if (Number.isNaN(parsed.getTime())) return raw;
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
        };

        const repoLink = document.createElement('a');
        repoLink.href = 'https://github.com/Delwing/arkadia-web-client-extension';
        repoLink.target = '_blank';
        repoLink.rel = 'noopener noreferrer';
        repoLink.className = 'commit-info-link';
        repoLink.title = `Wersja z ${formatCommitDate(__COMMIT_DATE__)}: otwórz repozytorium na GitHub`;
        repoLink.textContent = __COMMIT_SHA__;

        const githubLink = document.createElement('a');
        githubLink.href = repoLink.href;
        githubLink.target = '_blank';
        githubLink.rel = 'noopener noreferrer';
        githubLink.className = 'commit-info-github';
        githubLink.title = 'Otwórz repozytorium na GitHub';
        githubLink.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

        const dateSpan = document.createElement('span');
        dateSpan.className = 'commit-info-date';
        dateSpan.textContent = ` · ${formatCommitDate(__COMMIT_DATE__)}`;

        const line = document.createElement('div');
        line.className = 'commit-info-line';
        line.append(githubLink, repoLink, dateSpan);

        commitInfo.textContent = '';
        commitInfo.append(line);

        // Reported on the login screen: an open PWA notices the new build when it
        // returns to the foreground, and the player sees it the next time they are
        // not in the middle of a game. Opting in also shows a passing toast in the
        // notification center, since a session can go on for days without the login.
        watchForNewVersion({
            currentSha: __COMMIT_SHA__,
            onUpdate: () => {
                const warningDiv = document.createElement('div');
                warningDiv.className = 'commit-info-update';
                warningDiv.append('Nowa wersja dostępna');
                const reloadButton = document.createElement('button');
                reloadButton.type = 'button';
                reloadButton.className = 'auth-btn auth-btn--sm commit-info-reload';
                reloadButton.textContent = 'Odśwież';
                reloadButton.addEventListener('click', () => {
                    reloadButton.disabled = true;
                    void reloadToLatest();
                });
                warningDiv.append(reloadButton);
                commitInfo.appendChild(warningDiv);

                if (getShellSettings().inGameUpdateNotice) {
                    client.sendEvent('notify', {
                        title: 'Dostępna nowa wersja',
                        text: 'Odśwież stronę, kiedy skończysz grać.',
                        source: 'client',
                        key: 'client.update',
                        time: 15000,
                        actions: [{ label: 'Odśwież', primary: true, onClick: () => void reloadToLatest() }],
                    });
                }
            },
        });
    }

    let clearInputOnSend = getRenderSettings().clearInputOnSend;
    onRenderSettingsChange((render) => {
        clearInputOnSend = render.clearInputOnSend;
    });
    // Synchronously, so #message-input exists for everything below that looks it up.
    const commandLineRoot = document.getElementById('command-line-root');
    if (commandLineRoot) {
        flushSync(() => createRoot(commandLineRoot).render(createElement(CommandLine, {
            deps: {
                outputWrapper,
                sendCommand: (cmd, echo, opts, skip, fromUser) => client.sendCommand(cmd, echo, opts, skip, fromUser),
                isPasswordMode: () => mudClient.isPasswordMode(),
                getCommandLineSuggestions: () => client.commandLineSuggestions ?? [],
                getClearInputOnSend: () => clearInputOnSend,
                // What is on screen is the vocabulary the recogniser lacks.
                getVoiceVocabulary: () => [...harvestOutputLines(outputWrapper), ...(client.commandLineSuggestions ?? [])],
            },
        })));
    }
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    installOutputSearch({
        outputWrapper,
        splitBottom,
        skip: [document.getElementById('notification-center')].filter((el): el is HTMLElement => !!el),
        commandInput: () => document.getElementById('message-input'),
    });
    onShellSettingsChange((shell) => {
        if (shell.wakeLock && connection.getState().connected) {
            wakeLock.activate();
        } else {
            wakeLock.deactivate();
        }
    });
    const connectButton = document.getElementById('connect-button') as HTMLButtonElement | null;
    const settingsSave = document.getElementById('settings-save') as HTMLButtonElement | null;
    const recordingButton = document.getElementById('recording-button') as HTMLButtonElement | null;
    wakeLockButton = document.getElementById('wake-lock-button') as HTMLButtonElement | null;
    updateWakeLockButton();

    // The page-level windows (index.html, src/web/modals/appModal.ts)
    const settingsModalElement = document.getElementById('settings-modal');
    const settingsModal = settingsModalElement ? AppModal.for(settingsModalElement) : null;
    const characterManagementModalElement = document.getElementById('character-management-modal');
    const characterManagementModal = characterManagementModalElement ? AppModal.for(characterManagementModalElement) : null;
    const bindsModalElement = document.getElementById('binds-modal');
    const bindsModal = bindsModalElement ? AppModal.for(bindsModalElement) : null;
    const scriptsModalElement = document.getElementById('scripts-modal');
    const scriptsModal = scriptsModalElement ? AppModal.for(scriptsModalElement) : null;
    const automationModalElement = document.getElementById('automation-modal');
    const automationModal = automationModalElement ? AppModal.for(automationModalElement) : null;
    const recordingsModalElement = document.getElementById('recordings-modal');
    const recordingsModal = recordingsModalElement ? AppModal.for(recordingsModalElement) : null;
    const placesModalElement = document.getElementById('places-modal');
    const placesModal = placesModalElement ? AppModal.for(placesModalElement) : null;
    const helperModalElement = document.getElementById('helper-modal');
    const helperModal = helperModalElement ? AppModal.for(helperModalElement) : null;
    const loginCharacter = document.getElementById('login-character') as HTMLInputElement | null;
    const loginPassword = document.getElementById('login-password') as HTMLInputElement | null;
    const loginForm = document.getElementById('login-form') as HTMLFormElement | null;
    const authClose = document.getElementById('auth-close') as HTMLButtonElement | null;
    const notificationCenter = document.getElementById('notification-center') as HTMLElement | null;
    const enableNotificationsSettings = document.getElementById('ui-enable-notifications') as HTMLButtonElement | null;
    const contentArea = document.getElementById('content-area') as HTMLElement | null;

    const focusCommandInputOnConnect = () => {
        if (!messageInput) return;
        if (isMobileLikeViewport()) return;
        if (document.hidden) return;
        // The account screens are still up: the game comes once a character is chosen.
        if (accountSession.isActive()) return;
        messageInput.focus();
    };
    mudClient.on('client.connect', focusCommandInputOnConnect);

    if (contentArea) {
        const interactiveSelector = 'a, button, input, textarea, select, [contenteditable], .plugin-window, .app-modal, .managed-panel';

        // A click only hands focus to the command line; it must leave the
        // scrollback where it is, or a single click while reading the history
        // would close the split view. Closing it is a double-click or the
        // pane's close button.
        const focusKeepingScroll = () => {
            messageInput.setAttribute('data-keep-scroll', '');
            messageInput.focus({preventScroll: true});
            messageInput.removeAttribute('data-keep-scroll');
        };

        const focusMessageInput = (target: EventTarget | null) => {
            // Check if there's a text selection
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) {
                return;
            }

            if (!target || !(target instanceof Element)) {
                focusKeepingScroll();
                return;
            }

            if (target.closest(interactiveSelector)) {
                return;
            }

            if (target.closest('[data-output-clickable]')) {
                // Output links are plain spans, so clicking one drops focus without
                // moving it anywhere useful. Restore it once the link handler has run,
                // unless that handler focused something on purpose (modal, editor...).
                setTimeout(() => {
                    const active = document.activeElement;
                    if (active && active !== document.body && active.closest?.(interactiveSelector)) {
                        return;
                    }
                    focusKeepingScroll();
                }, 0);
                return;
            }

            focusKeepingScroll();
            setTimeout(focusKeepingScroll, 1);
        };

        if (window.PointerEvent) {
            contentArea.addEventListener('pointerup', (event: PointerEvent) => {
                if (event.button !== 0) return;
                if (isTouchPointerType(event.pointerType)) return;
                focusMessageInput(event.target);
            });
        } else {
            contentArea.addEventListener('click', (event) => {
                if (isLikelyTouchDevice()) return;
                focusMessageInput(event.target);
            });
        }
    }
    const enableNotificationsConnection = document.getElementById('enable-notifications-connection') as HTMLButtonElement | null;
    const locationQrImage = document.getElementById('location-qr-image') as HTMLImageElement | null;
    const locationShareModalElement = document.getElementById('location-share-modal');
    const locationShareModal = locationShareModalElement ? AppModal.for(locationShareModalElement) : null;

    // The login screen's banner: gone once notifications are on, or for now on its cross.
    const authNotify = document.getElementById('auth-notify');
    document.getElementById('auth-notify-dismiss')?.addEventListener('click', () => {
        if (authNotify) authNotify.style.display = 'none';
    });
    if (authNotify && typeof Notification === 'undefined') {
        authNotify.style.display = 'none';
    }

    if (enableNotificationsSettings || enableNotificationsConnection) {
        const updateVisibility = () => {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                if (enableNotificationsSettings) {
                    enableNotificationsSettings.style.display = 'none';
                }
                if (authNotify) {
                    authNotify.style.display = 'none';
                }
            }
        };
        const handleClick = () => {
            client.enableNotifications();
            updateVisibility();
        };
        if (enableNotificationsSettings) {
            enableNotificationsSettings.addEventListener('click', handleClick);
        }
        if (enableNotificationsConnection) {
            enableNotificationsConnection.addEventListener('click', handleClick);
        }
        updateVisibility();
        // The permission prompt answers after the click.
        navigator.permissions?.query({name: 'notifications'})
            .then((status) => { status.onchange = updateVisibility; })
            .catch(() => undefined);
    }

    initTextToSpeech(client);

    if (notificationCenter) {
        mountToasts(notificationCenter, outputWrapper, client);
    }

    window.addEventListener('close-options', () => {
        (document.activeElement as HTMLElement)?.blur?.();
        if (settingsModal) {
            settingsModal.hide();
        }
        if (bindsModal) {
            bindsModal.hide();
        }
        if (scriptsModal) {
            scriptsModal.hide();
        }
        if (automationModal) {
            automationModal.hide();
        }
        if (recordingsModal) {
            recordingsModal.hide();
        }
        if (placesModal) {
            placesModal.hide();
        }
    });

    // Sync, backup and devices are the "Dane" pages of the settings dialog;
    // the old "show-export-import" request opens it on Synchronizacja.
    window.addEventListener(OPEN_SETTINGS_PAGE_EVENT, (event) => {
        const { category, anchor } = (event as CustomEvent<OpenSettingsPageDetail>).detail;
        window.dispatchEvent(new Event('close-options'));
        requestSettingsCategory(category);
        settingsModal?.show();
        if (anchor) window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ block: 'center' }), 350);
    });

    window.addEventListener('show-export-import', () => {
        requestSettingsCategory('data-sync');
        settingsModal?.show();
    });

    // Helper settings sends the user here: its shortcuts are edited in Klawisze.
    window.addEventListener('show-binds', () => {
        bindsModal?.show();
    });

    window.addEventListener('show-character-management', () => {
        if (characterManagementModal) {
            characterManagementModal.show();
        }
    });

    // Header buttons in the settings modal
    const settingsCharactersBtn = document.getElementById('settings-characters-btn');

    if (settingsCharactersBtn) {
        settingsCharactersBtn.addEventListener('click', () => {
            window.dispatchEvent(new Event('show-character-management'));
        });
    }

    if (settingsSave) {
        settingsSave.addEventListener('click', () => {
            window.dispatchEvent(new Event(SAVE_SETTINGS_EVENT));
        });
    }

    window.addEventListener(CLOSE_SETTINGS_EVENT, () => {
        (document.activeElement as HTMLElement)?.blur?.();
        settingsModal?.hide();
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
        settingsModal?.show();
    });

    // The map's "Dodaj skrót" and "Notatka" (and /notatka) open Miejsca on that room.
    if (placesModal) {
        window.addEventListener(OPEN_PLACE_EVENT, () => placesModal.show());
        eventBus.on('shortcuts.addWithRoom', ({ roomId }) => openPlace(roomId, 'shortcut'));
        eventBus.on('locationNote.edit', ({ roomId }) => openPlace(roomId, 'note'));
        eventBus.on('locationNote.open', ({ roomId }) => openPlace(roomId, 'note'));
    }

    // The ⋯ menu's Kod QR lokacji: a link that opens the map on this room.
    const shareLocation = () => {
        const roomId = client.Map.currentRoom?.id;
        if (!roomId || !locationQrImage) {
            return;
        }
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set('locationId', roomId.toString());
        locationQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url.toString())}`;
        locationShareModal?.show();
    };
    const modals: Record<MainMenuModal, AppModal | null> = {
        automation: automationModal,
        binds: bindsModal,
        places: placesModal,
        recordings: recordingsModal,
        scripts: scriptsModal,
        helper: helperModal,
        settings: settingsModal,
    };
    registerBuiltinMainMenu({
        openModal: (modal) => modals[modal]?.show(),
        shareLocation,
        isConnected: () => connection.getState().connected,
        toggleConnection: () => connection.toggle(),
    });

    if (recordingButton) {
        recordingButton.addEventListener('click', () => {
            recordingManager.stopRecording(true);
        });
    }



    mudClient.on('recording.start', () => {
        if (recordingButton) recordingButton.style.display = 'inline-flex';
    });
    mudClient.on('recording.stop', () => {
        if (recordingButton) recordingButton.style.display = 'none';
    });

    if (wakeLockButton) {
        wakeLockButton.addEventListener('click', () => {
            wakeLock.toggle();
        });
    }

    loginForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const character = loginCharacter?.value || '';
        const password = loginPassword?.value || '';

        // An e-mail opens the account rather than a character. Over telnet the
        // game asks for one in its own text menu, so only the direct connection
        // takes this road; the others type it in below like a name.
        if (character.includes('@') && mudClient.getProxyMode() === 'direct') {
            const {connected, connecting} = connection.getState();
            if (connected || connecting) return;
            connection.clearLoginNotice();
            accountSession.login(character.trim(), password);
            return;
        }

        connection.signIn({character, password});
    });

    // The login screen's Połącz, and the command line's reconnect while offline.
    connectButton?.addEventListener('click', () => connection.toggle());
    setReconnectHandler(() => connection.toggle());

    setupLoginFire();

    // The login screen's password field: the eye shows what was typed.
    const passwordToggle = document.getElementById('login-password-toggle');
    if (passwordToggle && loginPassword) {
        passwordToggle.addEventListener('click', () => {
            const show = loginPassword.type === 'password';
            loginPassword.type = show ? 'text' : 'password';
            passwordToggle.title = show ? 'Ukryj hasło' : 'Pokaż hasło';
            passwordToggle.classList.toggle('is-on', show);
            loginPassword.focus();
        });
        // Never leave the password shown once it is sent.
        loginForm?.addEventListener('submit', () => {
            loginPassword.type = 'password';
            passwordToggle.title = 'Pokaż hasło';
            passwordToggle.classList.remove('is-on');
        });
    }

    // Konto: the screens that replace the card for an account, and the way in.
    const accountRoot = document.getElementById('account-root');
    if (accountRoot) {
        createRoot(accountRoot).render(createElement(AccountScreen, {session: accountSession}));
    }
    document.getElementById('create-account-link')?.addEventListener('click', () => {
        connection.clearLoginNotice();
        accountSession.openCreateAccount();
    });
    updateConnectButtons();

    // The login screen's connection footer: the mode (direct / helper / proxy),
    // what the helper is doing, and each mode's settings (proxy URL, MCCP).
    const proxyControlsRoot = document.getElementById('proxy-controls-root');
    if (proxyControlsRoot) {
        createRoot(proxyControlsRoot).render(createElement(ProxyControls, {
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
            onHelperHelp: () => helperModal?.show(),
            onBlockedChange: (blocked: boolean) => document.getElementById('auth-panel')?.classList.toggle('is-blocked', blocked),
        }));
    }

    if (authClose) {
        const closeAuthOverlay = () => {
            connection.closeAuth();
            // Dismissing the login screen without connecting leaves the command
            // line as the place to type, same as after a connect.
            focusCommandInputOnConnect();
        };
        authClose.addEventListener('click', closeAuthOverlay);
        document.addEventListener('keydown', (e) => {
            const {authClosed, connected, playback} = connection.getState();
            if (e.key === 'Escape' && !authClosed && !connected && !playback) {
                closeAuthOverlay();
            }
        });
    }


    // Initialize button state
    updateConnectButtons();

    // Mount React components
    mountMigratedComponents();
    // Phone footer: the expander that unfolds its two scrolling rails. The rest
    // of that layout is CSS (footerMobile.css) plus CharState's compact meters.
    setupMobileFooter();
    const fightTitle = new FightTitle();
    new HpTitle(fightTitle);
    new ObjectList(client);

    // Mobile direction buttons, desktop buttons & mobile command radial —
    // shared React components (src/ui/web/buttons), also mounted by forge-ui.
    // Each portals its own container to document.body, so the mount roots
    // here are just detached hosts, never themselves appended.
    createRoot(document.createElement('div')).render(createElement(MobileDirectionButtons, { client }));
    createRoot(document.createElement('div')).render(createElement(DesktopButtons, { client }));
    createRoot(document.createElement('div')).render(createElement(MobileCommandRadial, { client }));
    createRoot(document.createElement('div')).render(createElement(MobileJoysticks, { client }));

    // Widgets over the game output (Zegar, Witalne…); portals itself to document.body.
    // Rendered once, so the inline getArea stays one function.
    registerBuiltinWidgets();
    eventBus.on('widgets.edit', ({ on }) => setWidgetEditMode(on));
    createRoot(document.createElement('div')).render(createElement(WidgetLayer, {
        getArea: () => document.getElementById('main_text_output_msg_wrapper'),
    }));

    // Boss key: Pause / ScrollLock drops a fake Word window over the whole
    // client. Same detached-root pattern as the buttons above — it portals to
    // document.body itself. FightTitle must already exist so suppressTitleUpdates
    // can freeze the "Arkadia [5/7]" tab title while the overlay is up.
    createRoot(document.createElement('div')).render(createElement(BossKeyOverlay, {
        client,
        soundControl: client.SoundManager,
        suppressTitle: suppressTitleUpdates,
    }));

    const settingsRoot = document.getElementById('settings-root');
    if (settingsRoot) {
        createRoot(settingsRoot).render(createElement(SettingsDialog, {
            soundManager: client.SoundManager,
            onEnableNotifications: () => client.enableNotifications(),
        }));
    }


    const characterManagementRoot = document.getElementById('character-management-root');
    if (characterManagementRoot) {
        createRoot(characterManagementRoot).render(createElement(CharacterManagement));
    }

    const bindsRoot = document.getElementById('binds-options');
    if (bindsRoot) {
        createRoot(bindsRoot).render(createElement(Keys, {
            helperConnection: isHelperSupported() ? helperConnection : null,
            headerSlot: document.getElementById('binds-header-slot'),
        }));
    }

    const scriptsRoot = document.getElementById('scripts-options');
    if (scriptsRoot) {
        createRoot(scriptsRoot).render(createElement(Scripts));
    }

    const automationRoot = document.getElementById('automation-options');
    if (automationRoot) {
        createRoot(automationRoot).render(createElement(AutomationWindow));
    }

    const recordingsRoot = document.getElementById('recordings-options');
    if (recordingsRoot) {
        createRoot(recordingsRoot).render(createElement(Recordings));
    }

    const placesRoot = document.getElementById('places-options');
    if (placesRoot) {
        createRoot(placesRoot).render(createElement(Places));
    }

    const helperRoot = document.getElementById('helper-options');
    if (helperRoot) {
        createRoot(helperRoot).render(createElement(HelperSettings, { helperConnection }));
    }

    // Mount Layout Manager (includes all dockable popups)
    const layoutManagerRoot = document.getElementById('layout-manager-root');
    if (layoutManagerRoot) {
        const mapElement = document.getElementById('map');
        const objectListElement = document.getElementById('objects-list');
        const objectListOthersElement = document.getElementById('objects-list-others');
        createRoot(layoutManagerRoot).render(
            createElement(LayoutManagerWrapper, {
                mapElement,
                objectListElement,
                objectListOthersElement,
            })
        );
    }
});


window.client = mudClient;



