import 'bootswatch/dist/darkly/bootstrap.min.css';
import './style.css'
import arkadiaClient from "./ArkadiaClient.ts";
import {Modal, Dropdown} from 'bootstrap';
import CharState from "./CharState";
import ObjectList from "./ObjectList";
import LampTimer from "./LampTimer";
import TransportTimer from "./TransportTimer";
import CoverTimer from "./CoverTimer";
import ZaskTimer from "./ZaskTimer";
import CombatTimer from "./CombatTimer";
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
import KnowledgeReport from "./KnowledgeReport";
import KnowledgeDetailsReport from "./KnowledgeDetailsReport";

import "@client/src/main.ts"
import MockPort from "./MockPort.ts";
import NoSleep from 'nosleep.js';
import {loadMapData, loadColors} from "./mapDataLoader.ts";
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
import MobileRadialCommands from "./options/MobileRadialCommands.tsx"
import HerbManager from "./herbs/HerbManager";
import {
    loadSettings as loadMobileButtonSettings,
    applySettings as applyMobileButtonSettings
} from "./mobileButtonSettings"
import "./triggerTester"
import "./triggerFinder"
import {getItemSync} from "@client/src/storage"
import {
    areOutputTimestampsVisible,
    setOutputTimestampVisibility,
    setupOutputMessageHandler,
} from "./outputMessageHandler";
import {refresh as refreshNpcStore, subscribe as subscribeNpcStore} from "./dataStores/npcStore";

initSessionLogger(arkadiaClient).catch(err => console.error('Logger init failed', err));

const client = new Client(arkadiaClient, new MockPort())
window.clientExtension = client;
registerScripts(client)
client.connect(client.port, true)

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

progressContainer.style.display = 'none';

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

outputWrapper.addEventListener('contextmenu', event => {
    if (event.defaultPrevented) {
        return;
    }
    const target = event.target as HTMLElement | null;
    if (target && target.closest('a, [data-output-clickable]')) {
        return;
    }
    const handler: any = (window as any).clientExtension?.OutputHandler;
    if (!handler || typeof handler.showContextMenu !== 'function') {
        return;
    }
    event.preventDefault();
    const isVisible = areOutputTimestampsVisible();
    const items = [
        {
            label: isVisible ? 'Ukryj znaczniki czasu' : 'Pokaż znaczniki czasu',
            action: () => setOutputTimestampVisibility(!isVisible),
        },
    ];
    const clientExtension = (window as any).clientExtension as { sendCommand?: (command: string) => Promise<void> } | undefined;
    if (clientExtension?.sendCommand) {
        items.push(
            {
                label: 'Wiedza',
                action: () => { void clientExtension.sendCommand('/wiedza'); },
            },
            {
                label: 'Biblioteki',
                action: () => { void clientExtension.sendCommand('/biblioteki'); },
            },
            {
                label: 'Zioła',
                action: () => { void clientExtension.sendCommand('/ziola'); },
            },
        );
    }
    handler.showContextMenu(items, event.clientX, event.clientY);
});

function selectionWithin(element: HTMLElement, selection: Selection): boolean {
    const { anchorNode, focusNode } = selection;
    if (!anchorNode || !focusNode) {
        return false;
    }
    return element.contains(anchorNode) && element.contains(focusNode);
}

function closeHistoryScrollback(event?: MouseEvent | TouchEvent) {
    if (event instanceof MouseEvent && event.type === 'dblclick') {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selectionWithin(outputWrapper, selection)) {
            return;
        }
    }
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

function updateProgress(p: number, loaded?: number, total?: number) {
    progressContainer.style.display = 'block';
    progressBar.style.width = `${p}%`;
    if (loaded !== undefined && total !== undefined && total > 0) {
        const loadedKb = Math.floor(loaded / 1024);
        const totalKb = Math.ceil(total / 1024);
        progressBar.textContent = `${loadedKb} / ${totalKb} KB`;
    } else {
        progressBar.textContent = `${Math.floor(p)}%`;
    }
}

// Load map data and colors asynchronously
let mapDataPromise = loadMapData(updateProgress);
let colorsPromise = loadColors();

