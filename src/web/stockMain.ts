// The document base + style.css + colour themes + layout.css, @imported into one
// chunk (main-theme.css) to lock the stock cascade order — see that file for why.
import './main-theme.css'
import './popups/popups.css'
import '@web-ui/messageFlair.css'
import '@web-ui/buttons/desktopButtons.css'
import '@web-ui/buttons/mobileCommandRadial.css'
import '@web-ui/buttons/mobileDirectionButtons.css'
import mudClient from "./MudClient.ts";
import {
    DEFAULT_SESSION_PROXY_URL,
    isResumeNoticeEnabled,
    setResumeNoticeEnabled,
    shouldReattachAfterClose,
} from "./proxySession.ts";
import {OPEN_SETTINGS_EVENT} from "./assistant/openSettings.ts";
import {ProxyControls} from "./hostProxy/ProxyControls.tsx";
import recordingManager from "./RecordingManager.ts";
import eventBus from "@modules/core/eventBus";
import {setupOutputContextMenu} from "./outputContextMenu";
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
import SettingsDialog from "./settings/SettingsDialog";
import {
    getRenderSettings,
    getMapSettings,
    getShellSettings,
    getDeviceViewSettings,
    onRenderSettingsChange,
    onShellSettingsChange,
} from "@modules/core/settings";

import "@client/main.ts"
import NoSleep from 'nosleep.js';
import {loadColors, loadMapData, subscribeToMapData} from "./mapDataLoader.ts";
import {EmbeddedMap} from "./embed.ts"
import {getEmbeddedMap, setEmbeddedMap} from "./embedRegistry.ts"
import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {LocationLabel} from "@web-ui/components/map/LocationLabel"
import {PauseIcon} from "@web-ui/components/map/PauseIcon"
import {MapLostBadge} from "@web-ui/components/map/MapLostBadge"
import Keys from "./keys/Keys.tsx"
import Scripts from "./options/Scripts.tsx"
import AutomationWindow from "./automation/AutomationWindow.tsx"
import Recordings from "./options/Recordings.tsx"
import {CLOSE_SETTINGS_EVENT, OPEN_SETTINGS_PAGE_EVENT, SAVE_SETTINGS_EVENT, openSettingsPage, requestSettingsCategory, requestSettingsResume, type OpenSettingsPageDetail} from "./settings/categories.ts";
import CharacterManagement from "./options/CharacterManagementModal.tsx"
import Places from "./places/Places.tsx"
import { OPEN_PLACE_EVENT, openPlace } from "./places/placesData.ts"
import HelperSettings from "./options/HelperSettings.tsx"
import {applyDefaultLayoutMode, LayoutManagerWrapper} from "@web/layout"
import {globalStorage} from "@modules/core/storage"
import {setOutputTimestampVisibility, setupOutputMessageHandler} from "@shared/dom/outputMessageHandler";
import {isLikelyTouchDevice, isMobileLikeViewport, isTouchPointerType} from "@shared/dom/pointerEnvironment.ts";
import CommandLine from "./commandInput/CommandLine";
import {setConnectionOffline, setConnectionStatus, setReconnectHandler} from "./commandInput/connectionView";
import {registerMainMenuItem, updateMainMenuItem, type MainMenuGroup} from "@modules/core/mainMenuRegistry";
import {harvestOutputLines} from "./commandInput/outputWords";
import {installClientPorts} from "./installClientPorts";
import {installContentWidthMeasurer} from "./contentWidthMeasurer";
import {bootstrapGameClient} from "./clientBootstrap";
import {initTextToSpeech} from "./voice/textToSpeech.ts";
import {whenDocumentReady} from "./shell/documentReady";
import {mountReactOutput} from "./output/experimental/ReactOutput";
import {lazyOutputHandler} from "./output/experimental/lazyOutputHandler";
import {switchShell} from "./shell/uiShell";
import {initDockArrangement} from "./layout/utils/dockArrangement";
// The Logi window: mounts itself into #logs-modal and registers its menu entry.
import "./logBrowserMount";

// The client seeds `binds` from the active keymap itself (KeyBindingManager),
// so any UI — including this one — picks up keybinds without a UI-side step.

// Build the client and wire all UI-agnostic startup concerns (migrations,
// scripts, session logging, Firebase sync, helper, sendCommand/NPC bridges)
// through the shared bootstrap. Port implementations are the one UI-specific
// piece, injected here before scripts run.
const { client, helperConnection } = bootstrapGameClient({ installPorts: installClientPorts });

