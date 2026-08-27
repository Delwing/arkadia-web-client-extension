// The darkly base + style.css + colour themes + layout.css, @imported into one
// chunk (main-theme.css) to lock the stock cascade order — see that file for why.
import './main-theme.css'
import './popups/popups.css'
import '@web-ui/messageFlair.css'
import '@web-ui/buttons/desktopButtons.css'
import '@web-ui/buttons/mobileCommandRadial.css'
import '@web-ui/buttons/mobileDirectionButtons.css'
import mudClient, {PROXY_WEBSOCKET_URL} from "./MudClient.ts";
import {OPEN_SETTINGS_EVENT, type OpenSettingsDetail} from "./assistant/openSettings.ts";
import {ProxyControls} from "./hostProxy/ProxyControls.tsx";
import recordingManager from "./RecordingManager.ts";
import eventBus from "@modules/core/eventBus";
import {setupOutputContextMenu} from "./outputContextMenu";
import initPipeStatus from "./pipeStatus";
import {Dropdown, Modal} from 'bootstrap';
import ObjectList from "./ObjectList";
import {mountMigratedComponents} from "@web-ui/mountComponents.tsx";
import FightTitle from "./FightTitle";
import HpTitle from "./HpTitle";
import MobileDirectionButtons from "@web-ui/buttons/MobileDirectionButtons";
import DesktopButtons from "@web-ui/buttons/DesktopButtons";
import MobileCommandRadial from "@web-ui/buttons/MobileCommandRadial";
import UiSettings from "./uiSettings/UiSettings";
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
import {LocationLabel} from "@web-ui/components/map/LocationLabel"
import {PauseIcon} from "@web-ui/components/map/PauseIcon"
import Binds from "./options/Binds.tsx"
import Scripts from "./options/Scripts.tsx"
import Aliases from "./options/Aliases.tsx"
import Recordings from "./options/Recordings.tsx"
import CharacterSettings from "./options/CharacterSettings.tsx"
import ExportImport from "./options/ExportImport.tsx"
import CharacterManagement from "./options/CharacterManagementModal.tsx"
import UserTriggers from "./options/UserTriggers.tsx"
import Shortcuts from "./options/Shortcuts.tsx"
import LocationNotes from "./options/LocationNotes.tsx"
import LocationNoteEditor from "./LocationNoteEditor.tsx"
import ButtonsSettings from "./options/ButtonsSettings.tsx"
import HelperSettings from "./options/HelperSettings.tsx"
import MobileRadialCommands from "./options/MobileRadialCommands.tsx"
import {invalidateLayoutCache, LayoutManagerWrapper, loadLayoutState, saveLayoutState} from "@web/layout"
import {globalStorage} from "@modules/core/storage"
import {setOutputTimestampVisibility, setupOutputMessageHandler} from "@shared/dom/outputMessageHandler";
import {CommandInputController} from "./commandInput/CommandInputController";
import {installClientPorts} from "./installClientPorts";
import {installContentWidthMeasurer} from "./contentWidthMeasurer";
import {bootstrapGameClient} from "./clientBootstrap";

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

function isLikelyTouchDevice() {
    return (
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
        navigator.maxTouchPoints > 0
    );
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

initPipeStatus();

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
    const connectButton = document.getElementById('connect-button') as HTMLButtonElement | null;
    const connectButtonInline = document.getElementById('connect-button-inline') as HTMLButtonElement | null;
    const loginForm = document.getElementById('login-form') as HTMLFormElement | null;
    const authOverlay = document.getElementById('auth-overlay') as HTMLElement | null;
    const spinner = document.getElementById('connecting-spinner') as HTMLElement | null;
    const disconnectButton = document.getElementById('disconnect-button') as HTMLButtonElement | null;

    if (connectButton) {
        if (isConnected || isConnecting || authClosed) {
            connectButton.style.display = 'none';
        } else {
            connectButton.style.display = '';
            connectButton.textContent = 'Połącz';
            connectButton.classList.add('disconnected');
            connectButton.classList.remove('connected');
        }
    }

    if (connectButtonInline) {
        if (!isConnected && !isConnecting && authClosed) {
            connectButtonInline.style.display = 'block';
        } else {
            connectButtonInline.style.display = 'none';
        }
    }


    if (loginForm) {
        loginForm.style.display = (!isConnected && !isConnecting) ? 'flex' : 'none';
    }

    if (spinner) {
        spinner.style.display = isConnecting ? 'block' : 'none';
    }

    if (authOverlay) {
        authOverlay.style.display = (!isConnected && !playbackMode && !authClosed) ? 'flex' : 'none';
    }

    if (disconnectButton) {
        if (isConnected) {
            disconnectButton.textContent = 'Rozłącz';
            disconnectButton.disabled = isDisconnecting;
        } else {
            disconnectButton.textContent = 'Połącz';
            disconnectButton.disabled = isConnecting;
        }
    }

    const systemLoginMessageEl = document.getElementById('system-login-message');
    if (systemLoginMessageEl) {
        if (!isConnected && !isConnecting && lastSystemLoginMessage) {
            systemLoginMessageEl.textContent = lastSystemLoginMessage;
        } else {
            systemLoginMessageEl.textContent = '';
        }
    }
}