// When both are loaded, dispatch events
Promise.all([mapDataPromise, colorsPromise])
    .then(([mapData, colors]) => {
        console.log('Map data and colors loaded successfully');
        progressContainer.style.display = 'none';
        const {startId, reader, pathFinder} = client.Map.initialize(mapData, colors);
        (window as any).embedded = new EmbeddedMap(reader, pathFinder, startId);
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
    processSticky,
    stickyLines: STICKY_LINES,
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

    if (disconnectButton) {
        disconnectButton.disabled = !isConnected;
    }
}

// Handle client connect event
arkadiaClient.on('client.connect', () => {
    isConnected = true;
    isConnecting = false;
    updateConnectButtons();
    window.clientExtension.sendEvent('refreshPositionWhenAble');
    console.log('Client connected to Arkadia server.');
});

// Handle client disconnect event
arkadiaClient.on('client.disconnect', () => {
    isConnected = false;
    isConnecting = false;
    authClosed = false;
    updateConnectButtons();
    client.println('Rozłączono z serwerem Arkadii.');
    console.log('Client disconnected from Arkadia server.');
});

// Ensure button state is correct when returning to the tab
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && arkadiaClient.isSocketOpen()) {
        isConnected = true;
        updateConnectButtons();
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
    n: { key: 'Numpad8' },
    s: { key: 'Numpad2' },
    w: { key: 'Numpad4' },
    e: { key: 'Numpad6' },
    nw: { key: 'Numpad7' },
    ne: { key: 'Numpad9' },
    sw: { key: 'Numpad1' },
    se: { key: 'Numpad3' },
    u: { key: 'NumpadMultiply' },
    d: { key: 'NumpadSubtract' },
    special: { key: 'Numpad0' },
};