// index.html provides the rail hosts, so the stock shell renders both dock
// arrangements; the player picks one in Ustawienia → Okna. Must run before the
// layout manager mounts.
initDockArrangement('stock', 'topBottom');

// The client core is DOM-free; the web UI measures terminal column width from
// the DOM and pushes it in.
installContentWidthMeasurer(client);


const locationParam = new URLSearchParams(window.location.search).get('locationId');
const initialLocationId = locationParam ? parseInt(locationParam) : NaN;
if (!isNaN(initialLocationId)) {
    const handleInitialLocation = () => {
        client.Map.setMapRoomById(initialLocationId);

        const params = new URLSearchParams(window.location.search);
        params.delete('locationId');
        const base = window.location.origin + window.location.pathname;
        const rest = params.toString();
        window.history.replaceState({}, '', rest ? `${base}?${rest}` : base);

        unsubscribe();
    };
    const unsubscribe = client.on('gmcp.room.info', handleInitialLocation);
}

// Prevent tab sleep on mobile when switching tabs
let noSleepInstance: NoSleep | null = null;
let tabSleepPreventionActive = false;
let wakeLockEnabled = false;
let wakeLockButton: HTMLButtonElement | null = null;

function updateWakeLockButton() {
    if (wakeLockButton) {
        wakeLockButton.textContent = wakeLockEnabled ? 'NoSleep ON' : 'NoSleep OFF';
    }
}

// Function to prevent tab sleep
function preventTabSleep() {
    // If already active, don't activate again
    if (tabSleepPreventionActive) return;

    tabSleepPreventionActive = true;

    if (!noSleepInstance) {
        noSleepInstance = new NoSleep();
    }

    const enableNoSleep = async () => {
        try {
            await noSleepInstance!.enable();
            wakeLockEnabled = noSleepInstance!.isEnabled;
            console.log('NoSleep enabled:', wakeLockEnabled);
        } catch (err) {
            wakeLockEnabled = false;
            console.warn('NoSleep failed to enable:', err);
        }
        updateWakeLockButton();
    };

    // Re-enable on visibility change (Android releases wake lock when tab hidden)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && tabSleepPreventionActive && noSleepInstance) {
            enableNoSleep();
        }
    });

    document.addEventListener('touchstart', enableNoSleep, {once: true});
    document.addEventListener('click', enableNoSleep, {once: true});
}

function disableTabSleepPrevention() {
    if (!tabSleepPreventionActive) return;
    tabSleepPreventionActive = false;
    if (noSleepInstance) {
        noSleepInstance.disable();
    }
    wakeLockEnabled = false;
    updateWakeLockButton();
}

const iframeContainerEl = document.getElementById("iframe-container") as HTMLElement | null;
const mainContainerEl = document.getElementById("main-container") as HTMLElement | null;
let iosKeyboardOffset = 0;

const updateMapLayoutOffsets = () => {
    if (!iframeContainerEl || !mainContainerEl) {
        return;
    }
    if (document.body?.dataset.mapPosition === 'top-overlay') {
        iframeContainerEl.style.top = iosKeyboardOffset + 'px';
        mainContainerEl.style.paddingTop = iosKeyboardOffset + 2 + 'px';
    } else {
        iframeContainerEl.style.top = '';
        mainContainerEl.style.paddingTop = '';
    }
};

window.addEventListener('map-position-change', updateMapLayoutOffsets);

if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad') || navigator.userAgent.includes('iPod')) {
    const baseOffset = window.outerHeight - window.visualViewport.height
    window.visualViewport.addEventListener("resize", () => {
        iosKeyboardOffset = window.outerHeight - window.visualViewport.height - baseOffset
        updateMapLayoutOffsets()
    })
}

updateMapLayoutOffsets()

const progressContainer = document.getElementById('map-progress-container')!;
const progressBar = document.getElementById('map-progress-bar') as HTMLElement;

progressContainer.style.display = 'none';

const outputWrapper = document.getElementById('main_text_output_msg_wrapper') as HTMLElement;
const splitBottom = document.getElementById('split-bottom') as HTMLElement;
const splitHandle = document.getElementById('split-handle')!;
const stickyArea = document.getElementById('sticky-area') as HTMLElement;
const multiBindsElement = document.getElementById('multi-binds');
const STICKY_LINES = 50;
const DOUBLE_CLICK_TIMEOUT_MS = 300;

