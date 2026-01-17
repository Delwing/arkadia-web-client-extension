import 'bootswatch/dist/darkly/bootstrap.min.css';
import './style.css'
import './layout/layout.css'
import arkadiaClient from "./ArkadiaClient.ts";
import Client from "@client/Client";
import eventBus from "@modules/core/eventBus";
import { resumeAudioContext } from "@client/SoundManager";
import type {SendCommandEvent} from "@shared/events";
import {registerScripts} from "@client/main";
import {type ContextMenuEntry, showContextMenu} from "@shared/dom/contextMenu";
import {getContextMenuEntries as getPluginContextMenuEntries} from "@modules/core/pluginUiRegistry";
import {setClientInstance} from "@shared/runtime";
import {Dropdown, Modal} from 'bootstrap';
import ObjectList from "./ObjectList";
import {registerEnemyStatusFilter} from "./filters/enemyStatusFilter";
import {mountMigratedComponents} from "@web-ui/mountComponents.tsx";
import FightTitle from "./FightTitle";
import HpTitle from "./HpTitle";
import initSessionLogger from "./sessionLogger";
import MobileDirectionButtons from "./scripts/mobileDirectionButtons";
import DesktopButtons from "./scripts/desktopButtons";
import MobileCommandRadial from "./scripts/mobileCommandRadial";
import initUiSettings from "./uiSettings";

import "@client/main.ts"
import MockPort from "./MockPort.ts";
import NoSleep from 'nosleep.js';
import {loadColors, loadMapData} from "./mapDataLoader.ts";
import {EmbeddedMap} from "./embed.ts"
import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {LocationLabel} from "@web-ui/components/map/LocationLabel"
import {PauseIcon} from "@web-ui/components/map/PauseIcon"
import Binds from "./options/Binds.tsx"
import Npc from "./options/Npc.tsx"
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
import MobileRadialCommands from "./options/MobileRadialCommands.tsx"
import { LayoutManagerWrapper } from "@web/layout"
import {copyOutputAsImage} from "./copyOutputAsImage";
import {
    applySettings as applyMobileButtonSettings,
    loadSettings as loadMobileButtonSettings
} from "./mobileButtonSettings"
import {getItemSync} from "@modules/core/storage"
import {runAllSettingsMigrations, migrateButtonSizeMultiplier, migrateFooterComponentVisibility} from "@modules/core/settingsMigrations"
import {
    areOutputTimestampsVisible,
    setOutputTimestampVisibility,
    setupOutputMessageHandler,
} from "@shared/dom/outputMessageHandler";
import {refresh as refreshNpcStore, subscribe as subscribeNpcStore} from "./dataStores/npcStore";

initSessionLogger(arkadiaClient).catch(err => console.error('Logger init failed', err));

// Run settings migrations before initializing the client
runAllSettingsMigrations();
migrateButtonSizeMultiplier();
migrateFooterComponentVisibility();

let mobileRadial: MobileCommandRadial | null = null;

const client = new Client(arkadiaClient, new MockPort());
setClientInstance(client);
registerScripts(client);
client.connect(client.port, true);

const handleClientCommand = ({command, echo = true, options}: SendCommandEvent) => {
    if (typeof command !== 'string') {
        return;
    }
    void client.sendCommand(command, echo, options);
};

eventBus.on('sendCommand', handleClientCommand);

subscribeNpcStore(snapshot => {
    const payload = snapshot?.all.data.map(({name, loc}) => ({name, loc})) ?? []
    client.sendEvent("npc", payload)
})
void refreshNpcStore()


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

// Resume audio context on user interaction (browser autoplay policy)
function setupAudioContextResume() {
    const resumeOnInteraction = () => resumeAudioContext();
    document.addEventListener('click', resumeOnInteraction);
    document.addEventListener('keydown', resumeOnInteraction);
    document.addEventListener('touchstart', resumeOnInteraction);

    // Also resume when returning to the tab
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            resumeAudioContext();
        }
    });
}

setupAudioContextResume();

function disableTabSleepPrevention() {
    if (!tabSleepPreventionActive) return;
    tabSleepPreventionActive = false;
    if (noSleepInstance) {
        noSleepInstance.disable();
    }
    wakeLockEnabled = false;
    updateWakeLockButton();
}

const isDirectionMap = (value: unknown): value is Record<string, Partial<RawDirectionBind> | undefined> => {
    if (!value || typeof value !== 'object') return false;
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.every(([, entry]) => {
        if (entry === undefined) return true;
        if (!entry || typeof entry !== 'object') return false;
        const candidate = entry as Record<string, unknown>;
        if ('key' in candidate && typeof candidate.key !== 'string') {
            return false;
        }
        const flags: Array<'ctrl' | 'alt' | 'shift'> = ['ctrl', 'alt', 'shift'];
        return flags.every(flag => !(flag in candidate) || typeof candidate[flag] === 'boolean');
    });
};

arkadiaClient.on('settings', (detail) => {
    const payload = detail as { binds?: { directions?: unknown } } | undefined;
    const directions = payload?.binds?.directions;
    if (isDirectionMap(directions)) {
        applyDirectionBinds(directions);
    }
});

client.on('binds', (detail) => {
    const payload = detail as { directions?: unknown } | undefined;
    const directions = payload?.directions;
    if (isDirectionMap(directions)) {
        applyDirectionBinds(directions);
    }
});

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
const stickyArea = document.getElementById('sticky-area') as HTMLElement;
const multiBindsElement = document.getElementById('multi-binds');
let isSplitView = false;
const STICKY_LINES = 15;
const DOUBLE_CLICK_TIMEOUT_MS = 300;
let suppressSplitViewUntil = 0;
let lastMultiBindsState = multiBindsElement?.classList.contains('active') ?? false;

