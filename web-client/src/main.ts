import 'bootswatch/dist/darkly/bootstrap.min.css';
import './style.css'
import arkadiaClient, {configureArkadiaClient} from "./ArkadiaClient.ts";
import "./plugin.ts"
import {Modal, Dropdown} from 'bootstrap';
import CharState from "./CharState";
import ObjectList from "./ObjectList";
import LampTimer from "./LampTimer";
import CoverTimer from "./CoverTimer";
import ZaskTimer from "./ZaskTimer";
import BreakItemWarning from "./BreakItemWarning";
import PackageStatus from "./PackageStatus";
import CharStateInfo from "./CharStateInfo";
import MultiBinds from "./MultiBinds";
import ReleaseGuard from "./ReleaseGuard";
import AttackMode from "./AttackMode";
import FightTitle from "./FightTitle";
import HpTitle from "./HpTitle";
import initSessionLogger from "./sessionLogger";
import LetterComposer from "./LetterComposer";

import "@client/src/main.ts"
import MockPort from "./MockPort.ts";
import NoSleep from 'nosleep.js';
import {loadMapData, loadColors} from "./mapDataLoader.ts";
import {loadNpcData} from "./npcDataLoader.ts";
import {EmbeddedMap} from "./embed.ts"
import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import Binds from "./options/Binds.tsx"
import Npc from "./options/Npc.tsx"
import Scripts from "./options/Scripts.tsx"
import Aliases from "./options/Aliases.tsx"
import Recordings from "./options/Recordings.tsx"
import CharacterSettings from "./options/CharacterSettings.tsx"
import ExportImport from "./options/ExportImport.tsx"
import UserTriggers from "./options/UserTriggers.tsx"
import Shortcuts from "./options/Shortcuts.tsx"
import MobileButtons from "./options/MobileButtons.tsx"
import {
    loadSettings as loadMobileButtonSettings,
    applySettings as applyMobileButtonSettings
} from "./mobileButtonSettings"
import "./triggerTester"
import "./triggerFinder"
import MessageRouter from "@client/src/runtime/transport/message-router";
import { runtimeEventHub } from "@client/src/runtime/event-hub";
import services from "@client/src/runtime/service-registry";
import { COLORS_DATASET_KEY, MAP_DATASET_KEY } from "@client/src/runtime/data";
import type { DataCatalogEntryStatus } from "@client/src/runtime/data";
import { ClientCommandDispatcher } from "@client/src/runtime/command-dispatcher";
import WebSocketTransportAdapter from "./transport/websocket-adapter";
import {parseAnsiPatterns} from "./ansiParser";
import { bindUiStoreToClientEvents, uiStore } from "./ui/store";

const transport = new WebSocketTransportAdapter();
const router = new MessageRouter(transport, runtimeEventHub, { parseAnsiPatterns });
configureArkadiaClient({ transport, router });

initSessionLogger(arkadiaClient).catch(err => console.error('Logger init failed', err));

const client = new Client(arkadiaClient, new MockPort())
const commandDispatcher = new ClientCommandDispatcher(client);
uiStore.getState().setCommandDispatcher(commandDispatcher);
window.clientExtension = client;
bindUiStoreToClientEvents(client);
registerScripts(client)
client.connect(client.port, true)


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

        client.removeEventListener('gmcp.room.info', handleInitialLocation);
    };
    client.addEventListener('gmcp.room.info', handleInitialLocation);
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

    const enableNoSleep = () => {
        noSleepInstance!.enable();
        wakeLockEnabled = true;
        updateWakeLockButton();
    };

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

void (async () => {
    try {
        const npc = await loadNpcData();
        client.sendEvent("npc", npc);
    } catch (error) {
        console.error('Failed to load NPC data:', error);
    }
})();

arkadiaClient.on('settings', (detail: any) => {
    if (detail?.binds?.directions) {
        applyDirectionBinds(detail.binds.directions);
    }
});