setOutputTimestampVisibility(getRenderSettings().showTimestamps);
onRenderSettingsChange((render) => {
    setOutputTimestampVisibility(render.showTimestamps);
});

// Scroll/wheel/resize/drag split-view detection, trimming, and sticky-mirror
// live in the shared engine (also used by forge-ui).
// EXPERIMENT: `?output=react|react-dom` renders the output as a React component,
// `?output=xterm|xterm-webgl` with xterm.js (see output/experimental/ and
// e2e/output-flood.bench.ts).
const experimentalOutput = new URLSearchParams(window.location.search).get('output');
const outputMessageHandler = experimentalOutput === 'react' || experimentalOutput === 'react-dom'
    ? mountReactOutput(mudClient, {
        outputWrapper,
        before: splitBottom,
        mode: experimentalOutput,
        maxElements: () => getDeviceViewSettings().outputMaxElements,
    })
    : experimentalOutput === 'xterm' || experimentalOutput === 'xterm-webgl'
    ? lazyOutputHandler(import('./output/experimental/XtermOutput').then(({mountXtermOutput}) => mountXtermOutput(mudClient, {
        outputWrapper,
        mode: experimentalOutput,
        maxElements: () => getDeviceViewSettings().outputMaxElements,
    })))
    : setupOutputMessageHandler(mudClient, {
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

// Multibinds appearing or disappearing is stock-only layout churn, so its
// extra suppression + forced rescroll stays here, layered on top of the
// shared engine via the returned handle.
if (multiBindsElement) {
    const mutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                outputMessageHandler.suppressSplitView(500);

                // Force scroll to bottom after layout settles
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const isAtBottom = outputWrapper.scrollTop + outputWrapper.clientHeight + splitBottom.clientHeight >= outputWrapper.scrollHeight - 1;
                        if (isAtBottom) {
                            outputWrapper.scrollTop = outputWrapper.scrollHeight;
                        }
                    });
                });
            }
        }
    });
    mutationObserver.observe(multiBindsElement, {
        attributes: true,
        attributeFilter: ['class']
    });
}

setupOutputContextMenu(outputWrapper);


function closeHistoryScrollback() {
    outputWrapper.scrollTop = outputWrapper.scrollHeight;
}


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

function updateProgress(p: number, loaded?: number, total?: number) {
    progressContainer.style.display = 'block';
    if (p < 0) {
        // Indeterminate progress (version check in progress)
        progressBar.style.width = '100%';
        progressBar.textContent = '';
    } else {
        progressBar.style.width = `${p}%`;
        if (loaded !== undefined && total !== undefined && total > 0) {
            const loadedKb = Math.floor(loaded / 1024);
            const totalKb = Math.ceil(total / 1024);
            progressBar.textContent = `${loadedKb} / ${totalKb} KB`;
        } else {
            progressBar.textContent = `${Math.floor(p)}%`;
        }
    }
}

// Load map data and colors asynchronously
const mapDataPromise = loadMapData(updateProgress);
const colorsPromise = loadColors();

// When both are loaded, dispatch events
Promise.all([mapDataPromise, colorsPromise])
    .then(([mapData, colors]) => {
        console.log('Map data and colors loaded successfully');
        progressContainer.style.display = 'none';

        // Render LocationLabel component before initializing the map
        // so it can receive the initial location event
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

        const {startId, reader, pathFinder} = client.Map.initialize(mapData, colors);
        const savedAlgorithm = getMapSettings().pathFindingAlgorithm;
        if (savedAlgorithm && pathFinder.setAlgorithm) {
            pathFinder.setAlgorithm(savedAlgorithm);
        }
        const embedded = new EmbeddedMap(reader, startId);
        embedded.pathFinder = pathFinder;
        setEmbeddedMap(embedded);

        // Single place the view is reconciled with map data, however it changed:
        // a data refresh, a whole map pushed from the editor, or individual areas
        // synced from it. The view holds its own reader reference and the renderer
        // caches per-area geometry, so neither a swapped reader nor an in-place
        // edit shows up on its own.
        client.Map.onAreasChanged((areaIds) => {
            const currentEmbedded = getEmbeddedMap();
            const currentReader = client.Map.tryGetMapReader();
            if (!currentEmbedded || !currentReader) return;

            if (currentEmbedded.reader !== currentReader) {
                // The map was rebuilt — the old reader (and its renderer) are stale.
                currentEmbedded.reload(currentReader);
                currentEmbedded.pathFinder = client.Map.getPathFinder();
                const algorithm = getMapSettings().pathFindingAlgorithm;
                if (algorithm && currentEmbedded.pathFinder?.setAlgorithm) {
                    currentEmbedded.pathFinder.setAlgorithm(algorithm);
                }
            } else {
                currentEmbedded.refreshAreas(areaIds);
            }
        });

        subscribeToMapData((newMapData) => {
            if (!newMapData) return;
            if (!getEmbeddedMap()) return;

            // initialize() announces the new areas, and the handler above swaps
            // the reader into the view.
            client.Map.initialize(newMapData, colors);
        }, { emitInitial: false });
    })
    .catch(error => {
        progressContainer.style.display = 'none';
        console.error('Failed to load map data or colors:', error);
    });