function checkSplitView() {
    // Skip check if we're in a suppression period
    if (Date.now() < suppressSplitViewUntil) {
        return;
    }

    // Also check if multibinds state just changed
    const currentMultiBindsState = multiBindsElement?.classList.contains('active') ?? false;
    if (currentMultiBindsState !== lastMultiBindsState) {
        lastMultiBindsState = currentMultiBindsState;
        // Suppress for longer when state changes
        suppressSplitViewUntil = Date.now() + 250;
        return;
    }

    const atBottom = outputWrapper.scrollTop + outputWrapper.clientHeight + splitBottom.clientHeight >= outputWrapper.scrollHeight - 1;
    if (atBottom) {
        if (isSplitView) {
            isSplitView = false;
            splitBottom.classList.add('split-hidden');
            stickyArea.innerHTML = '';
        }
    } else if (!isSplitView) {
        isSplitView = true;
        splitBottom.classList.remove('split-hidden');
        stickyArea.innerHTML = '';
        const nodes = Array.from(outputWrapper.children).filter(n => n !== splitBottom);
        const start = Math.max(0, nodes.length - STICKY_LINES);
        for (let i = start; i < nodes.length; i++) {
            stickyArea.appendChild(nodes[i].cloneNode(true));
        }
    }
}

outputWrapper.addEventListener('scroll', checkSplitView);

// Observe multibinds appearance/disappearance to prevent split view activation
if (multiBindsElement) {
    // Watch for multibinds class changes and suppress immediately BEFORE layout changes
    const mutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                // Class changed - suppress split view checks immediately for longer duration
                suppressSplitViewUntil = Date.now() + 500;
                lastMultiBindsState = multiBindsElement.classList.contains('active');

                // Also force scroll to bottom after layout settles
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

    // Also use ResizeObserver as a backup for any other layout changes
    let previousHeight = outputWrapper.clientHeight;
    const resizeObserver = new ResizeObserver(() => {
        const newHeight = outputWrapper.clientHeight;
        if (newHeight !== previousHeight) {
            const wasAtBottom = outputWrapper.scrollTop + previousHeight + splitBottom.clientHeight >= outputWrapper.scrollHeight - 1;
            if (wasAtBottom) {
                suppressSplitViewUntil = Date.now() + 500;
                requestAnimationFrame(() => {
                    outputWrapper.scrollTop = outputWrapper.scrollHeight;
                });
            }
            previousHeight = newHeight;
        }
    });
    resizeObserver.observe(outputWrapper);
}

outputWrapper.addEventListener('contextmenu', event => {
    if (event.defaultPrevented) {
        return;
    }
    const isMobileLike = window.innerWidth < 768 || isLikelyTouchDevice();
    if (isMobileLike) {
        return;
    }
    const target = event.target as HTMLElement | null;
    if (target && target.closest('a, [data-output-clickable]')) {
        return;
    }
    event.preventDefault();
    const isVisible = areOutputTimestampsVisible();
    const hasSelection = !window.getSelection()?.isCollapsed;
    const items: ContextMenuEntry[] = [
        {
            label: isVisible ? 'Ukryj znaczniki czasu' : 'Pokaż znaczniki czasu',
            action: () => setOutputTimestampVisibility(!isVisible),
        },
    ];
    if (hasSelection) {
        items.push({
            label: 'Kopiuj jako obraz',
            action: () => {
                copyOutputAsImage().catch(err => {
                    console.error('Failed to copy as image:', err);
                });
            },
        });
    }
    items.push(
        {
            label: 'Wiedza',
            action: () => {
                eventBus.emit('sendCommand', {command: '/wiedza'});
            },
        },
        {
            label: 'Biblioteki',
            action: () => {
                eventBus.emit('sendCommand', {command: '/biblioteki'});
            },
        },
        {
            label: 'Zioła',
            action: () => {
                eventBus.emit('sendCommand', {command: '/ziola'});
            },
        },
        {
            label: 'Zioła (tekst)',
            action: () => {
                eventBus.emit('sendCommand', {command: '/ziola2'});
            },
        },
        {
            label: 'Zlecenia',
            action: () => {
                eventBus.emit('sendCommand', {command: '/zlecenia'});
            },
        },
        {
            label: 'Skróty',
            action: () => {
                eventBus.emit('skroty.popup.open');
            },
        },
        {
            label: 'Zegar',
            action: () => {
                eventBus.emit('sendCommand', {command: '/czas'});
            },
        },
        {
            label: 'Chat',
            action: () => {
                eventBus.emit('sendCommand', {command: '/chatw'});
            },
        },
        {
            label: 'Walka',
            action: () => {
                eventBus.emit('sendCommand', {command: '/walkaw'});
            },
        },
        {
            label: 'Postepy',
            action: () => {
                eventBus.emit('postepy.popup.open');
            },
        },
        {
            label: 'Zabici',
            action: () => {
                eventBus.emit('zabici.popup.open');
            },
        },
        {
            label: 'Poczta',
            action: () => {
                eventBus.emit('poczta.popup.open');
            },
        },
    );
    getPluginContextMenuEntries().forEach(entry => {
        items.push(entry);
    });
    showContextMenu(items, event.clientX, event.clientY, { columns: 2 });
});

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