client.addEventListener('binds', (ev: CustomEvent) => {
    if (ev.detail?.directions) {
        applyDirectionBinds(ev.detail.directions);
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

const dataCatalog = services.dataCatalog;
let mapStatus: DataCatalogEntryStatus = dataCatalog.metadataFor(MAP_DATASET_KEY)?.status ?? 'idle';
let colorStatus: DataCatalogEntryStatus = dataCatalog.metadataFor(COLORS_DATASET_KEY)?.status ?? 'idle';
let progressMessageOverride: string | null = null;

function refreshProgressDisplay() {
    if (mapStatus === 'ready' && colorStatus === 'ready') {
        progressContainer.style.display = 'none';
        progressBar.textContent = '';
        progressBar.style.width = '100%';
        return;
    }

    progressContainer.style.display = 'block';

    const messages: string[] = [];
    if (progressMessageOverride) {
        messages.push(progressMessageOverride);
    } else {
        if (mapStatus === 'error') {
            messages.push('Failed to load map data');
        } else if (mapStatus !== 'ready') {
            messages.push('Loading map data…');
        }

        if (colorStatus === 'error') {
            messages.push('Failed to load map colors');
        } else if (colorStatus !== 'ready') {
            messages.push('Loading map colors…');
        }
    }

    progressBar.textContent = messages.join(' ');

    const loadingStates = [mapStatus, colorStatus].filter((status) => status === 'loading').length;
    const percent = loadingStates > 0 ? 60 : 100;
    progressBar.style.width = `${percent}%`;
}

refreshProgressDisplay();

const outputWrapper = document.getElementById('main_text_output_msg_wrapper') as HTMLElement;
const splitBottom = document.getElementById('split-bottom') as HTMLElement;
const stickyArea = document.getElementById('sticky-area') as HTMLElement;
let isSplitView = false;
const STICKY_LINES = 15;

function processSticky(count: number) {
    const handler: any = (window as any).clientExtension?.OutputHandler;
    if (handler && typeof handler.processOutput === 'function') {
        const prev = handler.output;
        handler.output = stickyArea;
        handler.processOutput(new CustomEvent('output-sent', {detail: count}));
        handler.output = prev;
    }
}

function checkSplitView() {
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
        processSticky(nodes.length - start);
    }
}

outputWrapper.addEventListener('scroll', checkSplitView);

function closeHistoryScrollback() {
    outputWrapper.scrollTop = outputWrapper.scrollHeight;
}


let lastTap = 0;
outputWrapper.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap < 300) {
        e.preventDefault();
        closeHistoryScrollback();
    }
    lastTap = now;
});

outputWrapper.addEventListener('dblclick', closeHistoryScrollback);

if (mapStatus !== 'ready') {
    mapStatus = 'loading';
}
if (colorStatus !== 'ready') {
    colorStatus = 'loading';
}
refreshProgressDisplay();

const mapDataPromise = loadMapData()
    .then((mapData) => {
        mapStatus = 'ready';

        const metadata = dataCatalog.metadataFor(MAP_DATASET_KEY);
        if (metadata?.source) {
            progressMessageOverride = metadata.source === 'cache'
                ? 'Loaded map data from cache'
                : 'Loaded map data';
            refreshProgressDisplay();
            progressMessageOverride = null;
            refreshProgressDisplay();
        } else {
            refreshProgressDisplay();
        }

        return mapData;
    })
    .catch((error) => {
        mapStatus = 'error';
        progressMessageOverride = error instanceof Error ? error.message : String(error);
        refreshProgressDisplay();
        throw error;
    });

const colorsPromise = loadColors()
    .then((colors) => {
        colorStatus = 'ready';
        refreshProgressDisplay();
        return colors;
    })
    .catch((error) => {
        colorStatus = 'error';
        progressMessageOverride = error instanceof Error ? error.message : String(error);
        refreshProgressDisplay();
        throw error;
    });