// Track connection state
let isConnected = false;
let isConnecting = false;
let isDisconnecting = false;
let playbackMode = false;
let authClosed = false;
let lastSystemLoginMessage: string | null = null;

eventBus.on('gmcp_msg.system.login', (args) => {
    const loginMsg = args.text
    if (loginMsg) {
        lastSystemLoginMessage = loginMsg.trim()
    }
});

client.on('gmcp_msg.room.long', () => {
    lastSystemLoginMessage = null;
});

// Function to update the connect button state
function updateConnectButtons() {
    const authPanel = document.getElementById('auth-panel');
    const authOverlay = document.getElementById('auth-overlay') as HTMLElement | null;

    // Connecting: the form and the connect button give way to the spinner.
    authPanel?.classList.toggle('is-connecting', isConnecting);

    // Offline with the login screen dismissed: the command line shows the closed
    // connection and offers to reconnect in place of the send button.
    setConnectionOffline(!isConnected && !isConnecting && authClosed);
    setConnectionStatus(isConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected', mudClient.getProxyMode());


    if (authOverlay) {
        authOverlay.style.display = (!isConnected && !playbackMode && !authClosed) ? 'flex' : 'none';
    }

    updateMainMenuItem('disconnect-button', isConnected
        ? { label: 'Rozłącz', disabled: isDisconnecting, tone: 'danger' }
        : { label: 'Połącz', disabled: isConnecting, tone: undefined });

    renderSystemLoginMessage(!isConnected && !isConnecting ? lastSystemLoginMessage : null);
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
        if (aboutPassword) password.value = '';
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

// Handle client connect event
mudClient.on('client.connect', () => {
    isConnected = true;
    isConnecting = false;
    isDisconnecting = false;
    cancelProxyResume();
    updateConnectButtons();
    eventBus.emit('refreshPositionWhenAble');
    const wakeLockSetting = getShellSettings().wakeLock;
    if (wakeLockSetting !== false) {
        preventTabSleep();
    }
    console.log('Client connected to Arkadia server.');
});

// Disconnect diagnostics, for the console only. They were shown in the output while we
// were working out why mobile players were being dropped, and that investigation is
// over: the answer was that Chrome freezes a backgrounded tab, which the session proxy
// now survives. Close codes and background timings say nothing to a player and read as
// alarming noise attached to an event that, behind the proxy, costs them nothing.
let lastCloseEvent: CloseEvent | null = null;
let hiddenSince: number | null = null;
let lastReturnFromBackground: {at: number; backgroundMs: number} | null = null;

mudClient.on('close', (event) => {
    lastCloseEvent = event;
});

const formatDuration = (ms: number): string => {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
};

const describeDisconnect = (): string => {
    const details: string[] = [];

    if (mudClient.lastCloseCause === 'user') {
        details.push('rozłączenie na żądanie');
    } else if (mudClient.lastCloseCause === 'watchdog') {
        details.push('brak odpowiedzi serwera na sprawdzenie połączenia');
    } else {
        details.push('połączenie zamknięte po stronie serwera lub sieci');
    }

    if (lastCloseEvent) {
        details.push(`kod ${lastCloseEvent.code}${lastCloseEvent.wasClean ? '' : ', zerwane'}`);
        if (lastCloseEvent.reason) details.push(lastCloseEvent.reason);
    }

    if (hiddenSince !== null) {
        details.push(`karta w tle od ${formatDuration(Date.now() - hiddenSince)}`);
    } else if (lastReturnFromBackground && Date.now() - lastReturnFromBackground.at < 120_000) {
        details.push(
            `powrót z tła ${formatDuration(Date.now() - lastReturnFromBackground.at)} temu, po ${formatDuration(lastReturnFromBackground.backgroundMs)} w tle`,
        );
    }

    return details.join('; ');
};

/*
Reattach after the browser's socket dies behind a session proxy.

Losing that socket is not losing the game: the proxy still holds the telnet connection
and the character is still standing where it was. A phone freezing a backgrounded tab
produces exactly this, several times a session, so it has to heal itself rather than
hand the player a disconnect notice and a Połącz button.

The first attempt is immediate — a hidden tab still runs JavaScript, so the socket is
often back before the player looks. A frozen one runs nothing, but the close event is
delivered on resume and the attempt happens then instead. Later attempts back off, for
the case the proxy itself is unreachable, and after the last one we say so plainly.
*/
const PROXY_RESUME_DELAYS_MS = [0, 2_000, 5_000, 15_000, 30_000];
let proxyResumeAttempt = 0;
let proxyResumeTimer: number | null = null;
// Set when the proxy reports the game ended the session. Reattaching then is not a
// resume — it is a fresh login the player did not ask for, on top of the explanation
// they came back to read.
let proxySessionEnded = false;

const cancelProxyResume = (): void => {
    if (proxyResumeTimer !== null) {
        clearTimeout(proxyResumeTimer);
        proxyResumeTimer = null;
    }
    proxyResumeAttempt = 0;
    // Consumed: it only ever suppresses the one reattach that would have followed the
    // session the game ended. A later connection starts with a clean slate.
    proxySessionEnded = false;
};

const scheduleProxyResume = (): void => {
    if (proxyResumeTimer !== null) return;
    if (proxyResumeAttempt >= PROXY_RESUME_DELAYS_MS.length) {
        proxyResumeAttempt = 0;
        authClosed = false;
        updateConnectButtons();
        disableTabSleepPrevention();
        client.println('Nie udało się wznowić połączenia. Kliknij Połącz, aby spróbować ponownie.');
        return;
    }
    const delay = PROXY_RESUME_DELAYS_MS[proxyResumeAttempt];
    proxyResumeAttempt += 1;
    proxyResumeTimer = window.setTimeout(() => {
        proxyResumeTimer = null;
        if (isConnected || isConnecting) return;
        mudClient.connect();
    }, delay);
};

// Handle client disconnect event
mudClient.on('client.disconnect', () => {
    const willResume = shouldReattachAfterClose({
        usesSessionProxy: mudClient.usesSessionProxy(),
        closedByUser: mudClient.lastCloseCause === 'user',
        sessionEndedByGame: proxySessionEnded,
    });
    isConnected = false;
    isConnecting = false;
    isDisconnecting = false;
    // Reopening the login overlay would be wrong while a reattach is in flight: the
    // character is still in the world, so there is nothing to log in to, and it would
    // flash over the output for as long as the reconnect takes.
    if (!willResume) authClosed = false;
    updateConnectButtons();
    console.log(`Client disconnected from Arkadia server: ${describeDisconnect()}`);

    if (willResume) {
        scheduleProxyResume();
        return;
    }

    cancelProxyResume();
    disableTabSleepPrevention();
    client.println('Rozłączono z serwerem Arkadii.');
});

// What the session proxy reports on attach. A resume is worth saying out loud: the
// player pressed nothing and their character is still where they left it, which is
// otherwise indistinguishable from a fresh login that happened to work.
mudClient.on('proxy.session', (info) => {
    if (info?.upstreamClosed) {
        // The game itself ended this session while nobody was listening. The replay
        // that arrived just before this carries its parting words — "zostajesz
        // rozlaczony z powodu bezczynnosci" and the like — which is the entire reason
        // an ended session is kept around instead of dropped. Reattaching would open a
        // fresh connection and bury that under a login banner.
        proxySessionEnded = true;
        return;
    }
    if (!info?.resumed) return;
    // Already in the world: the login screen has nothing left to ask for.
    authClosed = true;
    updateConnectButtons();
    const away = typeof info.sessionAgeMs === 'number'
        ? ` (sesja trwa ${Math.round(info.sessionAgeMs / 1000)} s)`
        : '';
    if (isResumeNoticeEnabled()) {
        client.println(`Wznowiono polaczenie z gra${away}.`);
    }
    // Not covered by the setting. Losing output is not routine, and a gap the player
    // cannot account for is worse than a line they asked not to see.
    if (info.droppedBytes) {
        client.println(`Czesc tekstu z czasu nieobecnosci przepadla (${info.droppedBytes} bajtow).`);
    }
});

// `core.keepalive` toggling is only useful on Safari (where the original user
// reported background-tab disconnects). On Chromium/Firefox it causes the
// opposite problem: telling the server to stop sending data lets the idle TCP
// connection get killed by browser/server/proxy timeouts.
const isSafari = /^((?!chrome|chromium|edg|android).)*safari/i.test(navigator.userAgent);

// Ensure button state is correct when returning to the tab
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        hiddenSince = Date.now();
        // Deliberately no connection check on the way out. Mobile suspends a
        // backgrounded tab within moments of this event, so a check armed here can
        // only ever expire unattended and report a silence nobody was listening for.
        if (isConnected && isSafari) {
            mudClient.sendGmcp('core.keepalive', {disabled: true});
        }
        return;
    }

    if (hiddenSince !== null) {
        lastReturnFromBackground = {at: Date.now(), backgroundMs: Date.now() - hiddenSince};
        hiddenSince = null;
    }

    // Coming back is when the answer matters: the socket may well have died while we
    // were away, and the buttons have to reflect that.
    if (isConnected) {
        mudClient.checkConnection();
    }

    // Suppress split view checks during tab reactivation reflow
    outputMessageHandler.suppressSplitView(500);

    const socketOpen = mudClient.isSocketOpen();
    if (socketOpen && !isConnected) {
        isConnected = true;
        updateConnectButtons();
    } else if (!socketOpen && isConnected) {
        // Belt and braces: a socket that closed without delivering its close event.
        // The ordinary path is client.disconnect, which fires on resume for a tab that
        // was frozen, and reattaches there.
        isConnected = false;
        isConnecting = false;
        isDisconnecting = false;
        updateConnectButtons();
        if (mudClient.usesSessionProxy()) {
            scheduleProxyResume();
        }
    } else if (socketOpen && isConnected && isSafari) {
        mudClient.sendGmcp('core.keepalive', {disabled: false});
    }
});