// Middle mouse button opens radial menu
outputWrapper.addEventListener('mousedown', (event) => {
    if (event.button !== 1) {
        return;
    }
    event.preventDefault();
    mobileRadial?.showAt(event.clientX, event.clientY);
});

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

        const {startId, reader} = client.Map.initialize(mapData, colors);
        (globalThis as any).embedded = new EmbeddedMap(reader, startId);
    })
    .catch(error => {
        progressContainer.style.display = 'none';
        console.error('Failed to load map data or colors:', error);
    });


// Set up message event listener for UI updates
setupOutputMessageHandler(arkadiaClient, {
    outputWrapper,
    splitBottom,
    stickyArea,
    isSplitView: () => isSplitView,
    stickyLines: STICKY_LINES,
    suppressSplitView: (durationMs: number) => {
        suppressSplitViewUntil = Date.now() + durationMs;
    },
});

// Track connection state
let isConnected = false;
let isConnecting = false;
let isDisconnecting = false;
let playbackMode = false;
let authClosed = false;

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
}

// Handle client connect event
arkadiaClient.on('client.connect', () => {
    isConnected = true;
    isConnecting = false;
    isDisconnecting = false;
    updateConnectButtons();
    eventBus.emit('refreshPositionWhenAble');
    console.log('Client connected to Arkadia server.');
});

// Handle client disconnect event
arkadiaClient.on('client.disconnect', () => {
    isConnected = false;
    isConnecting = false;
    isDisconnecting = false;
    authClosed = false;
    updateConnectButtons();
    client.println('Rozłączono z serwerem Arkadii.');
    console.log('Client disconnected from Arkadia server.');
});

// Ensure button state is correct when returning to the tab
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        const socketOpen = arkadiaClient.isSocketOpen();
        if (socketOpen && !isConnected) {
            isConnected = true;
            updateConnectButtons();
        } else if (!socketOpen && isConnected) {
            isConnected = false;
            isConnecting = false;
            isDisconnecting = false;
            updateConnectButtons();
        }
    }
});


interface DirectionBinding {
    code: string;
    direction: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
}

interface RawDirectionBind {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
}

const DEFAULT_DIRECTION_BINDS: Record<string, RawDirectionBind> = {
    n: {key: 'Numpad8'},
    s: {key: 'Numpad2'},
    w: {key: 'Numpad4'},
    e: {key: 'Numpad6'},
    nw: {key: 'Numpad7'},
    ne: {key: 'Numpad9'},
    sw: {key: 'Numpad1'},
    se: {key: 'Numpad3'},
    u: {key: 'NumpadMultiply'},
    d: {key: 'NumpadSubtract'},
    special: {key: 'Numpad0'},
};

const CONSTANT_DIRECTION_BINDS: DirectionBinding[] = [
    {direction: 'd', code: 'NumpadDivide'},
    {direction: 'zerknij', code: 'Numpad5'},
];

let directionBindings: DirectionBinding[] = buildDirectionBindings();

function buildDirectionBindings(dirs?: Record<string, Partial<RawDirectionBind> | undefined>): DirectionBinding[] {
    const resolved: DirectionBinding[] = Object.entries(DEFAULT_DIRECTION_BINDS).map(([direction, fallback]) => {
        const override = dirs?.[direction];
        const source = (override && override.key) ? override : fallback;
        return {
            direction,
            code: source.key,
            ctrl: !!source.ctrl,
            alt: !!source.alt,
            shift: !!source.shift,
        };
    });

    if (!resolved.some(bind => bind.code === 'Numpad0')) {
        resolved.push({direction: 'special', code: 'Numpad0'});
    }

    return [...resolved, ...CONSTANT_DIRECTION_BINDS];
}

function applyDirectionBinds(dirs: Record<string, Partial<RawDirectionBind> | undefined> | undefined) {
    directionBindings = buildDirectionBindings(dirs || undefined);
}

function matchesDirectionBinding(event: KeyboardEvent, binding: DirectionBinding) {
    return event.code === binding.code &&
        event.ctrlKey === !!binding.ctrl &&
        event.altKey === !!binding.alt &&
        event.shiftKey === !!binding.shift;
}

