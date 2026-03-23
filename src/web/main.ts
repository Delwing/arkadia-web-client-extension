import 'bootswatch/dist/darkly/bootstrap.min.css';
import './style.css'
import './themes/fantasy.css'
import './themes/forest.css'
import './themes/icy.css'
import './themes/gray.css'
import './themes/dark-neutral.css'
import './themes/light-parchment.css'
import './themes/light-silver.css'
import './layout/layout.css'
import arkadiaClient from "./ArkadiaClient.ts";
import Client from "@client/Client";
import eventBus from "@modules/core/eventBus";
import {preloadHowler, resumeAudioContext} from "@client/SoundManager";
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
import initLogFileSaver from "./logFileSaver";
import MobileDirectionButtons from "./scripts/mobileDirectionButtons";
import DesktopButtons from "./scripts/desktopButtons";
import MobileCommandRadial from "./scripts/mobileCommandRadial";
import initUiSettings from "./uiSettings";

import "@client/main.ts"
import {getActiveKeymapId, switchKeymap} from "@modules/core/keymapStorage";
import NoSleep from 'nosleep.js';
import {loadColors, loadMapData, subscribeToMapData} from "./mapDataLoader.ts";
import {EmbeddedMap} from "./embed.ts"
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
import MobileRadialCommands from "./options/MobileRadialCommands.tsx"
import {invalidateLayoutCache, LayoutManagerWrapper, loadLayoutState, saveLayoutState} from "@web/layout"
import {copyOutputAsImage, saveOutputAsHtml} from "./copyOutputAsImage";
import {
    applySettings as applyMobileButtonSettings,
    loadSettings as loadMobileButtonSettings
} from "./mobileButtonSettings"
import {characterStorage, globalStorage, migrateNewlyCharacterScopedKeys} from "@modules/core/storage"
import {
    migrateButtonSizeMultiplier,
    migrateFooterComponentVisibility,
    runAllSettingsMigrations
} from "@modules/core/settingsMigrations"
import {
    areOutputTimestampsVisible,
    setOutputTimestampVisibility,
    setupOutputMessageHandler,
} from "@shared/dom/outputMessageHandler";
import {refresh as refreshNpcStore, subscribe as subscribeNpcStore} from "./dataStores/npcStore";
import {CommandInputController} from "./commandInput/CommandInputController";

initSessionLogger(arkadiaClient).catch(err => console.error('Logger init failed', err));
initLogFileSaver(arkadiaClient).catch(err => console.error('File saver init failed', err));

// Run migrations before initializing the client
migrateNewlyCharacterScopedKeys();
runAllSettingsMigrations();
migrateButtonSizeMultiplier();
migrateFooterComponentVisibility();