const CONSTANT_DIRECTION_BINDS: DirectionBinding[] = [
    { direction: 'd', code: 'NumpadDivide' },
    { direction: 'zerknij', code: 'Numpad5' },
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
        resolved.push({ direction: 'special', code: 'Numpad0' });
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
            const exits = (window as any).clientExtension?.Map.currentRoom?.specialExits ?? {};
            const first = Object.keys(exits)[0];
            if (first) {
                (window as any).clientExtension.sendCommand(first);
            }
        } else {
            client.sendCommand(binding.direction);
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
    const uiSettingsData = getItemSync('uiSettings');
    let clearInputOnSend = !!uiSettingsData?.uiSettings?.clearInputOnSend;
    client.eventTarget.addEventListener('uiSettings', (ev: Event) => {
        const detail = (ev as CustomEvent).detail;
        if (detail && typeof detail.clearInputOnSend === 'boolean') {
            clearInputOnSend = detail.clearInputOnSend;
        }
    });
    const historyUpButton = document.getElementById('history-up-button') as HTMLButtonElement | null;
    const historyDownButton = document.getElementById('history-down-button') as HTMLButtonElement | null;
    const connectButton = document.getElementById('connect-button') as HTMLButtonElement | null;
    const connectButtonFloat = document.getElementById('connect-button-float') as HTMLButtonElement | null;
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
    const mobileButtonsButton = document.getElementById('mobile-buttons-button') as HTMLButtonElement | null;
    const mobileRadialButton = document.getElementById('mobile-radial-button') as HTMLButtonElement | null;
    const recordingButton = document.getElementById('recording-button') as HTMLButtonElement | null;
    const playbackControls = document.getElementById('playback-controls') as HTMLElement | null;
    const playbackPause = document.getElementById('playback-pause') as HTMLButtonElement | null;
    const playbackStop = document.getElementById('playback-stop') as HTMLButtonElement | null;
    const playbackInfo = document.getElementById('playback-info') as HTMLElement | null;
    const playbackReplay = document.getElementById('playback-replay') as HTMLButtonElement | null;
    const playbackStepBack = document.getElementById('playback-step-back') as HTMLButtonElement | null;
    const playbackStep = document.getElementById('playback-step') as HTMLButtonElement | null;
    const playbackSpeedButtons = playbackControls
        ? Array.from(playbackControls.querySelectorAll<HTMLButtonElement>('[data-playback-speed]'))
        : [];
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
    const mobileRadialModalElement = document.getElementById('mobile-radial-modal');
    const mobileRadialModal = mobileRadialModalElement ? new Modal(mobileRadialModalElement) : null;
    const loginCharacter = document.getElementById('login-character') as HTMLInputElement | null;
    const loginPassword = document.getElementById('login-password') as HTMLInputElement | null;
    const loginForm = document.getElementById('login-form') as HTMLFormElement | null;
    const authClose = document.getElementById('auth-close') as HTMLButtonElement | null;
    const notificationCenter = document.getElementById('notification-center') as HTMLElement | null;
    const enableNotificationsSettings = document.getElementById('ui-enable-notifications') as HTMLButtonElement | null;
    const contentArea = document.getElementById('content-area') as HTMLElement | null;

    if (contentArea) {
        const focusMessageInput = (target: EventTarget | null) => {
            if (!target || !(target instanceof Element)) {
                messageInput.focus();
                return;
            }

            if (target.closest('a, button, input, textarea, select')) {
                return;
            }

            if (document.activeElement !== messageInput) {
                messageInput.focus();
            }
        };

        if (window.PointerEvent) {
            contentArea.addEventListener('pointerdown', (event: PointerEvent) => {
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

    if (disconnectButton) {
        disconnectButton.addEventListener('click', () => {
            if (!isConnected) {
                return;
            }
            isConnecting = false;
            updateConnectButtons();
            arkadiaClient.disconnect();
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

    if (mobileRadialButton && mobileRadialModal) {
        mobileRadialButton.addEventListener('click', () => {
            mobileRadialModal.show();
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

    const updatePlaybackSpeedButtons = (speed: number) => {
        playbackSpeedButtons.forEach(button => {
            const value = Number(button.dataset.playbackSpeed);
            if (Number.isFinite(value) && value > 0 && Math.abs(value - speed) < 0.001) {
                button.classList.add('is-active');
            } else {
                button.classList.remove('is-active');
            }
        });
    };

    playbackSpeedButtons.forEach(button => {
        button.addEventListener('click', () => {
            const value = Number(button.dataset.playbackSpeed);
            if (!Number.isFinite(value) || value <= 0) return;
            arkadiaClient.setPlaybackSpeed(value);
        });
    });

    updatePlaybackSpeedButtons(arkadiaClient.getPlaybackSpeed());

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

    arkadiaClient.on('playback.start', (total: number) => {
        playbackMode = true;
        if (playbackControls) playbackControls.style.display = 'flex';
        if (playbackInfo) playbackInfo.textContent = `0 / ${total}`;
        if (playbackPause) playbackPause.textContent = 'Pause';
        updatePlaybackSpeedButtons(arkadiaClient.getPlaybackSpeed());
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

    arkadiaClient.on('playback.speed', (speed: number) => {
        updatePlaybackSpeedButtons(speed);
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
                if (clearInputOnSend) {
                    messageInput.value = '';
                    if (focus) messageInput.focus();
                } else if (focus) {
                    messageInput.select();
                }
            } else {
                // If we haven't received the first GMCP event yet, clear the input field
                client.sendCommand(message);
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
            void client.prepareSounds();
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
    new TransportTimer(arkadiaClient);
    new LampTimer(arkadiaClient);
    new CoverTimer(arkadiaClient);
    new ZaskTimer(arkadiaClient);
    new CombatTimer(arkadiaClient);
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
    new MobileCommandRadial(client);

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

    const mobileRadialRoot = document.getElementById('mobile-radial-options');
    if (mobileRadialRoot) {
        createRoot(mobileRadialRoot).render(createElement(MobileRadialCommands));
    }

    const herbRoot = document.getElementById('herb-ui-root');
    if (herbRoot) {
        createRoot(herbRoot).render(createElement(HerbManager));
    }

    const knowledgeRoot = document.getElementById('knowledge-root');
    if (knowledgeRoot) {
        createRoot(knowledgeRoot).render(createElement(KnowledgeReport));
    }

    const knowledgeDetailsRoot = document.getElementById('knowledge-details-root');
    if (knowledgeDetailsRoot) {
        createRoot(knowledgeDetailsRoot).render(createElement(KnowledgeDetailsReport));
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
import MobileCommandRadial from "./scripts/mobileCommandRadial"
import initUiSettings from "./uiSettings";
import Client from "@client/src/Client.ts";
import {registerScripts} from "@client/src/main.ts";