// When both are loaded, dispatch events
Promise.all([mapDataPromise, colorsPromise])
    .then(([mapData, colors]) => {
        console.log('Map data and colors loaded successfully');
        refreshProgressDisplay();
        const {startId, reader, pathFinder} = client.Map.initialize(mapData, colors);
        (window as any).embedded = new EmbeddedMap(reader, pathFinder, startId);
    })
    .catch(error => {
        refreshProgressDisplay();
        console.error('Failed to load map data or colors:', error);
    });


// Set up message event listener for UI updates
arkadiaClient.on('message', (message: string, type?: string) => {
    if (message === "") {
        return; //TODO investigate
    }
    const wrapper = document.createElement('div');
    wrapper.classList.add('output_msg');

    if (type) {
        wrapper.classList.add(type);
    }

    const messageDiv = document.createElement('div');
    messageDiv.innerHTML = message;
    messageDiv.classList.add('output_msg_text');
    messageDiv.style.whiteSpace = 'pre-wrap';

    wrapper.appendChild(messageDiv);
    outputWrapper.insertBefore(wrapper, splitBottom);

    const maxElements = 1000;
    while (outputWrapper.childElementCount - 1 > maxElements) {
        const first = outputWrapper.firstElementChild;
        if (first === splitBottom) {
            const second = first.nextElementSibling;
            if (second) {
                outputWrapper.removeChild(second);
            } else {
                break;
            }
        } else if (first) {
            outputWrapper.removeChild(first);
        } else {
            break;
        }
    }

    if (isSplitView) {
        stickyArea.appendChild(wrapper.cloneNode(true));
        processSticky(1);
        while (stickyArea.childElementCount > STICKY_LINES) {
            const firstSticky = stickyArea.firstElementChild;
            if (firstSticky) {
                stickyArea.removeChild(firstSticky);
            } else {
                break;
            }
        }
    } else {
        outputWrapper.scrollTop = outputWrapper.scrollHeight;
    }
});

// Track connection state
let isConnected = false;
let isConnecting = false;
let playbackMode = false;
let authClosed = false;

// Function to update the connect button state
function updateConnectButtons() {
    const connectButton = document.getElementById('connect-button') as HTMLButtonElement | null;
    const connectButtonFloat = document.getElementById('connect-button-float') as HTMLButtonElement | null;
    const loginForm = document.getElementById('login-form') as HTMLFormElement | null;
    const authOverlay = document.getElementById('auth-overlay') as HTMLElement | null;
    const spinner = document.getElementById('connecting-spinner') as HTMLElement | null;

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

    if (connectButtonFloat) {
        if (!isConnected && !isConnecting && authClosed) {
            connectButtonFloat.style.display = 'block';
        } else {
            connectButtonFloat.style.display = 'none';
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
}

// Handle client connect event
arkadiaClient.on('client.connect', () => {
    isConnected = true;
    isConnecting = false;
    updateConnectButtons();
    commandDispatcher.sendEvent('refreshPositionWhenAble');
    console.log('Client connected to Arkadia server.');
});

// Handle client disconnect event
arkadiaClient.on('client.disconnect', () => {
    isConnected = false;
    isConnecting = false;
    updateConnectButtons();
    console.log('Client disconnected from Arkadia server.');
});

// Ensure button state is correct when returning to the tab
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && arkadiaClient.isSocketOpen()) {
        isConnected = true;
        updateConnectButtons();
    }
});


// Numpad key mapping for directions (standard orientation)
const numpadDirections: { [key: string]: string } = {
    'Numpad8': 'n',
    'Numpad2': 's',
    'Numpad4': 'w',
    'Numpad6': 'e',
    'Numpad7': 'nw',
    'Numpad9': 'ne',
    'Numpad1': 'sw',
    'Numpad3': 'se',
    'NumpadMultiply': 'u',
    'NumpadSubtract': 'd',
    'NumpadDivide': 'd',
    'Numpad0': 'special',
    'Numpad5': 'zerknij'
};