// Initialize Firebase real-time sync listener (skip on localhost)
if (!(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    import('@modules/firebase').then(({ loadFirebaseConfig, initializeFirebase, onAuthStateChanged, syncListener }) => {
        const config = loadFirebaseConfig();
        if (!config) return;
        initializeFirebase(config).then(() => {
            onAuthStateChanged((authState) => {
                if (authState.isAuthenticated && authState.userId) {
                    syncListener.start(authState.userId);
                } else {
                    syncListener.stop();
                }
            });
        }).catch(err => {
            console.warn('[Firebase] Failed to initialize at startup:', err);
        });
    }).catch(() => {
        // Firebase module not available
    });
}

let mobileRadial: MobileCommandRadial | null = null;

// Populate the flat 'binds' storage key from the active keymap so that
// Client picks up keybinds on first read (fixes binds not working until
// the user opens Bindowanie and clicks Zapisz).
switchKeymap(getActiveKeymapId());

const client = new Client(arkadiaClient);
setClientInstance(client);
registerScripts(client);

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

// Preload Howler on first user interaction so AudioContext exists before connect
function setupAudioContextResume() {
    const resumeOnInteraction = () => {
        preloadHowler();
        resumeAudioContext();
    };
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

characterStorage.onChange('settings', (detail) => {
    const payload = detail as { binds?: { directions?: unknown } } | undefined;
    const directions = payload?.binds?.directions;
    if (isDirectionMap(directions)) {
        applyDirectionBinds(directions);
    }
});

globalStorage.onChange('binds', (detail) => {
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
const STICKY_LINES = 50;
const DOUBLE_CLICK_TIMEOUT_MS = 300;
let suppressSplitViewUntil = 0;
let lastMultiBindsState = multiBindsElement?.classList.contains('active') ?? false;

function refreshStickyArea() {
    stickyArea.innerHTML = '';
    const nodes = Array.from(outputWrapper.children).filter(n => n !== splitBottom);
    const start = Math.max(0, nodes.length - STICKY_LINES);
    for (let i = start; i < nodes.length; i++) {
        stickyArea.appendChild(nodes[i].cloneNode(true));
    }
}

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
            suppressSplitViewUntil = Date.now() + 150;
            splitBottom.classList.add('split-hidden');
            stickyArea.innerHTML = '';
        }
    } else if (!isSplitView) {
        isSplitView = true;
        suppressSplitViewUntil = Date.now() + 150;
        splitBottom.classList.remove('split-hidden');
        refreshStickyArea();
    }
}

outputWrapper.addEventListener('scroll', checkSplitView);

// Preemptively show split view on wheel scroll-up to prevent 1-frame jitter.
// The 'wheel' event fires BEFORE the compositor processes the scroll, so showing
// the split view here ensures it's visible in the same frame as the scroll.
outputWrapper.addEventListener('wheel', (e) => {
    if (e.deltaY < 0 && !isSplitView && Date.now() >= suppressSplitViewUntil && outputWrapper.scrollHeight > outputWrapper.clientHeight) {
        const atBottom = outputWrapper.scrollTop + outputWrapper.clientHeight + splitBottom.clientHeight >= outputWrapper.scrollHeight - 1;
        if (atBottom) {
            isSplitView = true;
            suppressSplitViewUntil = Date.now() + 150;
            splitBottom.classList.remove('split-hidden');
            refreshStickyArea();
        }
    }
}, {passive: true});

// Split view resize handle drag logic
const splitHandle = document.getElementById('split-handle')!;
let isDraggingSplit = false;

function onSplitDragStart(e: MouseEvent | TouchEvent) {
    if (e.type === 'mousedown') e.preventDefault();
    isDraggingSplit = true;
    suppressSplitViewUntil = Infinity;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onSplitDragMove);
    document.addEventListener('mouseup', onSplitDragEnd);
    document.addEventListener('touchmove', onSplitDragMove, { passive: false });
    document.addEventListener('touchend', onSplitDragEnd);
}

function onSplitDragMove(e: MouseEvent | TouchEvent) {
    if (!isDraggingSplit) return;
    e.preventDefault();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const wrapperRect = outputWrapper.getBoundingClientRect();
    const newHeight = Math.max(60, wrapperRect.bottom - clientY);
    splitBottom.style.height = newHeight + 'px';
}

function onSplitDragEnd() {
    if (!isDraggingSplit) return;
    isDraggingSplit = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onSplitDragMove);
    document.removeEventListener('mouseup', onSplitDragEnd);
    document.removeEventListener('touchmove', onSplitDragMove);
    document.removeEventListener('touchend', onSplitDragEnd);
    refreshStickyArea();
    suppressSplitViewUntil = Date.now() + 300;
    // Persist split view height to UI settings
    const height = splitBottom.clientHeight;
    if (height >= 60) {
        const settings = globalStorage.get('uiSettings');
        if (settings) {
            settings.splitViewHeight = height;
            globalStorage.set('uiSettings', settings);
        }
    }
}