// Direction (numpad movement) keybinds and the `binds` seed now live in the
// client (src/client/scripts/directionBinds.ts + KeyBindingManager), so every
// UI gets them identically. This UI only supplies the modal-open suppression
// via UiPort.shouldSuppressKeys (see installClientPorts).

// This module is loaded by the shell router (main.ts) through a dynamic import,
// which usually resolves after DOMContentLoaded has already fired.
whenDocumentReady(() => {
    // Desktop gets the window manager by default (one-time flip). Must run
    // before anything reads the layout state — panels and popups decide
    // whether to auto-open from it.
    applyDefaultLayoutMode();

    // Request persistent storage
    if (navigator.storage?.persist) {
        navigator.storage.persist().then(granted => {
            console.log(granted ? 'Persistent storage granted' : 'Persistent storage not granted');
        }).catch(err => {
            console.warn('Failed to request persistent storage:', err);
        });
    }


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

        // Check for latest version from GitHub deployments API
        fetch('https://api.github.com/repos/Delwing/arkadia-web-client-extension/deployments?environment=github-pages')
            .then(response => {
                if (!response.ok) {
                    if (response.status === 403 || response.status === 429) {
                        console.warn('GitHub API rate limit exceeded, skipping version check');
                        return null;
                    }
                    throw new Error(`Failed to fetch latest deployment: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (!data) return;
                // First deployment in the list is the most recent
                if (Array.isArray(data) && data.length > 0) {
                    const latestDeployment = data[0];
                    const latestSha = latestDeployment.sha?.substring(0, __COMMIT_SHA__.length);
                    if (latestSha && latestSha !== __COMMIT_SHA__) {
                        const warningDiv = document.createElement('div');
                        warningDiv.className = 'commit-info-update';
                        warningDiv.textContent = 'Nowa wersja dostępna - odśwież stronę';
                        commitInfo.appendChild(warningDiv);
                    }
                }
            })
            .catch(err => {
                console.warn('Could not check for updates:', err);
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
    onShellSettingsChange((shell) => {
        if (shell.wakeLock && isConnected) {
            preventTabSleep();
        } else {
            disableTabSleepPrevention();
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
        messageInput.focus();
    };
    mudClient.on('client.connect', focusCommandInputOnConnect);

    if (contentArea) {
        const interactiveSelector = 'a, button, input, textarea, select, [contenteditable], .plugin-window, .app-modal, .managed-panel';

        const focusMessageInput = (target: EventTarget | null) => {
            // Check if there's a text selection
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) {
                return;
            }

            if (!target || !(target instanceof Element)) {
                messageInput.focus();
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
                    // Keep the scrollback where it is: a link clicked in the
                    // history view must not close the split view.
                    messageInput.setAttribute('data-keep-scroll', '');
                    messageInput.focus({preventScroll: true});
                    messageInput.removeAttribute('data-keep-scroll');
                }, 0);
                return;
            }

            messageInput.focus();
            setTimeout(() => {
                messageInput.focus()
            }, 1)
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
        client.on('notify', (payload) => {
            const detail = (payload ?? {}) as { text?: string; time?: number; system?: boolean };
            const div = document.createElement('div');
            div.className = 'notification';
            div.textContent = detail.text ?? '';
            notificationCenter.appendChild(div);
            const timeout = typeof detail.time === 'number' ? detail.time : 2000;
            setTimeout(() => div.remove(), timeout);
            if (detail.system && detail.text) {
                client.notify(detail.text);
            }
        });
    }

    const toggleConnection = () => {
        if (isConnected) {
            // Disconnect
            if (isDisconnecting) {
                return;
            }
            isDisconnecting = true;
            updateConnectButtons();
            mudClient.disconnect();
            // Fallback: ensure state updates after a delay if disconnect event doesn't fire
            setTimeout(() => {
                if (isDisconnecting && !mudClient.isSocketOpen()) {
                    isConnected = false;
                    isDisconnecting = false;
                    updateConnectButtons();
                }
            }, 1000);
        } else {
            // Connect
            if (isConnecting) {
                return;
            }
            isConnecting = true;
            lastSystemLoginMessage = null;
            updateConnectButtons();
            void client.prepareSounds();
            mudClient.connect();
        }
    };

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

    // The ⋯ menu next to the command line (Logi registers itself).
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
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => console.error('Failed to enter fullscreen:', err));
        } else {
            document.exitFullscreen().catch(err => console.error('Failed to exit fullscreen:', err));
        }
    };
    const builtins: [string, string, MainMenuGroup, string, () => void, string?, string[]?][] = [
        ['automation-button', 'Automatyzacja', 'gra', 'zap', () => automationModal?.show(), undefined, ['aliasy', 'triggery', 'wyzwalacze']],
        ['binds-button', 'Klawisze', 'gra', 'keyboard', () => bindsModal?.show()],
        ['places-button', 'Miejsca', 'gra', 'map-pin', () => placesModal?.show()],
        ['recordings-button', 'Nagrania', 'gra', 'record', () => recordingsModal?.show()],
        ['people-browser-button', 'Baza postaci', 'gra', 'users', () => eventBus.emit('peopleBrowser.popup.open')],
        ['npc-button', 'Odbiorcy paczek', 'gra', 'package', () => eventBus.emit('packageReceiver.popup.open')],
        ['share-location-button', 'Kod QR lokacji', 'gra', 'qr-code', shareLocation, 'Kod QR'],
        ['scripts-button', 'Skrypty (wtyczki)', 'narzedzia', 'code', () => scriptsModal?.show(), 'Skrypty'],
        ['data-sources-button', 'Źródła danych', 'narzedzia', 'database', () => eventBus.emit('dataSources.popup.open')],
        ['helper-button', 'Helper', 'narzedzia', 'plug', () => helperModal?.show()],
    ];
    builtins.forEach(([id, label, group, icon, onSelect, shortLabel, keywords], index) => {
        registerMainMenuItem({id, label, shortLabel, keywords, group, icon, order: (index + 1) * 10, onSelect, source: 'builtin'});
    });
    // One entry for the whole dialog: it opens where it was left (page, unsaved edits).
    registerMainMenuItem({
        id: 'settings-button', label: 'Ustawienia', group: 'ustawienia', icon: 'settings', order: 5, onSelect: () => { requestSettingsResume(); settingsModal?.show(); }, source: 'builtin',
        keywords: ['opcje', 'postać', 'interfejs', 'przyciski', 'menu kołowe', 'eksport', 'import', 'synchronizacja', 'kopia'],
    });
    // The forge HUD is the other shell this page can boot (see main.ts).
    registerMainMenuItem({
        id: 'shell-button', label: 'Interfejs Kuźnia', shortLabel: 'Kuźnia', group: 'narzedzia', icon: 'layout', order: 190,
        onSelect: () => switchShell('forge'), source: 'builtin', keywords: ['forge', 'wygląd', 'hud'],
    });
    // Logi (170) registers itself in Narzędzia.
    registerMainMenuItem({id: 'docs-button', label: 'Dokumentacja', shortLabel: 'Pomoc', group: 'narzedzia', icon: 'book', order: 180, onSelect: () => eventBus.emit('docs.popup.open'), source: 'builtin'});
    registerMainMenuItem({id: 'fullscreen-button', label: 'Pełny ekran', group: 'sesja', icon: 'fullscreen', order: 900, onSelect: toggleFullscreen, source: 'builtin'});
    registerMainMenuItem({id: 'disconnect-button', label: isConnected ? 'Rozłącz' : 'Połącz', group: 'sesja', icon: 'power', order: 910, onSelect: toggleConnection, tone: 'danger', source: 'builtin'});

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

    mudClient.on('recording.loaded', () => {
        playbackMode = true;
        updateConnectButtons();
    });

    mudClient.on('playback.start', () => {
        playbackMode = true;
        updateConnectButtons();
    });

    mudClient.on('playback.stop', () => {
        playbackMode = false;
        updateConnectButtons();
    });

    if (wakeLockButton) {
        wakeLockButton.addEventListener('click', () => {
            if (wakeLockEnabled) {
                disableTabSleepPrevention();
            } else {
                preventTabSleep();
            }
        });
    }

    if (loginForm) {
        let unsubLoginMessage: (() => void) | null = null;
        let unsubLoginEcho: (() => void) | null = null;

        const clearPendingLogin = () => {
            unsubLoginMessage?.();
            unsubLoginEcho?.();
            unsubLoginMessage = null;
            unsubLoginEcho = null;
        };

        mudClient.on('client.disconnect', clearPendingLogin);

        // A resumed session is already logged in, so nothing armed by the login form
        // should ever fire. The character-name handler waits for the next line of game
        // text — which after a resume is ordinary output — and would type the name into
        // the world as a command; the password handler waits for an echo-off prompt that
        // is never coming and stays armed until something else triggers it.
        mudClient.on('proxy.session', (info) => {
            if (info?.resumed) {
                clearPendingLogin();
            }
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearPendingLogin();
            const character = loginCharacter?.value || '';
            const password = loginPassword?.value || '';

            if (character) {
                unsubLoginMessage = eventBus.on('socket.incoming', () => {
                    unsubLoginMessage?.();
                    unsubLoginMessage = null;
                    client.send(character, false);
                });
            }

            if (password) {
                unsubLoginEcho = eventBus.on('telnet.echo', (serverEchoing: boolean) => {
                    if (serverEchoing) {
                        unsubLoginEcho?.();
                        unsubLoginEcho = null;
                        client.send(password, false, {preserveCase: true});
                    }
                });
            }

            // Re-submitting while a connection is in flight re-arms the credential
            // listeners above, but must not open a second socket: two attaches with
            // one session id make the proxy kill one as "replaced by a newer attach".
            if (!isConnected && !isConnecting) {
                isConnecting = true;
                lastSystemLoginMessage = null;
                updateConnectButtons();
                void client.prepareSounds();
                mudClient.connect();
            }
        });
    }

    // Handle connect/disconnect button click
    const handleConnect = () => {
        if (isConnected) {
            mudClient.disconnect();
        } else {
            // A second connect while one is in flight opens a second socket with the
            // same session id, and the proxy kills one of them as "replaced by a
            // newer attach" — a double tap must not race itself.
            if (isConnecting) {
                return;
            }
            isConnecting = true;
            lastSystemLoginMessage = null;
            updateConnectButtons();
            void client.prepareSounds();
            mudClient.connect();
        }
    };
    connectButton?.addEventListener('click', handleConnect);
    setReconnectHandler(handleConnect);

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
            onModeChange: (mode) => mudClient.setProxyMode(mode),
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
            authClosed = true;
            updateConnectButtons();
            // Dismissing the login screen without connecting leaves the command
            // line as the place to type, same as after a connect.
            focusCommandInputOnConnect();
        };
        authClose.addEventListener('click', closeAuthOverlay);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !authClosed && !isConnected && !playbackMode) {
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
        // The multibind import lives in Ustawienia → Import z innych klientów.
        createRoot(bindsRoot).render(createElement(Keys, {
            helperConnection,
            headerSlot: document.getElementById('binds-header-slot'),
            onImport: () => openSettingsPage('data-import', 'import-multibinds'),
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
        createRoot(layoutManagerRoot).render(
            createElement(LayoutManagerWrapper, {
                mapElement,
                objectListElement,
            })
        );
    }
});


window.client = mudClient;