// Handle client connect event
mudClient.on('client.connect', () => {
    isConnected = true;
    isConnecting = false;
    isDisconnecting = false;
    updateConnectButtons();
    eventBus.emit('refreshPositionWhenAble');
    const wakeLockSetting = getShellSettings().wakeLock;
    if (wakeLockSetting !== false) {
        preventTabSleep();
    }
    console.log('Client connected to Arkadia server.');
});

// Disconnect diagnostics. A phone has no devtools, and "rozłączyło mnie" reads the
// same whether the watchdog hung up, the user did, or the network did — so the one
// line the player can actually see has to name the path and the close code.
let lastCloseEvent: CloseEvent | null = null;
let hiddenSince: number | null = null;
let lastReturnFromBackground: {at: number; backgroundMs: number} | null = null;

mudClient.on('close', (event) => {
    lastCloseEvent = event;
});

// Chrome's Page Lifecycle events. First-hand evidence that the browser suspended
// us, rather than us inferring it from a timer that came back late — though the
// absence of a freeze proves nothing, since Android can suspend the whole browser
// process without the page ever being told.
let freezeCount = 0;
let lastFreezeAt: number | null = null;
(document as EventTarget).addEventListener('freeze', () => {
    freezeCount += 1;
    lastFreezeAt = Date.now();
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

/**
 * The detail block for a drop nobody asked for. Every line answers a question that
 * changes what we would fix next, so it is worth the screen space on a phone, where
 * a screenshot of the output is the whole bug report.
 */
const disconnectDiagnostics = (): string[] => {
    const now = Date.now();
    const lines: string[] = [];

    // Whether our own timers were running. The ping loop fires every 3s, so a gap in
    // minutes means the page was frozen and no client-side keepalive could have run;
    // seconds means we were awake and it was the connection that went.
    const inbound = mudClient.lastInboundTime > 0
        ? `${formatDuration(now - mudClient.lastInboundTime)} temu`
        : 'nigdy';
    const ping = mudClient.lastPingTime > 0
        ? `${formatDuration(now - mudClient.lastPingTime)} temu`
        : 'nigdy';
    lines.push(`  ruch: ostatnie dane ${inbound}, ostatni ping ${ping}`);

    lines.push(
        lastFreezeAt !== null
            ? `  karta: zamrozona przez przegladarke ${freezeCount}x, ostatnio ${formatDuration(now - lastFreezeAt)} temu`
            : '  karta: bez zamrozenia zgloszonego przez przegladarke',
    );

    // A page playing audio is exempt from Chrome's tab freezing, so this loop is the
    // only thing keeping the ping alive while the user is in another app.
    const audio = client.SoundManager.keepaliveDetail;
    const audioParts = [audio.running ? 'gra' : 'nie gra'];
    if (audio.skippedOnIOS) {
        audioParts.push('pominiety na iOS');
    } else if (audio.startedAt === 0) {
        audioParts.push(audio.error ? `nigdy nie wystartowal: ${audio.error}` : 'nigdy nie wystartowal');
    } else {
        audioParts.push(`start ${formatDuration(now - audio.startedAt)} temu`);
        if (!audio.running && audio.pausedAt > 0) {
            audioParts.push(`pauza ${formatDuration(now - audio.pausedAt)} temu`);
        }
    }
    lines.push(`  audio-keepalive: ${audioParts.join(', ')}`);

    lines.push(`  tryb polaczenia: ${mudClient.getProxyMode()}`);

    return lines;
};

// Handle client disconnect event
mudClient.on('client.disconnect', () => {
    isConnected = false;
    isConnecting = false;
    isDisconnecting = false;
    authClosed = false;
    updateConnectButtons();
    disableTabSleepPrevention();
    const reason = describeDisconnect();
    client.println(`Rozłączono z serwerem Arkadii. [${reason}]`);
    // A disconnect the user asked for needs no post-mortem.
    const diagnostics = mudClient.lastCloseCause === 'user' ? [] : disconnectDiagnostics();
    diagnostics.forEach(line => client.println(line));
    console.log(`Client disconnected from Arkadia server: ${reason}`, diagnostics);
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
        isConnected = false;
        isConnecting = false;
        isDisconnecting = false;
        updateConnectButtons();
    } else if (socketOpen && isConnected && isSafari) {
        mudClient.sendGmcp('core.keepalive', {disabled: false});
    }
});


// Direction (numpad movement) keybinds and the `binds` seed now live in the
// client (src/client/scripts/directionBinds.ts + KeyBindingManager), so every
// UI gets them identically. This UI only supplies the modal-open suppression
// via UiPort.shouldSuppressKeys (see installClientPorts).

document.addEventListener('DOMContentLoaded', () => {
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

        const shaSpan = document.createElement('span');
        shaSpan.textContent = __COMMIT_SHA__;

        const repoLink = document.createElement('a');
        repoLink.href = 'https://github.com/Delwing/arkadia-web-client-extension';
        repoLink.target = '_blank';
        repoLink.rel = 'noopener noreferrer';
        repoLink.className = 'commit-info-link';
        repoLink.title = 'Otworz repozytorium na GitHub';
        repoLink.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

        const dateSpan = document.createElement('span');
        dateSpan.textContent = formatCommitDate(__COMMIT_DATE__);

        const line = document.createElement('div');
        line.className = 'commit-info-line';
        line.append(repoLink, shaSpan, dateSpan);

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
                        warningDiv.style.color = 'red';
                        warningDiv.style.marginTop = '0.5rem';
                        warningDiv.textContent = 'Nowa wersja dostępna - odśwież stronę';
                        commitInfo.appendChild(warningDiv);
                    }
                }
            })
            .catch(err => {
                console.warn('Could not check for updates:', err);
            });
    }

    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    const passwordInput = document.getElementById('message-input-password') as HTMLInputElement;
    const sendButton = document.getElementById('send-button') as HTMLButtonElement;
    let clearInputOnSend = getRenderSettings().clearInputOnSend;
    onRenderSettingsChange((render) => {
        clearInputOnSend = render.clearInputOnSend;
    });
    onShellSettingsChange((shell) => {
        if (shell.wakeLock && isConnected) {
            preventTabSleep();
        } else {
            disableTabSleepPrevention();
        }
    });
    const historyUpButton = document.getElementById('history-up-button') as HTMLButtonElement | null;
    const historyDownButton = document.getElementById('history-down-button') as HTMLButtonElement | null;
    const connectButton = document.getElementById('connect-button') as HTMLButtonElement | null;
    const connectButtonInline = document.getElementById('connect-button-inline') as HTMLButtonElement | null;
    const menuButton = document.getElementById('menu-button') as HTMLButtonElement | null;
    const optionsButton = document.getElementById('options-button') as HTMLButtonElement;
    const exportImportButton = document.getElementById('export-import-button') as HTMLButtonElement | null;
    const optionsSave = document.getElementById('options-save') as HTMLButtonElement | null;
    const disconnectButton = document.getElementById('disconnect-button') as HTMLButtonElement | null;
    const bindsButton = document.getElementById('binds-button') as HTMLButtonElement | null;
    const npcButton = document.getElementById('npc-button') as HTMLButtonElement | null;
    const scriptsButton = document.getElementById('scripts-button') as HTMLButtonElement | null;
    const aliasesButton = document.getElementById('aliases-button') as HTMLButtonElement | null;
    const triggersButton = document.getElementById('triggers-button') as HTMLButtonElement | null;
    const recordingsButton = document.getElementById('recordings-button') as HTMLButtonElement | null;
    const shortcutsButton = document.getElementById('shortcuts-button') as HTMLButtonElement | null;
    const locationNotesButton = document.getElementById('location-notes-button') as HTMLButtonElement | null;
    const peopleBrowserButton = document.getElementById('people-browser-button') as HTMLButtonElement | null;
    const dataSourcesButton = document.getElementById('data-sources-button') as HTMLButtonElement | null;
    const mobileButtonsButton = document.getElementById('mobile-buttons-button') as HTMLButtonElement | null;
    const mobileRadialButton = document.getElementById('mobile-radial-button') as HTMLButtonElement | null;
    const helperButton = document.getElementById('helper-button') as HTMLButtonElement | null;
    const recordingButton = document.getElementById('recording-button') as HTMLButtonElement | null;
    wakeLockButton = document.getElementById('wake-lock-button') as HTMLButtonElement | null;
    updateWakeLockButton();

    // Initialize Bootstrap modal
    const optionsModalElement = document.getElementById('options-modal');
    const optionsModal = optionsModalElement ? new Modal(optionsModalElement) : null;
    const uiSettingsModalElement = document.getElementById('ui-settings-modal');
    const uiSettingsModal = uiSettingsModalElement ? new Modal(uiSettingsModalElement) : null;
    const exportImportModalElement = document.getElementById('export-import-modal');
    const exportImportModal = exportImportModalElement ? new Modal(exportImportModalElement) : null;
    const characterManagementModalElement = document.getElementById('character-management-modal');
    const characterManagementModal = characterManagementModalElement ? new Modal(characterManagementModalElement) : null;
    const bindsModalElement = document.getElementById('binds-modal');
    const bindsModal = bindsModalElement ? new Modal(bindsModalElement) : null;
    const scriptsModalElement = document.getElementById('scripts-modal');
    const scriptsModal = scriptsModalElement ? new Modal(scriptsModalElement) : null;
    const aliasesModalElement = document.getElementById('aliases-modal');
    const aliasesModal = aliasesModalElement ? new Modal(aliasesModalElement) : null;
    const triggersModalElement = document.getElementById('triggers-modal');
    const triggersModal = triggersModalElement ? new Modal(triggersModalElement) : null;
    const recordingsModalElement = document.getElementById('recordings-modal');
    const recordingsModal = recordingsModalElement ? new Modal(recordingsModalElement) : null;
    const shortcutsModalElement = document.getElementById('shortcuts-modal');
    const shortcutsModal = shortcutsModalElement ? new Modal(shortcutsModalElement) : null;
    const locationNotesModalElement = document.getElementById('location-notes-modal');
    const locationNotesModal = locationNotesModalElement ? new Modal(locationNotesModalElement) : null;
    const helperModalElement = document.getElementById('helper-modal');
    const helperModal = helperModalElement ? new Modal(helperModalElement) : null;
    const mobileButtonsModalElement = document.getElementById('mobile-buttons-modal');
    const mobileButtonsModal = mobileButtonsModalElement ? new Modal(mobileButtonsModalElement) : null;
    const mobileRadialModalElement = document.getElementById('mobile-radial-modal');
    const mobileRadialModal = mobileRadialModalElement ? new Modal(mobileRadialModalElement) : null;
    const loginCharacter = document.getElementById('login-character') as HTMLInputElement | null;
    const loginPassword = document.getElementById('login-password') as HTMLInputElement | null;
    const loginForm = document.getElementById('login-form') as HTMLFormElement | null;
    const authClose = document.getElementById('auth-close') as HTMLButtonElement | null;
    const notificationCenter = document.getElementById('notification-center') as HTMLElement | null;
    const enableNotificationsSettings = document.getElementById('ui-enable-notifications') as HTMLButtonElement | null;
    const contentArea = document.getElementById('content-area') as HTMLElement | null;

    const focusCommandInputOnConnect = () => {
        if (!messageInput) return;
        const isMobileLike = window.innerWidth < 768 || isLikelyTouchDevice();
        if (isMobileLike) return;
        if (document.hidden) return;
        messageInput.focus();
    };
    mudClient.on('client.connect', focusCommandInputOnConnect);

    if (contentArea) {
        const interactiveSelector = 'a, button, input, textarea, select, [contenteditable], .plugin-window, .modal, .managed-panel';

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
                    messageInput.focus();
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
                const pointerType = event.pointerType || '';
                const isTouchPointer = pointerType === 'touch' || (pointerType === '' && isLikelyTouchDevice());
                if (isTouchPointer) return;
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
    const shareLocationButton = document.getElementById('share-location-button') as HTMLButtonElement | null;
    const locationQrImage = document.getElementById('location-qr-image') as HTMLImageElement | null;
    const locationShareModalElement = document.getElementById('location-share-modal');
    const locationShareModal = locationShareModalElement ? new Modal(locationShareModalElement) : null;

    if (enableNotificationsSettings || enableNotificationsConnection) {
        const updateVisibility = () => {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                if (enableNotificationsSettings) {
                    enableNotificationsSettings.style.display = 'none';
                }
                if (enableNotificationsConnection) {
                    enableNotificationsConnection.style.display = 'none';
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
    }

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

    if (menuButton) {
        new Dropdown(menuButton);
        // The dropdown is trapped inside #input-area's stacking context (z 1001),
        // so pinned floating windows (z 1040+) cover it. Lift the input area while
        // the menu is open, then restore it so floats/modals layer normally again.
        const inputArea = document.getElementById('input-area');
        menuButton.addEventListener('show.bs.dropdown', () => inputArea?.classList.add('menu-open'));
        menuButton.addEventListener('hidden.bs.dropdown', () => inputArea?.classList.remove('menu-open'));
    }

    if (disconnectButton) {
        disconnectButton.addEventListener('click', () => {
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
        });
    }

    window.addEventListener('close-options', () => {
        (document.activeElement as HTMLElement)?.blur?.();
        if (optionsModal) {
            optionsModal.hide();
        }
        if (exportImportModal) {
            exportImportModal.hide();
        }
        if (bindsModal) {
            bindsModal.hide();
        }
        if (scriptsModal) {
            scriptsModal.hide();
        }
        if (aliasesModal) {
            aliasesModal.hide();
        }
        if (triggersModal) {
            triggersModal.hide();
        }
        if (recordingsModal) {
            recordingsModal.hide();
        }
        if (shortcutsModal) {
            shortcutsModal.hide();
        }
        if (locationNotesModal) {
            locationNotesModal.hide();
        }
        if (mobileButtonsModal) {
            mobileButtonsModal.hide();
        }
        if (mobileRadialModal) {
            mobileRadialModal.hide();
        }
    });

    window.addEventListener('show-export-import', () => {
        if (exportImportModal) {
            exportImportModal.show();
        }
    });

    window.addEventListener('show-character-management', () => {
        if (characterManagementModal) {
            characterManagementModal.show();
        }
    });

    // Header buttons in options modal
    const optionsExportImportBtn = document.getElementById('options-export-import-btn');
    const optionsCharactersBtn = document.getElementById('options-characters-btn');

    if (optionsExportImportBtn) {
        optionsExportImportBtn.addEventListener('click', () => {
            (document.activeElement as HTMLElement)?.blur?.();
            optionsModal?.hide();
            setTimeout(() => window.dispatchEvent(new Event('show-export-import')), 150);
        });
    }

    if (optionsCharactersBtn) {
        optionsCharactersBtn.addEventListener('click', () => {
            window.dispatchEvent(new Event('show-character-management'));
        });
    }

    // Add event listener to options button
    if (optionsButton && optionsModal) {
        optionsButton.addEventListener('click', () => {
            window.dispatchEvent(new Event('show-general-settings'));
            optionsModal.show();
        });
    }

    if (exportImportButton && exportImportModal) {
        exportImportButton.addEventListener('click', () => {
            window.dispatchEvent(new Event('show-export-import'));
        });
    }

    if (optionsSave) {
        optionsSave.addEventListener('click', () => {
            window.dispatchEvent(new Event('save-options'));
        });
    }

    // UI settings ("Ustawienia UI") modal — React component in #ui-settings-root.
    const uiSettingsButton = document.getElementById('ui-settings-button') as HTMLButtonElement | null;
    if (uiSettingsButton && uiSettingsModal) {
        uiSettingsButton.addEventListener('click', () => {
            uiSettingsModal.show();
        });
    }
    const uiSettingsSave = document.getElementById('ui-settings-save') as HTMLButtonElement | null;
    if (uiSettingsSave) {
        uiSettingsSave.addEventListener('click', () => {
            window.dispatchEvent(new Event('save-ui-settings'));
        });
    }
    window.addEventListener('close-ui-settings', () => {
        (document.activeElement as HTMLElement)?.blur?.();
        uiSettingsModal?.hide();
    });

    /**
     * The assistant asking for the panel that holds a setting it may not change
     * itself (drag-and-drop editors, nested config). The modal instances live in
     * this scope and are not importable, so the panel reaches them by event —
     * the same seam `show-general-settings` already uses.
     *
     * Only the dialog is opened, never the setting itself: these are exactly the
     * settings a human is supposed to edit by hand.
     */
    window.addEventListener(OPEN_SETTINGS_EVENT, event => {
        const detail = (event as CustomEvent<OpenSettingsDetail>).detail;
        if (detail?.surface === 'ui') {
            uiSettingsModal?.show();
            return;
        }
        // Reset to General only when no tab was named. CharacterSettings handles
        // the same event and switches to the named tab; dispatching this as well
        // would race it, with the winner decided by listener registration order.
        if (!detail?.tabLabel) {
            window.dispatchEvent(new Event('show-general-settings'));
        }
        optionsModal?.show();
    });

    if (bindsButton && bindsModal) {
        bindsButton.addEventListener('click', () => {
            bindsModal.show();
        });
    }

    // The Bindowanie modal's import trigger lives in its title bar and Save in its
    // footer (both outside the scrollable body). They drive the shared <Binds/>
    // body through window events; Binds broadcasts its parsing state back so the
    // title-bar button can disable itself and show a spinner.
    const bindsImportButton = document.getElementById('binds-import-btn') as HTMLButtonElement | null;
    const bindsImportSpinner = document.getElementById('binds-import-spinner');
    if (bindsImportButton) {
        bindsImportButton.addEventListener('click', () => {
            window.dispatchEvent(new Event('binds-open-import'));
        });
    }
    window.addEventListener('binds-parsing', (ev) => {
        const parsing = (ev as CustomEvent<boolean>).detail;
        if (bindsImportButton) bindsImportButton.disabled = parsing;
        bindsImportSpinner?.classList.toggle('d-none', !parsing);
    });
    const bindsSave = document.getElementById('binds-save') as HTMLButtonElement | null;
    if (bindsSave) {
        bindsSave.addEventListener('click', () => {
            window.dispatchEvent(new Event('binds-save'));
        });
    }
    const bindsAddCustom = document.getElementById('binds-add-custom') as HTMLButtonElement | null;
    if (bindsAddCustom) {
        bindsAddCustom.addEventListener('click', () => {
            window.dispatchEvent(new Event('binds-add-custom'));
        });
    }

    if (npcButton) {
        npcButton.addEventListener('click', () => {
            eventBus.emit('packageReceiver.popup.open');
        });
    }

    if (scriptsButton && scriptsModal) {
        scriptsButton.addEventListener('click', () => {
            scriptsModal.show();
        });
    }

    if (aliasesButton && aliasesModal) {
        aliasesButton.addEventListener('click', () => {
            aliasesModal.show();
        });
    }

    if (triggersButton && triggersModal) {
        triggersButton.addEventListener('click', () => {
            triggersModal.show();
        });
    }

    if (recordingsButton && recordingsModal) {
        recordingsButton.addEventListener('click', () => {
            recordingsModal.show();
        });
    }

    if (shortcutsButton && shortcutsModal) {
        shortcutsButton.addEventListener('click', () => {
            shortcutsModal.show();
        });
    }

    if (locationNotesButton && locationNotesModal) {
        locationNotesButton.addEventListener('click', () => {
            locationNotesModal.show();
        });
    }

    if (peopleBrowserButton) {
        peopleBrowserButton.addEventListener('click', () => {
            eventBus.emit('peopleBrowser.popup.open');
        });
    }

    if (dataSourcesButton) {
        dataSourcesButton.addEventListener('click', () => {
            eventBus.emit('dataSources.popup.open');
        });
    }

    if (shortcutsModal) {
        eventBus.on('shortcuts.addWithRoom', () => {
            shortcutsModal.show();
        });
    }

    if (mobileButtonsButton && mobileButtonsModal) {
        mobileButtonsButton.addEventListener('click', () => {
            mobileButtonsModal.show();
        });
    }

    if (mobileRadialButton && mobileRadialModal) {
        mobileRadialButton.addEventListener('click', () => {
            mobileRadialModal.show();
        });
    }

    if (helperButton && helperModal) {
        helperButton.addEventListener('click', () => {
            helperModal.show();
        });
    }

    if (shareLocationButton && locationQrImage && locationShareModal) {
        shareLocationButton.addEventListener('click', () => {
            const roomId = client.Map.currentRoom?.id;
            if (!roomId) {
                return;
            }
            const url = new URL(window.location.origin + window.location.pathname);
            url.searchParams.set('locationId', roomId.toString());
            locationQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url.toString())}`;
            locationShareModal.show();
        });
    }

    if (recordingButton) {
        recordingButton.addEventListener('click', () => {
            recordingManager.stopRecording(true);
        });
    }



    mudClient.on('recording.start', () => {
        if (recordingButton) recordingButton.style.display = 'block';
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

            if (!isConnected) {
                isConnecting = true;
                lastSystemLoginMessage = null;
                updateConnectButtons();
                void client.prepareSounds();
                mudClient.connect();
            }
        });
    }

    const commandInputController = new CommandInputController({
        messageInput,
        passwordInput,
        outputWrapper,
        sendButton,
        historyUpButton,
        historyDownButton,
        sendCommand: (cmd, echo, opts, skip, fromUser) => client.sendCommand(cmd, echo, opts, skip, fromUser),
        isPasswordMode: () => mudClient.isPasswordMode(),
        getCommandLineSuggestions: () => client.commandLineSuggestions ?? [],
        getClearInputOnSend: () => clearInputOnSend,
    });
    commandInputController.attach();

    eventBus.on('telnet.echo', (serverEchoing) => {
        commandInputController.setPasswordMode(serverEchoing);
    });

    // Handle connect/disconnect button click
    const handleConnect = () => {
        if (isConnected) {
            mudClient.disconnect();
        } else {
            isConnecting = true;
            lastSystemLoginMessage = null;
            updateConnectButtons();
            void client.prepareSounds();
            mudClient.connect();
        }
    };
    connectButton?.addEventListener('click', handleConnect);
    connectButtonInline?.addEventListener('click', handleConnect);

    const mccpCheckbox = document.getElementById('mccp-enabled') as HTMLInputElement | null;
    if (mccpCheckbox) {
        mccpCheckbox.checked = mudClient.isMccpEnabled();
        mccpCheckbox.addEventListener('change', () => {
            mudClient.setMccpEnabled(mccpCheckbox.checked);
        });
    }

    // Connection mode (direct / helper / proxy) plus the proxy URL settings and
    // "host your own" wizard, mounted as one React island on the connect screen.
    const proxyControlsRoot = document.getElementById('proxy-controls-root');
    if (proxyControlsRoot) {
        createRoot(proxyControlsRoot).render(createElement(ProxyControls, {
            relayBase: PROXY_WEBSOCKET_URL,
            initialMode: mudClient.getProxyMode(),
            initialUrl: mudClient.getUserProxyUrl() ?? '',
            onModeChange: (mode) => mudClient.setProxyMode(mode),
            onUrlChange: (url: string) => mudClient.setUserProxyUrl(url),
            onUseProxy: (url: string) => {
                mudClient.setUserProxyUrl(url);
                mudClient.setProxyMode('proxy');
            },
        }));
    }

    if (authClose) {
        const closeAuthOverlay = () => {
            authClosed = true;
            updateConnectButtons();
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

    // Layout manager suggestion for desktop users
    {
        const suggestionEl = document.getElementById('layout-manager-suggestion');
        const enableBtn = document.getElementById('layout-suggestion-enable');
        const dismissBtn = document.getElementById('layout-suggestion-dismiss');

        if (suggestionEl && enableBtn && dismissBtn) {
            const isMobileLike = window.innerWidth < 768 || isLikelyTouchDevice();
            const layoutState = loadLayoutState();
            const dismissed = localStorage.getItem('layoutManagerSuggestionDismissed') === '1';

            if (!isMobileLike && !layoutState.enabled && !dismissed) {
                suggestionEl.style.display = '';
            }

            enableBtn.addEventListener('click', () => {
                const state = loadLayoutState();
                state.enabled = true;
                saveLayoutState(state);
                invalidateLayoutCache();
                // showButtons is stock chrome and stays in the uiSettings blob;
                // merge onto the existing value without reintroducing moved fields.
                const cur = globalStorage.get('uiSettings') ?? {};
                globalStorage.set('uiSettings', { ...cur, showButtons: false } as never);
                suggestionEl.style.display = 'none';
            });

            dismissBtn.addEventListener('click', () => {
                localStorage.setItem('layoutManagerSuggestionDismissed', '1');
                suggestionEl.style.display = 'none';
            });
        }
    }

    // Mount React components
    mountMigratedComponents();
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

    const uiSettingsRoot = document.getElementById('ui-settings-root');
    if (uiSettingsRoot) {
        createRoot(uiSettingsRoot).render(createElement(UiSettings, {
            soundManager: client.SoundManager,
            onEnableNotifications: () => client.enableNotifications(),
        }));
    }

    const fullscreenButton = document.getElementById('fullscreen-button') as HTMLButtonElement | null;
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => console.error('Failed to enter fullscreen:', err));
            } else {
                document.exitFullscreen().catch(err => console.error('Failed to exit fullscreen:', err));
            }
        });
    }

    const rootElement = document.getElementById('options');
    if (rootElement) {
        createRoot(rootElement).render(createElement(CharacterSettings));
    }

    const exportImportRoot = document.getElementById('export-import-root');
    if (exportImportRoot) {
        createRoot(exportImportRoot).render(createElement(ExportImport));
    }

    const characterManagementRoot = document.getElementById('character-management-root');
    if (characterManagementRoot) {
        createRoot(characterManagementRoot).render(createElement(CharacterManagement));
    }

    const bindsRoot = document.getElementById('binds-options');
    if (bindsRoot) {
        createRoot(bindsRoot).render(createElement(Binds));
    }

    const scriptsRoot = document.getElementById('scripts-options');
    if (scriptsRoot) {
        createRoot(scriptsRoot).render(createElement(Scripts));
    }

    const aliasesRoot = document.getElementById('aliases-options');
    if (aliasesRoot) {
        createRoot(aliasesRoot).render(createElement(Aliases));
    }

    const triggersRoot = document.getElementById('triggers-options');
    if (triggersRoot) {
        createRoot(triggersRoot).render(createElement(UserTriggers));
    }

    const recordingsRoot = document.getElementById('recordings-options');
    if (recordingsRoot) {
        createRoot(recordingsRoot).render(createElement(Recordings));
    }

    const shortcutsRoot = document.getElementById('shortcuts-options');
    if (shortcutsRoot) {
        createRoot(shortcutsRoot).render(createElement(Shortcuts));
    }

    const locationNotesRoot = document.getElementById('location-notes-options');
    if (locationNotesRoot) {
        createRoot(locationNotesRoot).render(createElement(LocationNotes));
    }

    const locationNoteEditorRoot = document.getElementById('location-note-editor-root');
    if (locationNoteEditorRoot) {
        createRoot(locationNoteEditorRoot).render(createElement(LocationNoteEditor));
    }

    const mobileButtonsRoot = document.getElementById('mobile-buttons-options');
    if (mobileButtonsRoot) {
        createRoot(mobileButtonsRoot).render(createElement(ButtonsSettings));
    }

    const mobileRadialRoot = document.getElementById('mobile-radial-options');
    if (mobileRadialRoot) {
        createRoot(mobileRadialRoot).render(createElement(MobileRadialCommands));
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