splitHandle.addEventListener('mousedown', onSplitDragStart);
splitHandle.addEventListener('touchstart', onSplitDragStart, { passive: true });

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
        items.push({
            label: 'Zapisz jako HTML',
            action: () => {
                saveOutputAsHtml().catch(err => {
                    console.error('Failed to save as HTML:', err);
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
            opensWindow: true,
        },
        {
            label: 'Biblioteki',
            action: () => {
                eventBus.emit('sendCommand', {command: '/biblioteki'});
            },
            opensWindow: true,
        },
        {
            label: 'Zioła',
            action: () => {
                eventBus.emit('sendCommand', {command: '/ziola'});
            },
            opensWindow: true,
        },
        {
            label: 'Zioła (tekst)',
            action: () => {
                eventBus.emit('sendCommand', {command: '/ziola2'});
            },
            opensWindow: true,
        },
        {
            label: 'Zlecenia',
            action: () => {
                eventBus.emit('sendCommand', {command: '/zlecenia'});
            },
            opensWindow: true,
        },
        {
            label: 'Skróty',
            action: () => {
                eventBus.emit('skroty.popup.open');
            },
            opensWindow: true,
        },
        {
            label: 'Zegar',
            action: () => {
                eventBus.emit('sendCommand', {command: '/czas'});
            },
            opensWindow: true,
        },
        {
            label: 'Chat',
            action: () => {
                eventBus.emit('sendCommand', {command: '/chatw'});
            },
            opensWindow: true,
        },
        {
            label: 'Walka',
            action: () => {
                eventBus.emit('sendCommand', {command: '/walkaw'});
            },
            opensWindow: true,
        },
        {
            label: 'Postepy',
            action: () => {
                eventBus.emit('postepy.popup.open');
            },
            opensWindow: true,
        },
        {
            label: 'Postepy 2',
            action: () => {
                eventBus.emit('postepy2.popup.open');
            },
            opensWindow: true,
        },
        {
            label: 'Zabici',
            action: () => {
                eventBus.emit('zabici.popup.open');
            },
            opensWindow: true,
        },
        {
            label: 'Zabici 2',
            action: () => {
                eventBus.emit('zabici2.popup.open');
            },
            opensWindow: true,
        },
        {
            label: 'Poczta',
            action: () => {
                eventBus.emit('poczta.popup.open');
            },
            opensWindow: true,
        },
        {
            label: 'Depozyty',
            action: () => {
                eventBus.emit('deposits.popup.open', {});
            },
            opensWindow: true,
        },
        {
            label: 'Wedka',
            action: () => {
                eventBus.emit('sendCommand', {command: '/wedka'});
            },
            opensWindow: true,
        },
        {
            label: 'Kalendarz',
            action: () => {
                eventBus.emit('sunTracker.popup.open');
            },
            opensWindow: true,
        },
        {
            label: 'Zawod',
            action: () => {
                eventBus.emit('profession.popup.open');
            },
            opensWindow: true,
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

        const {startId, reader, pathFinder} = client.Map.initialize(mapData, colors);
        const savedAlgorithm = globalStorage.get('uiSettings')?.pathFindingAlgorithm;
        if (savedAlgorithm && pathFinder.setAlgorithm) {
            pathFinder.setAlgorithm(savedAlgorithm);
        }
        const embedded = new EmbeddedMap(reader, startId);
        (embedded as any).pathFinder = pathFinder;
        (globalThis as any).embedded = embedded;

        subscribeToMapData((newMapData) => {
            if (!newMapData) return;
            const currentEmbedded = (globalThis as any).embedded as EmbeddedMap | undefined;
            if (!currentEmbedded) return;

            const result = client.Map.initialize(newMapData, colors);
            const newSavedAlgorithm = globalStorage.get('uiSettings')?.pathFindingAlgorithm;
            if (newSavedAlgorithm && result.pathFinder.setAlgorithm) {
                result.pathFinder.setAlgorithm(newSavedAlgorithm);
            }
            currentEmbedded.reload(result.reader);
            (currentEmbedded as any).pathFinder = result.pathFinder;
            eventBus.emit('mapDataChanged');
        }, { emitInitial: false });
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
    const wakeLockSetting = globalStorage.get('uiSettings')?.wakeLock;
    if (wakeLockSetting !== false) {
        preventTabSleep();
    }
    console.log('Client connected to Arkadia server.');
});

// Handle client disconnect event
arkadiaClient.on('client.disconnect', () => {
    isConnected = false;
    isConnecting = false;
    isDisconnecting = false;
    authClosed = false;
    updateConnectButtons();
    disableTabSleepPrevention();
    client.println('Rozłączono z serwerem Arkadii.');
    console.log('Client disconnected from Arkadia server.');
});

// Ensure button state is correct when returning to the tab
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Suppress split view checks during tab reactivation reflow
        suppressSplitViewUntil = Date.now() + 500;

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

// Build initial direction bindings from stored binds (if any) so that
// custom direction keys work immediately after reload without re-saving.
const storedBindsForDirs = globalStorage.get('binds');
let directionBindings: DirectionBinding[] = buildDirectionBindings(
    (storedBindsForDirs as any)?.directions ?? undefined
);

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
    const sendButton = document.getElementById('send-button') as HTMLButtonElement;
    const uiSettingsData = globalStorage.get('uiSettings');
    let clearInputOnSend = !!uiSettingsData?.clearInputOnSend;
    globalStorage.onChange('uiSettings', (payload) => {
        if (typeof payload?.clearInputOnSend === 'boolean') {
            clearInputOnSend = payload.clearInputOnSend;
        }
        if (typeof payload?.wakeLock === 'boolean') {
            if (payload.wakeLock && isConnected) {
                preventTabSleep();
            } else {
                disableTabSleepPrevention();
            }
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

            if (target.closest('a, button, input, textarea, select, [contenteditable], [data-output-clickable], .plugin-window, .modal, .managed-panel')) {
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

    if (bindsButton && bindsModal) {
        bindsButton.addEventListener('click', () => {
            bindsModal.show();
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
            preloadHowler();
            resumeAudioContext();
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

    const commandInputController = new CommandInputController({
        messageInput,
        outputWrapper,
        sendButton,
        historyUpButton,
        historyDownButton,
        sendCommand: (cmd, echo, opts, skip, fromUser) => client.sendCommand(cmd, echo, opts, skip, fromUser),
        hasReceivedFirstGmcp: () => arkadiaClient.hasReceivedFirstGmcp(),
        getCommandLineSuggestions: () => client.commandLineSuggestions ?? [],
        getClearInputOnSend: () => clearInputOnSend,
    });
    commandInputController.attach();

    // Handle connect/disconnect button click
    const handleConnect = () => {
        if (isConnected) {
            arkadiaClient.disconnect();
        } else {
            preloadHowler();
            resumeAudioContext();
            isConnecting = true;
            updateConnectButtons();
            void client.prepareSounds();
            arkadiaClient.connect();
        }
    };
    connectButton?.addEventListener('click', handleConnect);
    connectButtonInline?.addEventListener('click', handleConnect);

    const mccpCheckbox = document.getElementById('mccp-enabled') as HTMLInputElement | null;
    if (mccpCheckbox) {
        mccpCheckbox.checked = arkadiaClient.isMccpEnabled();
        mccpCheckbox.addEventListener('change', () => {
            arkadiaClient.setMccpEnabled(mccpCheckbox.checked);
        });
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
    const fightTitle = new FightTitle(arkadiaClient);
    new HpTitle(arkadiaClient, fightTitle);
    registerEnemyStatusFilter(client);
    new ObjectList(client);

    // Initialize mobile direction buttons
    new MobileDirectionButtons(client);
    mobileRadial = new MobileCommandRadial(client);

    // Initialize desktop buttons
    new DesktopButtons(client);

    const mobileSettings = loadMobileButtonSettings();
    const inTeam = !!client.TeamManager.isInAnyTeam?.();
    const isLeader = !!client.TeamManager.isLeader?.();
    applyMobileButtonSettings(mobileSettings, inTeam, isLeader);

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