// Add global keydown event listener for numpad directions
document.addEventListener('keydown', (e) => {
    const active = document.activeElement as HTMLElement | null;
    const modalOpen = document.querySelector('.modal.show');
    if (modalOpen && (!active || active.id !== 'message-input')) {
        // Ignore all keybinds when any modal dialog is open, except for the main
        // command input which is hidden behind the modal anyway
        return;
    }

    if (active &&
        active.id !== 'message-input' &&
        (active.matches('input, textarea') || active.isContentEditable)) {
        return;
    }
    const binding = directionBindings.find(item => matchesDirectionBinding(e, item));
    if (binding) {
        e.preventDefault();
        if (binding.direction === 'special') {
            const exits = client.Map.currentRoom?.specialExits ?? {};
            const first = Object.keys(exits)[0];
            if (first) {
                eventBus.emit('sendCommand', {command: first});
            }
        } else {
            client.sendCommand(binding.direction);
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Request persistent storage
    if (navigator.storage?.persist) {
        navigator.storage.persist().then(granted => {
            console.log(granted ? 'Persistent storage granted' : 'Persistent storage not granted');
        }).catch(err => {
            console.warn('Failed to request persistent storage:', err);
        });
    }

    // Activate tab sleep prevention for all devices
    preventTabSleep();
    console.log('Tab sleep prevention activated');

    const commitInfo = document.getElementById('commit-info') as HTMLElement | null;
    if (commitInfo) {
        commitInfo.textContent = `${__COMMIT_SHA__} ${__COMMIT_DATE__}`;

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
                    const latestSha = latestDeployment.sha?.substring(0, 7);
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
    const sendButton = document.getElementById('send-button') as HTMLButtonElement;
    const uiSettingsData = getItemSync('uiSettings');
    let clearInputOnSend = !!uiSettingsData?.uiSettings?.clearInputOnSend;
    client.on('uiSettings', (payload) => {
        if (typeof payload?.clearInputOnSend === 'boolean') {
            clearInputOnSend = payload.clearInputOnSend;
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
    const mobileButtonsButton = document.getElementById('mobile-buttons-button') as HTMLButtonElement | null;
    const mobileRadialButton = document.getElementById('mobile-radial-button') as HTMLButtonElement | null;
    const recordingButton = document.getElementById('recording-button') as HTMLButtonElement | null;
    const playbackControls = document.getElementById('playback-controls') as HTMLElement | null;
    const playbackPause = document.getElementById('playback-pause') as HTMLButtonElement | null;
    const playbackStop = document.getElementById('playback-stop') as HTMLButtonElement | null;
    const playbackInfo = document.getElementById('playback-info') as HTMLElement | null;
    const playbackTimer = document.getElementById('playback-timer') as HTMLElement | null;
    const playbackReplay = document.getElementById('playback-replay') as HTMLButtonElement | null;
    const playbackStepBack = document.getElementById('playback-step-back') as HTMLButtonElement | null;
    const playbackStep = document.getElementById('playback-step') as HTMLButtonElement | null;
    const playbackStartOver = document.getElementById('playback-start-over') as HTMLButtonElement | null;
    const playbackLoopSetStart = document.getElementById('playback-loop-set-start') as HTMLButtonElement | null;
    const playbackLoopSetEnd = document.getElementById('playback-loop-set-end') as HTMLButtonElement | null;
    const playbackLoopToggle = document.getElementById('playback-loop-toggle') as HTMLButtonElement | null;
    const playbackLoopClear = document.getElementById('playback-loop-clear') as HTMLButtonElement | null;
    const playbackLoopInfo = document.getElementById('playback-loop-info') as HTMLElement | null;
    const playbackSpeedSlider = document.getElementById('playback-speed-slider') as HTMLInputElement | null;
    const playbackSpeedValue = document.getElementById('playback-speed-value') as HTMLElement | null;
    const playbackPreviewToggle = document.getElementById('playback-preview-toggle') as HTMLButtonElement | null;
    const playbackPreviewContent = document.getElementById('playback-preview-content') as HTMLElement | null;
    const playbackPreviewText = document.getElementById('playback-preview-text') as HTMLElement | null;
    wakeLockButton = document.getElementById('wake-lock-button') as HTMLButtonElement | null;
    updateWakeLockButton();

    // Initialize Bootstrap modal
    const optionsModalElement = document.getElementById('options-modal');
    const optionsModal = optionsModalElement ? new Modal(optionsModalElement) : null;
    const exportImportModalElement = document.getElementById('export-import-modal');
    const exportImportModal = exportImportModalElement ? new Modal(exportImportModalElement) : null;
    const characterManagementModalElement = document.getElementById('character-management-modal');
    const characterManagementModal = characterManagementModalElement ? new Modal(characterManagementModalElement) : null;
    const bindsModalElement = document.getElementById('binds-modal');
    const bindsModal = bindsModalElement ? new Modal(bindsModalElement) : null;
    const npcModalElement = document.getElementById('npc-modal');
    const npcModal = npcModalElement ? new Modal(npcModalElement) : null;
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
    arkadiaClient.on('client.connect', focusCommandInputOnConnect);

    if (contentArea) {
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

            if (target.closest('a, button, input, textarea, select, [contenteditable], [data-output-clickable], .plugin-window, .modal')) {
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
            const detail = (payload ?? {}) as { text?: string; time?: number };
            const div = document.createElement('div');
            div.className = 'notification';
            div.textContent = detail.text ?? '';
            notificationCenter.appendChild(div);
            const timeout = typeof detail.time === 'number' ? detail.time : 2000;
            setTimeout(() => div.remove(), timeout);
        });
    }

    if (menuButton) {
        new Dropdown(menuButton);
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
                arkadiaClient.disconnect();
                // Fallback: ensure state updates after a delay if disconnect event doesn't fire
                setTimeout(() => {
                    if (isDisconnecting && !arkadiaClient.isSocketOpen()) {
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
                updateConnectButtons();
                void client.prepareSounds();
                arkadiaClient.connect();
            }
        });
    }

    window.addEventListener('close-options', () => {
        if (optionsModal) {
            optionsModal.hide();
        }
        if (exportImportModal) {
            exportImportModal.hide();
        }
        if (bindsModal) {
            bindsModal.hide();
        }
        if (npcModal) {
            npcModal.hide();
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

    if (bindsButton && bindsModal) {
        bindsButton.addEventListener('click', () => {
            bindsModal.show();
        });
    }

    if (npcButton && npcModal) {
        npcButton.addEventListener('click', () => {
            npcModal.show();
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
            arkadiaClient.stopRecording(true);
        });
    }

    if (playbackPause) {
        playbackPause.addEventListener('click', () => {
            const isPaused = playbackPause.getAttribute('data-paused') === 'true';
            if (isPaused) {
                arkadiaClient.resumePlayback();
            } else {
                arkadiaClient.pausePlayback();
            }
        });
    }

    if (playbackStop) {
        playbackStop.addEventListener('click', () => {
            arkadiaClient.stopPlayback();
        });
    }

    if (playbackReplay) {
        playbackReplay.addEventListener('click', () => {
            arkadiaClient.replayLast();
        });
    }

    if (playbackStepBack) {
        playbackStepBack.addEventListener('click', () => {
            arkadiaClient.stepBack();
        });
    }

    if (playbackStep) {
        playbackStep.addEventListener('click', () => {
            arkadiaClient.stepForward();
        });
    }

    if (playbackStartOver) {
        playbackStartOver.addEventListener('click', () => {
            arkadiaClient.startOver();
        });
    }

    if (playbackLoopSetStart) {
        playbackLoopSetStart.addEventListener('click', () => {
            arkadiaClient.setLoopStart();
        });
    }

    if (playbackLoopSetEnd) {
        playbackLoopSetEnd.addEventListener('click', () => {
            arkadiaClient.setLoopEnd();
        });
    }

    if (playbackLoopToggle) {
        playbackLoopToggle.addEventListener('click', () => {
            arkadiaClient.toggleLoop();
        });
    }

    if (playbackLoopClear) {
        playbackLoopClear.addEventListener('click', () => {
            arkadiaClient.clearLoop();
        });
    }

    // Convert slider value (logarithmic scale) to actual speed
    // Slider: -1 to 4 maps to speed 0.5x to 16x
    const sliderToSpeed = (sliderValue: number): number => {
        return Math.pow(2, sliderValue);
    };

    // Convert speed to slider value
    const speedToSlider = (speed: number): number => {
        return Math.log2(speed);
    };

    const updatePlaybackSpeedDisplay = (speed: number) => {
        if (playbackSpeedValue) {
            playbackSpeedValue.textContent = `${speed.toFixed(1)}x`;
        }
        if (playbackSpeedSlider) {
            playbackSpeedSlider.value = speedToSlider(speed).toString();
        }
    };

    if (playbackSpeedSlider) {
        playbackSpeedSlider.addEventListener('input', () => {
            const sliderValue = parseFloat(playbackSpeedSlider.value);
            const speed = sliderToSpeed(sliderValue);
            arkadiaClient.setPlaybackSpeed(speed);
        });
    }

    // Preview toggle functionality
    if (playbackPreviewToggle && playbackPreviewContent) {
        playbackPreviewToggle.addEventListener('click', () => {
            const isCollapsed = playbackPreviewContent.style.display === 'none';
            if (isCollapsed) {
                playbackPreviewContent.style.display = 'block';
                playbackPreviewToggle.classList.remove('collapsed');
            } else {
                playbackPreviewContent.style.display = 'none';
                playbackPreviewToggle.classList.add('collapsed');
            }
        });
        // Start collapsed
        playbackPreviewToggle.classList.add('collapsed');
    }

    updatePlaybackSpeedDisplay(arkadiaClient.getPlaybackSpeed());

    if (playbackControls) {
        const dragTarget =
            (playbackControls.querySelector('[data-drag-handle]') as HTMLElement | null) ?? playbackControls;
        let dragPointerId: number | null = null;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        const margin = 12;

        const clampToViewport = (x: number, y: number) => {
            const width = playbackControls.offsetWidth;
            const height = playbackControls.offsetHeight;
            const maxX = Math.max(margin, window.innerWidth - width - margin);
            const maxY = Math.max(margin, window.innerHeight - height - margin);
            const clampedX = Math.min(Math.max(x, margin), maxX);
            const clampedY = Math.min(Math.max(y, margin), maxY);
            return {x: clampedX, y: clampedY};
        };

        const updatePosition = (x: number, y: number) => {
            const {x: clampedX, y: clampedY} = clampToViewport(x, y);
            playbackControls.style.left = `${clampedX}px`;
            playbackControls.style.top = `${clampedY}px`;
            playbackControls.style.right = 'auto';
            playbackControls.style.bottom = 'auto';
        };

        const handlePointerMove = (event: PointerEvent) => {
            if (dragPointerId === null || event.pointerId !== dragPointerId) return;
            event.preventDefault();
            const targetX = event.clientX - dragOffsetX;
            const targetY = event.clientY - dragOffsetY;
            updatePosition(targetX, targetY);
        };

        const finishDrag = (event: PointerEvent) => {
            if (dragPointerId === null || event.pointerId !== dragPointerId) return;
            if (dragTarget.hasPointerCapture(dragPointerId)) {
                dragTarget.releasePointerCapture(dragPointerId);
            }
            dragPointerId = null;
            playbackControls.classList.remove('is-dragging');
        };

        dragTarget.addEventListener('pointerdown', (event: PointerEvent) => {
            if (event.button !== 0) return;
            const rect = playbackControls.getBoundingClientRect();
            dragPointerId = event.pointerId;
            dragOffsetX = event.clientX - rect.left;
            dragOffsetY = event.clientY - rect.top;
            dragTarget.setPointerCapture(dragPointerId);
            playbackControls.classList.add('is-dragging');
            event.preventDefault();
        });

        dragTarget.addEventListener('pointermove', handlePointerMove);
        dragTarget.addEventListener('pointerup', finishDrag);
        dragTarget.addEventListener('pointercancel', finishDrag);

        window.addEventListener('resize', () => {
            if (!playbackControls.style.left || !playbackControls.style.top) {
                return;
            }
            const left = parseFloat(playbackControls.style.left);
            const top = parseFloat(playbackControls.style.top);
            if (Number.isNaN(left) || Number.isNaN(top)) {
                return;
            }
            updatePosition(left, top);
        });
    }

    arkadiaClient.on('recording.start', () => {
        if (recordingButton) recordingButton.style.display = 'block';
    });
    arkadiaClient.on('recording.stop', () => {
        if (recordingButton) recordingButton.style.display = 'none';
    });

    arkadiaClient.on('recording.loaded', (data: { name: string; length: number }) => {
        playbackMode = true;
        if (playbackControls) playbackControls.style.display = 'flex';
        if (playbackInfo) playbackInfo.textContent = `Wczytano: ${data.name} (${data.length} zdarzeń)`;
        if (playbackPause) {
            playbackPause.textContent = '▶';
            playbackPause.setAttribute('data-paused', 'true');
        }
        updatePlaybackSpeedDisplay(arkadiaClient.getPlaybackSpeed());
        updateConnectButtons();
    });

    arkadiaClient.on('playback.start', (total: number) => {
        playbackMode = true;
        if (playbackControls) playbackControls.style.display = 'flex';
        if (playbackInfo) playbackInfo.textContent = `0 / ${total}`;
        if (playbackPause) {
            playbackPause.textContent = '⏸';
            playbackPause.setAttribute('data-paused', 'false');
        }
        updatePlaybackSpeedDisplay(arkadiaClient.getPlaybackSpeed());
        updateConnectButtons();
    });

    arkadiaClient.on('playback.stop', () => {
        playbackMode = false;
        if (playbackControls) playbackControls.style.display = 'none';
        updateConnectButtons();
    });

    arkadiaClient.on('playback.pause', () => {
        if (playbackPause) {
            playbackPause.textContent = '▶';
            playbackPause.setAttribute('data-paused', 'true');
        }
    });

    arkadiaClient.on('playback.resume', () => {
        if (playbackPause) {
            playbackPause.textContent = '⏸';
            playbackPause.setAttribute('data-paused', 'false');
        }
    });

    arkadiaClient.on('playback.index', (index: number, total: number) => {
        if (playbackInfo) playbackInfo.textContent = `${index} / ${total}`;
    });

    arkadiaClient.on('playback.speed', (speed: number) => {
        updatePlaybackSpeedDisplay(speed);
    });

    arkadiaClient.on('playback.event', (event: any) => {
        if (playbackPreviewText) {
            const direction = event.direction === 'in' ? '←' : '→';
            playbackPreviewText.textContent = `${direction} ${event.message}`;
        }
    });

    arkadiaClient.on('playback.loop.updated', (loopState: {
        start: number | null;
        end: number | null;
        enabled: boolean
    }) => {
        if (playbackLoopToggle) {
            playbackLoopToggle.textContent = loopState.enabled ? 'Pętla: WŁ' : 'Pętla: WYŁ';
            playbackLoopToggle.setAttribute('data-loop-enabled', loopState.enabled.toString());
        }
        if (playbackLoopInfo) {
            if (loopState.start !== null && loopState.end !== null) {
                playbackLoopInfo.textContent = `Pętla: ${loopState.start} - ${loopState.end}`;
            } else if (loopState.start !== null) {
                playbackLoopInfo.textContent = `Początek pętli: ${loopState.start}`;
            } else if (loopState.end !== null) {
                playbackLoopInfo.textContent = `Koniec pętli: ${loopState.end}`;
            } else {
                playbackLoopInfo.textContent = '';
            }
        }
    });

    let timerInterval: number | null = null;
    arkadiaClient.on('playback.timer', (data: { delay: number; startTime: number }) => {
        // Clear any existing timer interval
        if (timerInterval !== null) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        if (!playbackTimer) return;

        const updateTimer = () => {
            const elapsed = Date.now() - data.startTime;
            const remaining = Math.max(0, data.delay - elapsed);

            if (remaining <= 0) {
                playbackTimer.textContent = '0.0s';
                if (timerInterval !== null) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                }
            } else {
                const seconds = (remaining / 1000).toFixed(1);
                playbackTimer.textContent = `${seconds}s`;
            }
        };

        // Update immediately
        updateTimer();

        // Update every 100ms for smooth countdown
        timerInterval = setInterval(updateTimer, 100) as unknown as number;
    });

    // Clear timer when playback stops or pauses
    arkadiaClient.on('playback.stop', () => {
        if (timerInterval !== null) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (playbackTimer) playbackTimer.textContent = '';
    });

    arkadiaClient.on('playback.pause', () => {
        if (timerInterval !== null) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
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
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const character = loginCharacter?.value || '';
            const password = loginPassword?.value || '';

            const sendCreds = () => {
                if (character) client.send(character);
                if (password) client.send(password, false, {preserveCase: true});
                arkadiaClient.off('client.connect', sendCreds);
            };

            if (!isConnected) {
                arkadiaClient.on('client.connect', sendCreds);
                isConnecting = true;
                updateConnectButtons();
                void client.prepareSounds();
                arkadiaClient.connect();
            } else {
                sendCreds();
            }
        });
    }

    // Command history implementation
    const commandHistory: string[] = [];
    let historyIndex = -1;
    let currentInput = '';
    let historySearchTerm: string | null = null;
    let historyMatches: number[] = [];

    interface TabState {
        matches: string[];
        index: number;
        basePrefix: string;
        lastApplied: string;
    }

    let tabState: TabState | null = null;

    function resetTabState() {
        tabState = null;
    }

    function resetHistoryNavigation() {
        historyIndex = -1;
        historyMatches = [];
        historySearchTerm = null;
    }

    function computeHistoryMatches(term: string): number[] {
        if (!term) {
            return commandHistory.map((_, index) => index).reverse();
        }
        const matches: number[] = [];
        for (let i = commandHistory.length - 1; i >= 0; i--) {
            const command = commandHistory[i];
            if (command.startsWith(term)) {
                matches.push(i);
            }
        }
        return matches;
    }

    function findLastWordStart(text: string): number {
        for (let i = text.length - 1; i >= 0; i--) {
            if (/\s/.test(text[i])) {
                return i + 1;
            }
        }
        return 0;
    }

    function longestCommonWord(prefix: string, matches: string[]): string {
        if (!matches.length) return prefix;

        const wordStart = findLastWordStart(prefix);
        const base = prefix.slice(0, wordStart);
        const lastWord = prefix.slice(wordStart);

        const candidates: string[] = [];
        for (const match of matches) {
            if (!match.startsWith(base)) {
                return prefix;
            }
            const remainder = match.slice(base.length);
            if (!remainder.toLowerCase().startsWith(lastWord.toLowerCase())) {
                return prefix;
            }
            const [candidateWord] = remainder.split(/\s/, 1);
            candidates.push(candidateWord ?? '');
        }

        if (!candidates.length) {
            return prefix;
        }

        let common = candidates[0];
        for (let i = 1; i < candidates.length; i++) {
            const current = candidates[i];
            const limit = Math.min(common.length, current.length);
            let shared = '';
            for (let j = 0; j < limit; j++) {
                if (common[j].toLowerCase() !== current[j].toLowerCase()) {
                    break;
                }
                shared += common[j];
            }
            common = shared;
            if (!common) {
                break;
            }
        }

        if (common.length <= lastWord.length) {
            return prefix;
        }

        return base + common;
    }

    function computeTabMatches(prefix: string): string[] {
        const seen = new Set<string>();
        const matches: string[] = [];
        for (let i = commandHistory.length - 1; i >= 0; i--) {
            const candidate = commandHistory[i];
            if (!candidate.startsWith(prefix)) continue;
            if (seen.has(candidate)) continue;
            seen.add(candidate);
            matches.push(candidate);
        }

        const suggestions = client.commandLineSuggestions ?? [];
        if (Array.isArray(suggestions)) {
            for (const suggestion of suggestions) {
                if (typeof suggestion !== 'string') continue;
                if (!suggestion.startsWith(prefix)) continue;
                if (seen.has(suggestion)) continue;
                seen.add(suggestion);
                matches.push(suggestion);
            }
        }

        return matches;
    }

    function applyTabMatch(value: string, selectionStart?: number) {
        messageInput.value = value;
        const end = value.length;
        if (typeof selectionStart === 'number' && selectionStart >= 0 && selectionStart <= end) {
            messageInput.setSelectionRange(selectionStart, end);
        } else {
            messageInput.setSelectionRange(end, end);
        }
    }

    function handleTabCompletion(direction: 'forward' | 'backward') {
        const selectionStart = messageInput.selectionStart ?? messageInput.value.length;
        const selectionEnd = messageInput.selectionEnd ?? selectionStart;
        const selectionTouchesEnd = selectionEnd === messageInput.value.length;
        if (!selectionTouchesEnd) {
            return;
        }

        const prefix = messageInput.value;
        const matches = computeTabMatches(prefix);
        if (!matches.length) {
            resetTabState();
            return;
        }

        if (!tabState || tabState.basePrefix !== prefix && tabState.lastApplied !== prefix) {
            const extended = longestCommonWord(prefix, matches);
            if (extended.length > prefix.length) {
                applyTabMatch(extended, prefix.length);
                tabState = {
                    matches,
                    index: -1,
                    basePrefix: prefix,
                    lastApplied: extended,
                };
                return;
            }

            const startIndex = direction === 'forward' ? 0 : matches.length - 1;
            const chosen = matches[startIndex];
            applyTabMatch(chosen, prefix.length);
            tabState = {
                matches,
                index: startIndex,
                basePrefix: prefix,
                lastApplied: chosen,
            };
            return;
        }

        if (!tabState.matches.length) {
            resetTabState();
            return;
        }

        let nextIndex: number;
        if (tabState.index === -1) {
            nextIndex = direction === 'forward' ? 0 : tabState.matches.length - 1;
        } else {
            nextIndex = direction === 'forward'
                ? (tabState.index + 1) % tabState.matches.length
                : (tabState.index - 1 + tabState.matches.length) % tabState.matches.length;
        }

        const chosen = tabState.matches[nextIndex];
        const selectionAnchor = tabState.basePrefix.length;
        applyTabMatch(chosen, selectionAnchor);
        tabState.index = nextIndex;
        tabState.lastApplied = chosen;
    }

    function selectEntireInput() {
        if (document.activeElement !== messageInput) {
            messageInput.focus();
        }
        messageInput.setSelectionRange(0, messageInput.value.length);
    }

    function navigateHistory(direction: 'up' | 'down') {
        // Only allow command history navigation if we've received the first GMCP event
        if (!arkadiaClient.hasReceivedFirstGmcp()) return;
        if (commandHistory.length === 0) return;

        resetTabState();

        if (historyIndex === -1) {
            currentInput = messageInput.value;
            let searchTerm = messageInput.value;
            const selectionStart = messageInput.selectionStart;
            const selectionEnd = messageInput.selectionEnd;
            if (
                document.activeElement === messageInput &&
                selectionStart !== null &&
                selectionEnd !== null &&
                selectionStart === 0 &&
                selectionEnd === searchTerm.length
            ) {
                searchTerm = '';
            }
            historySearchTerm = searchTerm;
            historyMatches = computeHistoryMatches(historySearchTerm);
        } else if (!historyMatches.length && historySearchTerm !== null) {
            historyMatches = computeHistoryMatches(historySearchTerm);
        }

        if (!historyMatches.length) {
            return;
        }

        if (historyIndex >= historyMatches.length) {
            historyIndex = historyMatches.length - 1;
        }

        let newIndex = historyIndex;

        if (direction === 'up') {
            if (historyIndex < historyMatches.length - 1) {
                newIndex = historyIndex + 1;
            } else if (historyIndex === -1) {
                newIndex = 0;
            } else {
                return;
            }
        } else {
            if (historyIndex > 0) {
                newIndex = historyIndex - 1;
            } else if (historyIndex === 0) {
                resetHistoryNavigation();
                messageInput.value = currentInput;
                selectEntireInput();
                return;
            } else {
                return;
            }
        }

        const matchIndex = historyMatches[newIndex];
        if (matchIndex !== undefined) {
            messageInput.value = commandHistory[matchIndex];
            selectEntireInput();
            historyIndex = newIndex;
        }
    }

    function sendMessage(focus = true) {
        const lines = messageInput.value.split('\n');
        const commands = lines.map(line => line.trim()).filter(line => line.length > 0);

        if (commands.length > 0) {
            // Only add command to history if we've received the first GMCP event
            if (arkadiaClient.hasReceivedFirstGmcp()) {
                // Add each command to history if it's different from the last one
                for (const command of commands) {
                    if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== command) {
                        commandHistory.push(command);
                    }
                }
                // Reset history index
                resetHistoryNavigation();
                currentInput = '';
                resetTabState();

                // Send each command
                for (const command of commands) {
                    client.sendCommand(command, true, undefined, false, true);
                }
                if (clearInputOnSend) {
                    messageInput.value = '';
                    if (focus) messageInput.focus();
                } else if (focus) {
                    messageInput.select();
                }
            } else {
                // If we haven't received the first GMCP event yet, clear the input field
                for (const command of commands) {
                    client.sendCommand(command, true, undefined, false, true);
                }
                messageInput.value = '';
                if (focus) messageInput.focus();
            }
        } else {
            client.sendCommand('');
            if (focus) {
                if (clearInputOnSend) {
                    messageInput.focus();
                } else {
                    messageInput.select();
                }
            }
        }
    }

    sendButton.addEventListener('click', () => sendMessage(false));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            // Shift+Enter allows new line in textarea
            if (e.shiftKey) {
                return;
            }
            const active = document.activeElement as HTMLElement | null;
            const modalOpen = document.querySelector('.modal.show');
            if (modalOpen && (!active || active.id !== 'message-input')) {
                return;
            }
            if (active && active.id !== 'message-input' &&
                (active.matches('input, textarea') || active.isContentEditable)) {
                return;
            }
            e.preventDefault();
            sendMessage();
        }
    });

    // Handle up/down arrow keys for command history
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateHistory('up');
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateHistory('down');
        } else if (e.key === 'Tab') {
            e.preventDefault();
            handleTabCompletion(e.shiftKey ? 'backward' : 'forward');
        } else {
            resetTabState();
        }
    });

    messageInput.addEventListener('input', () => {
        if (historyIndex !== -1) {
            resetHistoryNavigation();
        }
        resetTabState();
    });

    // Swipe gestures for command history on touch devices
    let swipeStartX: number | null = null;
    let swipeStartY: number | null = null;

    messageInput.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            swipeStartX = e.touches[0].clientX;
            swipeStartY = e.touches[0].clientY;
        }
    }, {passive: true});

    messageInput.addEventListener('touchend', (e) => {
        if (swipeStartX === null || swipeStartY === null) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - swipeStartX;
        const dy = touch.clientY - swipeStartY;
        swipeStartX = null;
        swipeStartY = null;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
            e.preventDefault();
            if (dx < 0) {
                navigateHistory('up');
            } else {
                navigateHistory('down');
            }
        }
    });

    if (historyUpButton) {
        historyUpButton.addEventListener('click', () => navigateHistory('up'));
    }
    if (historyDownButton) {
        historyDownButton.addEventListener('click', () => navigateHistory('down'));
    }

    // Scroll to bottom and select text when input field is focused
    messageInput.addEventListener('focus', () => {
        outputWrapper.scrollTop = outputWrapper.scrollHeight;
        // Delay selection to avoid mouse click clearing it on some browsers
        setTimeout(() => messageInput.select());
    });

    // Handle connect/disconnect button click
    const handleConnect = () => {
        if (isConnected) {
            arkadiaClient.disconnect();
        } else {
            isConnecting = true;
            updateConnectButtons();
            void client.prepareSounds();
            arkadiaClient.connect();
        }
    };
    connectButton?.addEventListener('click', handleConnect);
    connectButtonInline?.addEventListener('click', handleConnect);

    if (authClose) {
        authClose.addEventListener('click', () => {
            authClosed = true;
            updateConnectButtons();
        });
    }


    // Initialize button state
    updateConnectButtons();

    // Mount React components
    mountMigratedComponents();
    const fightTitle = new FightTitle(arkadiaClient);
    new HpTitle(arkadiaClient, fightTitle);
    registerEnemyStatusFilter(client);
    new ObjectList(client);

    // Initialize mobile direction buttons
    new MobileDirectionButtons(client);
    mobileRadial = new MobileCommandRadial(client);

    // Initialize desktop buttons
    new DesktopButtons(client);

    loadMobileButtonSettings().then(s => {
        const inTeam = !!client.TeamManager.isInAnyTeam?.();
        const isLeader = !!client.TeamManager.isLeader?.();
        applyMobileButtonSettings(s, inTeam, isLeader);
    });

    initUiSettings();

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

    const npcRoot = document.getElementById('npc-options');
    if (npcRoot) {
        createRoot(npcRoot).render(createElement(Npc));
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


window.client = arkadiaClient