function applyDirectionBinds(dirs: any) {
    Object.keys(numpadDirections).forEach(k => {
        if (!['NumpadDivide', 'Numpad0', 'Numpad5'].includes(k)) delete numpadDirections[k];
    });
    Object.entries(dirs || {}).forEach(([dir, bind]: any) => {
        if (bind && bind.key) {
            numpadDirections[bind.key] = dir;
        }
    });
    numpadDirections['NumpadDivide'] = 'd';
    numpadDirections['Numpad0'] = 'special';
    numpadDirections['Numpad5'] = 'zerknij';
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
    const direction = numpadDirections[e.code];
    if (direction) {
        e.preventDefault();
        if (direction === 'special') {
            const exits = (window as any).clientExtension?.Map.currentRoom?.specialExits ?? {};
            const first = Object.keys(exits)[0];
            if (first) {
                (window as any).clientExtension.sendCommand(first);
            }
        } else {
            client.sendCommand(direction);
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Activate tab sleep prevention for mobile devices
    if (window.innerWidth < 768) {
        preventTabSleep();
        console.log('Tab sleep prevention activated for mobile device');
    }

    const commitInfo = document.getElementById('commit-info') as HTMLElement | null;
    if (commitInfo) {
        commitInfo.textContent = `${__COMMIT_SHA__} ${__COMMIT_DATE__}`;
    }

    const messageInput = document.getElementById('message-input') as HTMLInputElement;
    const sendButton = document.getElementById('send-button') as HTMLButtonElement;
    const historyUpButton = document.getElementById('history-up-button') as HTMLButtonElement | null;
    const historyDownButton = document.getElementById('history-down-button') as HTMLButtonElement | null;
    const connectButton = document.getElementById('connect-button') as HTMLButtonElement | null;
    const connectButtonFloat = document.getElementById('connect-button-float') as HTMLButtonElement | null;
    const menuButton = document.getElementById('menu-button') as HTMLButtonElement | null;
    const optionsButton = document.getElementById('options-button') as HTMLButtonElement;
    const exportImportButton = document.getElementById('export-import-button') as HTMLButtonElement | null;
    const optionsSave = document.getElementById('options-save') as HTMLButtonElement | null;
    const bindsButton = document.getElementById('binds-button') as HTMLButtonElement | null;
    const npcButton = document.getElementById('npc-button') as HTMLButtonElement | null;
    const scriptsButton = document.getElementById('scripts-button') as HTMLButtonElement | null;
    const aliasesButton = document.getElementById('aliases-button') as HTMLButtonElement | null;
    const triggersButton = document.getElementById('triggers-button') as HTMLButtonElement | null;
    const recordingsButton = document.getElementById('recordings-button') as HTMLButtonElement | null;
    const shortcutsButton = document.getElementById('shortcuts-button') as HTMLButtonElement | null;
    const mobileButtonsButton = document.getElementById('mobile-buttons-button') as HTMLButtonElement | null;
    const recordingButton = document.getElementById('recording-button') as HTMLButtonElement | null;
    const playbackControls = document.getElementById('playback-controls') as HTMLElement | null;
    const playbackPause = document.getElementById('playback-pause') as HTMLButtonElement | null;
    const playbackStop = document.getElementById('playback-stop') as HTMLButtonElement | null;
    const playbackInfo = document.getElementById('playback-info') as HTMLElement | null;
    const playbackReplay = document.getElementById('playback-replay') as HTMLButtonElement | null;
    const playbackStepBack = document.getElementById('playback-step-back') as HTMLButtonElement | null;
    const playbackStep = document.getElementById('playback-step') as HTMLButtonElement | null;
    wakeLockButton = document.getElementById('wake-lock-button') as HTMLButtonElement | null;
    updateWakeLockButton();

    // Initialize Bootstrap modal
    const optionsModalElement = document.getElementById('options-modal');
    const optionsModal = optionsModalElement ? new Modal(optionsModalElement) : null;
    const exportImportModalElement = document.getElementById('export-import-modal');
    const exportImportModal = exportImportModalElement ? new Modal(exportImportModalElement) : null;
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
    const mobileButtonsModalElement = document.getElementById('mobile-buttons-modal');
    const mobileButtonsModal = mobileButtonsModalElement ? new Modal(mobileButtonsModalElement) : null;
    const loginCharacter = document.getElementById('login-character') as HTMLInputElement | null;
    const loginPassword = document.getElementById('login-password') as HTMLInputElement | null;
    const loginForm = document.getElementById('login-form') as HTMLFormElement | null;
    const authClose = document.getElementById('auth-close') as HTMLButtonElement | null;
    const notificationCenter = document.getElementById('notification-center') as HTMLElement | null;
    const enableNotificationsSettings = document.getElementById('ui-enable-notifications') as HTMLButtonElement | null;
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
        client.eventTarget.addEventListener('notify', (ev: CustomEvent<{ text: string; time?: number }>) => {
            const detail = ev.detail || {} as any;
            const div = document.createElement('div');
            div.className = 'notification';
            div.textContent = detail.text || '';
            notificationCenter.appendChild(div);
            const timeout = typeof detail.time === 'number' ? detail.time : 2000;
            setTimeout(() => div.remove(), timeout);
        });
    }

    if (menuButton) {
        new Dropdown(menuButton);
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
        if (mobileButtonsModal) {
            mobileButtonsModal.hide();
        }
    });

    window.addEventListener('show-export-import', () => {
        if (exportImportModal) {
            exportImportModal.show();
        }
    });

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

    if (mobileButtonsButton && mobileButtonsModal) {
        mobileButtonsButton.addEventListener('click', () => {
            mobileButtonsModal.show();
        });
    }

    if (shareLocationButton && locationQrImage && locationShareModal) {
        shareLocationButton.addEventListener('click', () => {
            const roomId = (window as any).clientExtension?.Map?.currentRoom?.id;
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
            if (playbackPause.textContent === 'Pause') {
                arkadiaClient.pausePlayback();
            } else {
                arkadiaClient.resumePlayback();
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

    arkadiaClient.on('recording.start', () => {
        if (recordingButton) recordingButton.style.display = 'block';
    });
    arkadiaClient.on('recording.stop', () => {
        if (recordingButton) recordingButton.style.display = 'none';
    });

    arkadiaClient.on('playback.start', (total: number) => {
        playbackMode = true;
        if (playbackControls) playbackControls.style.display = 'flex';
        if (playbackInfo) playbackInfo.textContent = `0 / ${total}`;
        if (playbackPause) playbackPause.textContent = 'Pause';
        updateConnectButtons();
    });

    arkadiaClient.on('playback.stop', () => {
        playbackMode = false;
        if (playbackControls) playbackControls.style.display = 'none';
        updateConnectButtons();
    });

    arkadiaClient.on('playback.pause', () => {
        if (playbackPause) playbackPause.textContent = 'Resume';
    });

    arkadiaClient.on('playback.resume', () => {
        if (playbackPause) playbackPause.textContent = 'Pause';
    });

    arkadiaClient.on('playback.index', (index: number, total: number) => {
        if (playbackInfo) playbackInfo.textContent = `${index} / ${total}`;
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

            // Password persistence removed
            arkadiaClient.setStoredPassword(password || null);
            arkadiaClient.setStoredCharacter(character || null);

            const sendCreds = () => {
                if (character) client.send(character);
                if (password) client.send(password);
                arkadiaClient.off('client.connect', sendCreds);
            };

            if (!isConnected) {
                arkadiaClient.on('client.connect', sendCreds);
                isConnecting = true;
                updateConnectButtons();
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

    function navigateHistory(direction: 'up' | 'down') {
        // Only allow command history navigation if we've received the first GMCP event
        if (!arkadiaClient.hasReceivedFirstGmcp()) return;
        if (commandHistory.length === 0) return;

        const wasFocused = document.activeElement === messageInput;

        if (historyIndex === -1) {
            currentInput = messageInput.value;
            // Skip the just sent command if the input wasn't modified
            if (
                direction === 'up' &&
                commandHistory.length > 1 &&
                messageInput.value === commandHistory[commandHistory.length - 1]
            ) {
                historyIndex = 1;
                messageInput.value = commandHistory[commandHistory.length - 1 - historyIndex];
                if (wasFocused) messageInput.select();
                return;
            }
        }

        if (direction === 'up') {
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                messageInput.value = commandHistory[commandHistory.length - 1 - historyIndex];
                if (wasFocused) messageInput.select();
            }
        } else {
            if (historyIndex > 0) {
                historyIndex--;
                messageInput.value = commandHistory[commandHistory.length - 1 - historyIndex];
                if (wasFocused) messageInput.select();
            } else if (historyIndex === 0) {
                historyIndex = -1;
                messageInput.value = currentInput;
                if (wasFocused) messageInput.select();
            }
        }
    }

    function sendMessage(focus = true) {
        const message = messageInput.value.trim();
        if (message) {
            // Only add command to history if we've received the first GMCP event
            if (arkadiaClient.hasReceivedFirstGmcp()) {
                // Add command to history if it's different from the last one
                if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== message) {
                    commandHistory.push(message);
                }
                // Reset history index
                historyIndex = -1;
                currentInput = '';

                client.sendCommand(message);
                if (focus) messageInput.select();
            } else {
                // If we haven't received the first GMCP event yet, clear the input field
                client.sendCommand(message);
                messageInput.value = '';
            }
        } else {
            client.sendCommand('');
            if (focus) messageInput.select();
        }
    }

    sendButton.addEventListener('click', () => sendMessage(false));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
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
        }
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
            arkadiaClient.connect();
        }
    };
    connectButton?.addEventListener('click', handleConnect);
    connectButtonFloat?.addEventListener('click', handleConnect);

    if (authClose) {
        authClose.addEventListener('click', () => {
            authClosed = true;
            updateConnectButtons();
        });
    }


    // Initialize button state
    updateConnectButtons();

    // Display character state and lamp timer
    new MultiBinds(arkadiaClient);
    new CharState(arkadiaClient);
    new CharStateInfo(arkadiaClient);
    new LampTimer(arkadiaClient);
    new CoverTimer(arkadiaClient);
    new ZaskTimer(arkadiaClient);
    new BreakItemWarning(arkadiaClient);
    new ReleaseGuard(arkadiaClient);
    new AttackMode(arkadiaClient);
    new PackageStatus(arkadiaClient);
    const fightTitle = new FightTitle(arkadiaClient);
    new HpTitle(arkadiaClient, fightTitle);
    new ObjectList(client);
    new LetterComposer(arkadiaClient);

    // Initialize mobile direction buttons
    new MobileDirectionButtons(client);

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

    const mobileButtonsRoot = document.getElementById('mobile-buttons-options');
    if (mobileButtonsRoot) {
        createRoot(mobileButtonsRoot).render(createElement(MobileButtons));
    }
});

// Add resize event listener to check if device becomes mobile-sized
window.addEventListener('resize', () => {
    // Check if device is mobile-sized and tab sleep prevention is not active
    if (window.innerWidth < 768 && !tabSleepPreventionActive) {
        preventTabSleep();
        console.log('Tab sleep prevention activated on resize for mobile device');
    }
});

// @ts-ignore
window.client = arkadiaClient

// background communication disabled

import MobileDirectionButtons from "./scripts/mobileDirectionButtons"
import initUiSettings from "./uiSettings";
import Client from "@client/src/Client.ts";
import {registerScripts} from "@client/src/main.ts";
