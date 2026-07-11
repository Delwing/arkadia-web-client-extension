import Client from "@client/Client";
import {
    loadSettings as loadMobileButtonSettings,
    Settings,
    defaultBackground,
} from "../mobileButtonSettings";
import type { MobileButtonSetting } from "../buttonSettings";
import { defaultFontColor } from "../buttonSettings";
import {globalStorage} from "@modules/core/storage";
import {getShellSettings, onShellSettingsChange} from "@modules/core/settings";
import {getShortDir} from "@shared/map/directions";
import {
    getButtonMacroDisplayInfo,
    isStatefulMacro
} from "@modules/core/pluginButtonMacroRegistry";
import eventBus from "@modules/core/eventBus";
import { executeMacro as executeSharedMacro, type MacroExecutorCallbacks, MOVE_MODE_LABELS, updateMoveModeLabel } from "./buttonMacroExecutor";

const ORIENTATIONS = ["portrait", "landscape"] as const;
type Orientation = (typeof ORIENTATIONS)[number];
type StoredPosition = {
    x: number;
    y: number;
    origin: "left" | "right";
};
const DEFAULT_ORIGIN: StoredPosition["origin"] = "left";


export default class MobileDirectionButtons {
    private client: Client;
    private readonly container: HTMLDivElement;
    private readonly messageInput: HTMLInputElement | null = null;
    private readonly contentArea: HTMLElement | null = null;
    private readonly zList: HTMLDivElement | null = null;
    private readonly zasList: HTMLDivElement | null = null;
    private readonly wList: HTMLDivElement | null = null;
    private readonly przeList: HTMLDivElement | null = null;
    private readonly idzList: HTMLDivElement | null = null;
    private zToggle: HTMLButtonElement | null = null;
    private zasToggle: HTMLButtonElement | null = null;
    private wToggle: HTMLButtonElement | null = null;
    private przeToggle: HTMLButtonElement | null = null;
    private idzToggle: HTMLButtonElement | null = null;
    private toggleButton: HTMLButtonElement | null = null;
    private enabled = false;
    private isMobile = false;

    // Variables for dragging functionality
    private isDragging = false;
    private longPressTimer: number | null = null;
    private initialX = 0;
    private initialY = 0;
    private currentX = 0;
    private currentY = 0;
    private offsetX = 0;
    private offsetY = 0;
    private isScrolling = false;
    private lastScrollTop = 0;
    private collapsed = false;
    private preCollapseLeft: number | null = null;
    // Hold action tracking
    private buttonPressStart = new Map<string, { time: number; x: number; y: number }>();
    private buttonDragged = new Set<string>();
    private buttonHoldGlowTimers = new Map<string, number>();
    private static readonly HOLD_DURATION = 500;
    private static readonly DRAG_ACTIVATION_DURATION = 1000;
    private static readonly DRAG_MOVE_THRESHOLD = 10;
    private directionButtons: Record<string, HTMLButtonElement | null> = {};
    private allSettings: Settings = {
        solo: {buttons: {}, order: [], cols: 0, background: defaultBackground},
        team: {buttons: {}, order: [], cols: 0, background: defaultBackground},
        leader: {buttons: {}, order: [], cols: 0, background: defaultBackground},
        locked: false,
        radial: {enabled: true, commands: []},
    };
    private buttonSettings: Record<string, MobileButtonSetting> = {};
    private teamMode = false;
    private leaderMode = false;
    private hapticEnabled = true;
    private dragLocked = false;
    private currentOrientation: Orientation = this.getCurrentOrientation();
    private savedPositions: Partial<Record<Orientation, StoredPosition>> = {};
    private viewportBaselineHeights: Partial<Record<Orientation, number>> = {};


    constructor(client: Client) {
        this.client = client;
        this.container = document.getElementById('mobile-direction-buttons') as HTMLDivElement;
        this.messageInput = document.getElementById('message-input') as HTMLInputElement;
        this.contentArea = document.getElementById('main_text_output_msg_wrapper');
        this.zList = document.getElementById('z-buttons-list') as HTMLDivElement;
        this.zasList = document.getElementById('zas-buttons-list') as HTMLDivElement;
        this.wList = document.getElementById('w-buttons-list') as HTMLDivElement;
        this.przeList = document.getElementById('prze-buttons-list') as HTMLDivElement;
        this.idzList = document.getElementById('idz-buttons-list') as HTMLDivElement;
        this.zToggle = document.getElementById('z-list-toggle') as HTMLButtonElement;
        this.zasToggle = document.getElementById('zas-list-toggle') as HTMLButtonElement;
        this.idzToggle = null;
        this.toggleButton = document.getElementById('buttons-toggle') as HTMLButtonElement;

        if (!this.container) {
            console.error('Mobile direction buttons container not found');
            return;
        }

        this.directionButtons = {
            nw: document.getElementById('nw-button') as HTMLButtonElement | null,
            n: document.getElementById('n-button') as HTMLButtonElement | null,
            ne: document.getElementById('ne-button') as HTMLButtonElement | null,
            w: document.getElementById('w-button') as HTMLButtonElement | null,
            e: document.getElementById('e-button') as HTMLButtonElement | null,
            sw: document.getElementById('sw-button') as HTMLButtonElement | null,
            s: document.getElementById('s-button') as HTMLButtonElement | null,
            se: document.getElementById('se-button') as HTMLButtonElement | null,
            u: document.getElementById('u-button') as HTMLButtonElement | null,
            d: document.getElementById('d-button') as HTMLButtonElement | null,
        };
        Object.entries(this.directionButtons).forEach(([dir, btn]) => {
            if (btn) btn.dataset.direction = dir;
        });

        this.allSettings = loadMobileButtonSettings();
        this.dragLocked = !!this.allSettings.locked;
        this.updateDragLock();
        this.updateTeamMode();
        this.setupEventHandlers();
        this.applyActiveSettings();
        this.updateToggleButton();
        this.setupDraggable();
        this.checkMobile();
        this.updateViewportBaseline(true);
        this.setupKeyboardHandlers();

        this.client.on('gmcp.room.info', (detail) => {
            const exits = Array.isArray(detail?.exits) ? detail.exits : [];
            this.highlightExits(exits);
        });

        this.highlightExits([]);

        const updateLists = () => {
            if (this.zList && this.zList.style.display !== 'none') {
                this.renderZList();
            }
            if (this.zasList && this.zasList.style.display !== 'none') {
                this.renderZasList();
            }
            if (this.przeList && this.przeList.style.display !== 'none') {
                this.renderPrzeList();
            }
            if (this.idzList && this.idzList.style.display !== 'none') {
                this.renderIdzList();
            }
        };
        this.client.on('gmcp.objects.nums', () => {
            updateLists();
            this.updateTeamMode();
        });
        this.client.on('gmcp.objects.data', () => {
            updateLists();
            this.updateTeamMode();
        });
        this.client.on('teamChange', () => {
            this.updateTeamMode();
        });

        // Listen for window resize to check if mobile view and keep buttons in bounds
        window.addEventListener('resize', () => {
            this.checkMobile();
            const newOrientation = this.getCurrentOrientation();
            if (newOrientation !== this.currentOrientation) {
                this.currentOrientation = newOrientation;
                this.updateViewportBaseline(true);
                this.applySavedPosition();
            } else {
                this.updateViewportBaseline();
            }
            if (!this.viewportBaselineHeights[this.currentOrientation]) {
                this.updateViewportBaseline(true);
            }
            this.clampToView(true);
            this.scrollToBottom();
        });

        // Listen for plugin button macro state changes to update all buttons
        eventBus.on('pluginButtonMacroStateChanged', () => {
            // Re-apply settings to update all stateful plugin buttons
            Object.keys(this.buttonSettings).forEach(id => {
                const btn = document.getElementById(id) as HTMLButtonElement | null;
                const cfg = this.buttonSettings[id];
                if (btn && cfg && cfg.macroType.startsWith('plugin:') && isStatefulMacro(cfg.macroType)) {
                    this.applyConfigToButton(id, btn);
                }
            });
        });

        // Listen for plugin macro registration to show initial state
        eventBus.on('pluginButtonMacrosChanged', () => {
            // Re-apply settings to update all plugin buttons (in case macro was just registered)
            Object.keys(this.buttonSettings).forEach(id => {
                const btn = document.getElementById(id) as HTMLButtonElement | null;
                const cfg = this.buttonSettings[id];
                if (btn && cfg && cfg.macroType.startsWith('plugin:')) {
                    this.applyConfigToButton(id, btn);
                }
            });
        });

        // Listen for position reset requests from the options UI
        eventBus.on('mobileButtonsResetPosition', () => {
            this.resetPosition();
        });

        // Listen for settings changes. hapticFeedback is a shell setting;
        // showButtons remains stock chrome in uiSettings.
        this.hapticEnabled = getShellSettings().hapticFeedback !== false;
        onShellSettingsChange((shell) => {
            this.hapticEnabled = shell.hapticFeedback !== false;
        });
        globalStorage.onChange('uiSettings', (settings) => {
            if (!settings) {
                return;
            }
            if ("showButtons" in settings) {
                const disabled = settings.showButtons === false;
                if (disabled) {
                    this.disable();
                } else {
                    this.enable();
                }
            }
        });

        this.client.on('mobileButtonsSettings', (settings) => {
            this.buttonSettings = (settings ?? this.buttonSettings) as typeof this.buttonSettings;
            this.toggleButton = document.getElementById('buttons-toggle') as HTMLButtonElement | null;
            this.zToggle = document.getElementById('z-list-toggle') as HTMLButtonElement | null;
            this.zasToggle = document.getElementById('zas-list-toggle') as HTMLButtonElement | null;
            this.wToggle = null;
            this.przeToggle = null;
            this.idzToggle = null;
            this.directionButtons = {
                nw: document.getElementById('nw-button') as HTMLButtonElement | null,
                n: document.getElementById('n-button') as HTMLButtonElement | null,
                ne: document.getElementById('ne-button') as HTMLButtonElement | null,
                w: document.getElementById('w-button') as HTMLButtonElement | null,
                e: document.getElementById('e-button') as HTMLButtonElement | null,
                sw: document.getElementById('sw-button') as HTMLButtonElement | null,
                s: document.getElementById('s-button') as HTMLButtonElement | null,
                se: document.getElementById('se-button') as HTMLButtonElement | null,
                u: document.getElementById('u-button') as HTMLButtonElement | null,
                d: document.getElementById('d-button') as HTMLButtonElement | null,
            };
            this.updateToggleButton();
            this.setupEventHandlers();
            Object.keys(this.buttonSettings).forEach(id => {
                const b = document.getElementById(id) as HTMLButtonElement | null;
                if (b) this.applyConfigToButton(id, b);
            });
            const s = loadMobileButtonSettings();
            this.allSettings = s;
            this.dragLocked = !!s.locked;
            this.updateDragLock();
            this.updateTeamMode();
        });


        // Enable by default for all devices (unless showButtons is explicitly false)
        const uiSettings = globalStorage.get('uiSettings');
        if (!uiSettings || uiSettings.showButtons !== false) {
            this.enable();
        }
    }

    private checkMobile() {
        // Simple mobile detection based on screen width (still needed for other functionality)
        this.isMobile = window.innerWidth < 768;

        // Show buttons if enabled, regardless of device type
        if (this.enabled) {
            this.container.style.display = 'grid';
        } else {
            this.container.style.display = 'none';
        }
    }

    private updateViewportBaseline(force = false) {
        if (!this.isMobile && !force) return;

        const orientation = this.currentOrientation;
        const currentHeight = Math.max(0, window.innerHeight || 0);
        if (currentHeight === 0) return;

        const existingHeight = this.viewportBaselineHeights[orientation];
        if (force || !existingHeight || currentHeight > existingHeight) {
            this.viewportBaselineHeights[orientation] = currentHeight;
        }
    }

    private getViewportHeightForClamp(): number {
        if (!this.isMobile) {
            return window.innerHeight;
        }
        const baselineHeight = this.viewportBaselineHeights[this.currentOrientation];
        if (baselineHeight && baselineHeight > 0) {
            return baselineHeight;
        }
        return window.innerHeight;
    }

    private setupEventHandlers() {


        if (this.toggleButton) {
            this.toggleButton.onclick = () => {
                this.toggleVisibility();
            };
        }

        // Center and special exit buttons configured via settings
    }


    enable() {
        if (this.enabled) return;
        this.enabled = true;
        // Show buttons regardless of device type
        this.container.style.display = 'grid';
        this.clampToView(true);
    }

    disable() {
        if (!this.enabled) return;
        this.enabled = false;
        this.container.style.display = 'none';
    }

    private clampToView(persist = false) {
        const rect = this.container.getBoundingClientRect();
        const fullyOutsideLeft = rect.right <= 0;
        const fullyOutsideRight = rect.left >= window.innerWidth;
        const viewportHeight = this.getViewportHeightForClamp();
        const fullyOutsideTop = rect.bottom <= 0;
        const fullyOutsideBottom = rect.top >= viewportHeight;

        const adjustHorizontal = fullyOutsideLeft || fullyOutsideRight;
        const adjustVertical = fullyOutsideTop || fullyOutsideBottom;

        if (!adjustHorizontal && !adjustVertical) {
            if (persist) {
                this.persistCurrentPosition();
            }
            return;
        }

        let left = parseInt(this.container.style.left, 10);
        let top = parseInt(this.container.style.top, 10);
        if (isNaN(left)) {
            left = rect.left;
        }
        if (isNaN(top)) {
            top = rect.top;
        }

        let clampedLeft = left;
        let clampedTop = top;

        if (adjustHorizontal) {
            const maxLeft = Math.max(5, window.innerWidth - this.container.offsetWidth - 5);
            clampedLeft = Math.min(Math.max(5, left), maxLeft);
        }

        if (adjustVertical) {
            const maxTop = viewportHeight - this.container.offsetHeight - 5;
            clampedTop = Math.min(Math.max(5, top), maxTop);
        }

        const changed = clampedLeft !== left || clampedTop !== top;
        if (changed) {
            this.container.style.left = `${clampedLeft}px`;
            this.container.style.top = `${clampedTop}px`;
        }
        if (persist) {
            this.persistCurrentPosition();
        }
    }

    private setupKeyboardHandlers() {
        if (!this.messageInput || !this.contentArea) return;

        // Scroll to bottom and select text when input is focused (keyboard appears)
        this.messageInput.addEventListener('focusin', () => {
            this.scrollToBottom();
            // Delay selection to avoid mouse click clearing it on some browsers
            setTimeout(() => this.messageInput!.select());

            // Add a small delay to ensure scrolling happens after keyboard appears
            setTimeout(() => this.scrollToBottom(), 300);
        });

        // Also listen for input events which can happen when keyboard is already shown
        this.messageInput.addEventListener('input', () => {
            this.scrollToBottom();
        });

        // Use VisualViewport API if available (modern browsers)
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                this.scrollToBottom();
            });
        }
    }

    private setupDraggable() {
        if (!this.container || !this.contentArea) return;

        // Prevent native context menu on long press which breaks dragging
        this.container.addEventListener('contextmenu', (e) => e.preventDefault());

        // Set initial position from storage if available
        this.container.style.removeProperty('right');

        const savedPosition = globalStorage.get('mobileButtonsPosition');
        if (savedPosition) {
            try {
                this.savedPositions = this.normalizeSavedPositions(savedPosition);
            } catch (e) {
                console.error('Error parsing saved position:', e);
                this.savedPositions = {};
            }
        }
        this.currentOrientation = this.getCurrentOrientation();
        this.applySavedPosition();
        requestAnimationFrame(() => this.clampToView(true));
        // Add touch event listeners for long press and drag
        this.container.addEventListener('touchstart', this.handleTouchStart.bind(this), {passive: false});
        this.container.addEventListener('touchmove', this.handleTouchMove.bind(this), {passive: false});
        this.container.addEventListener('touchend', this.handleTouchEnd.bind(this));
        this.container.addEventListener('touchcancel', this.handleTouchEnd.bind(this));

        // Add mouse event listeners for desktop testing
        this.container.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));

        // Add scroll detection
        this.lastScrollTop = this.contentArea.scrollTop;
        this.contentArea.addEventListener('scroll', () => {
            // Detect if user is scrolling
            const currentScrollTop = this.contentArea.scrollTop;
            if (Math.abs(currentScrollTop - this.lastScrollTop) > 5) {
                this.isScrolling = true;

                // Clear any existing long press timer
                if (this.longPressTimer) {
                    clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                }

                // Reset scrolling flag after a short delay
                setTimeout(() => {
                    this.isScrolling = false;
                }, 100);
            }
            this.lastScrollTop = currentScrollTop;
        });
    }

    private getCurrentOrientation(): Orientation {
        if (window.matchMedia) {
            if (window.matchMedia('(orientation: portrait)').matches) {
                return 'portrait';
            }
            if (window.matchMedia('(orientation: landscape)').matches) {
                return 'landscape';
            }
        }
        return window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape';
    }

    private getAlternateOrientation(orientation: Orientation): Orientation {
        return orientation === 'portrait' ? 'landscape' : 'portrait';
    }

    private sanitizePosition(raw: unknown): StoredPosition | null {
        if (!raw || typeof raw !== 'object') return null;
        const candidate = raw as Partial<StoredPosition>;
        const x = Number(candidate?.x);
        const y = Number(candidate?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const origin = candidate?.origin === 'right' ? 'right' : DEFAULT_ORIGIN;
        return {x, y, origin};
    }

    private normalizeSavedPositions(raw: unknown): Partial<Record<Orientation, StoredPosition>> {
        const positions: Partial<Record<Orientation, StoredPosition>> = {};
        if (!raw || typeof raw !== 'object') return positions;
        const source = raw as Record<string, unknown>;
        let hasOrientationSpecific = false;
        ORIENTATIONS.forEach(orientation => {
            const sanitized = this.sanitizePosition(source[orientation]);
            if (sanitized) {
                positions[orientation] = sanitized;
                hasOrientationSpecific = true;
            }
        });
        if (hasOrientationSpecific) {
            return positions;
        }
        const fallback = this.sanitizePosition(source);
        if (fallback) {
            ORIENTATIONS.forEach(orientation => {
                positions[orientation] = {...fallback};
            });
        }
        return positions;
    }

    private applySavedPosition() {
        if (!this.container) return;
        this.container.style.removeProperty('right');
        const saved = this.savedPositions[this.currentOrientation]
            || this.savedPositions[this.getAlternateOrientation(this.currentOrientation)];
        if (!saved) {
            return;
        }
        const rect = this.container.getBoundingClientRect();
        const width = rect.width || this.container.offsetWidth;
        const safeWidth = Number.isFinite(width) ? width : 0;
        let left = saved.x;
        if (saved.origin === 'right') {
            const fromLeft = window.innerWidth - safeWidth - saved.x;
            if (Number.isFinite(fromLeft)) {
                left = fromLeft;
            }
        }
        this.container.style.left = `${left}px`;
        this.container.style.top = `${saved.y}px`;
    }

    public resetPosition(): void {
        if (!this.container) return;
        this.savedPositions = {};
        globalStorage.remove('mobileButtonsPosition');
        this.container.style.removeProperty('left');
        this.container.style.removeProperty('top');
        this.container.style.removeProperty('right');
        this.preCollapseLeft = null;
        requestAnimationFrame(() => this.clampToView(false));
    }

    private positionsEqual(a?: StoredPosition | null, b?: StoredPosition | null): boolean {
        if (!a || !b) return false;
        return a.x === b.x && a.y === b.y && a.origin === b.origin;
    }

    private persistCurrentPosition(): void {
        if (!this.container) return;
        const rect = this.container.getBoundingClientRect();
        const position: StoredPosition = {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            origin: DEFAULT_ORIGIN,
        };
        const existing = this.savedPositions[this.currentOrientation];
        if (this.positionsEqual(existing ?? null, position)) {
            return;
        }
        this.savedPositions = {
            ...this.savedPositions,
            [this.currentOrientation]: position,
        };
        const toStore: Partial<Record<Orientation, StoredPosition>> = {};
        ORIENTATIONS.forEach(orientation => {
            const value = this.savedPositions[orientation];
            if (value) {
                toStore[orientation] = value;
            }
        });
        globalStorage.set('mobileButtonsPosition', toStore);
    }

    private updateDragLock() {
        if (!this.container) return;
        if (this.dragLocked) {
            this.container.classList.add('drag-locked');
            this.container.setAttribute('data-drag-locked', 'true');
        } else {
            this.container.classList.remove('drag-locked');
            this.container.removeAttribute('data-drag-locked');
        }
    }

    private dragStart(x: number, y: number, preventDefault?: () => void) {
        if (!this.container || this.dragLocked) return;

        if (this.isScrolling) return;

        this.initialX = x;
        this.initialY = y;

        this.longPressTimer = window.setTimeout(() => {
            if (preventDefault) preventDefault();

            this.isDragging = true;
            this.container.classList.add('dragging');

            const rect = this.container.getBoundingClientRect();
            this.offsetX = rect.left;
            this.offsetY = rect.top;

            this.container.style.opacity = '0.8';

            const buttons = this.container.querySelectorAll('button');
            buttons.forEach(button => {
                button.classList.add('no-click');
            });
        }, MobileDirectionButtons.DRAG_ACTIVATION_DURATION);
    }

    private dragMove(x: number, y: number) {
        if (!this.isDragging || !this.container) return;

        this.currentX = x;
        this.currentY = y;

        const deltaX = this.currentX - this.initialX;
        const deltaY = this.currentY - this.initialY;

        const newLeft = this.offsetX + deltaX;
        const newTop = this.offsetY + deltaY;

        const maxLeft = Math.max(5, window.innerWidth - this.container.offsetWidth - 5);
        const clampedLeft = Math.min(maxLeft, Math.max(5, newLeft));
        const clampedTop = Math.max(5, newTop);

        this.container.style.left = `${clampedLeft}px`;
        this.container.style.top = `${clampedTop}px`;
    }

    private dragEnd(preventDefault?: () => void) {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        if (this.isDragging && this.container) {
            this.isDragging = false;
            this.container.classList.remove('dragging');
            this.container.style.opacity = '1';

            const buttons = this.container.querySelectorAll('button');
            buttons.forEach(button => {
                button.classList.remove('no-click');
            });

            if (preventDefault) preventDefault();
            this.clampToView(true);
        }
    }

    private handleTouchStart(e: TouchEvent) {
        if (this.dragLocked) return;
        const touch = e.touches[0];
        this.dragStart(touch.clientX, touch.clientY, () => e.preventDefault());
    }

    private handleTouchMove(e: TouchEvent) {
        if (this.dragLocked) return;
        e.preventDefault();
        const touch = e.touches[0];
        this.dragMove(touch.clientX, touch.clientY);
    }

    private handleTouchEnd(e: TouchEvent) {
        if (this.dragLocked) return;
        this.dragEnd(() => e.preventDefault());
    }

    private handleMouseDown(e: MouseEvent) {
        if (this.dragLocked) return;
        if (e.button !== 0) return;
        this.dragStart(e.clientX, e.clientY);
    }

    private handleMouseMove(e: MouseEvent) {
        if (this.dragLocked) return;
        this.dragMove(e.clientX, e.clientY);
    }

    private handleMouseUp(e: MouseEvent) {
        if (this.dragLocked) return;
        this.dragEnd(() => e.preventDefault());
    }

    private scrollToBottom() {
        if (!this.contentArea || !this.isMobile) return;

        // Scroll to bottom with a small delay to ensure it happens after layout changes
        setTimeout(() => {
            if (this.contentArea) {
                this.contentArea.scrollTop = this.contentArea.scrollHeight;
            }
        }, 100);
    }

    private hideLists() {
        if (this.zList) this.zList.style.display = 'none';
        if (this.zasList) this.zasList.style.display = 'none';
        if (this.wList) this.wList.style.display = 'none';
        if (this.przeList) this.przeList.style.display = 'none';
        if (this.idzList) this.idzList.style.display = 'none';
        if (this.zToggle) this.zToggle.classList.remove('active');
        if (this.zasToggle) this.zasToggle.classList.remove('active');
        if (this.wToggle) this.wToggle.classList.remove('active');
        if (this.przeToggle) this.przeToggle.classList.remove('active');
        if (this.idzToggle) this.idzToggle.classList.remove('active');
    }

    private applyButtonSize(btn: HTMLButtonElement) {
        const ref = this.container.querySelector('.mobile-button') as HTMLButtonElement | null;
        if (ref) {
            const styles = window.getComputedStyle(ref);
            btn.style.width = styles.width;
            btn.style.height = styles.height;
            btn.style.fontSize = styles.fontSize;
        }
    }


    private updateToggleButton() {
        if (!this.toggleButton) return;
        this.toggleButton.textContent = this.collapsed ? '⇧' : '⇩';
    }

    private toggleVisibility() {
        if (!this.container) return;

        const toggleBtn = this.toggleButton;
        const toggleScreenX = toggleBtn?.getBoundingClientRect().left;

        this.collapsed = !this.collapsed;

        if (this.collapsed) {
            this.preCollapseLeft = this.container.getBoundingClientRect().left;
            this.container.classList.add('collapsed');

            // Shift container so the toggle button stays at the same screen X
            if (toggleBtn && toggleScreenX !== undefined) {
                const newToggleX = toggleBtn.getBoundingClientRect().left;
                const delta = toggleScreenX - newToggleX;
                if (delta !== 0) {
                    const left = this.container.getBoundingClientRect().left;
                    this.container.style.left = `${left + delta}px`;
                }
            }
            this.clampToView();
        } else {
            this.container.classList.remove('collapsed');
            // Restore original container position
            if (this.preCollapseLeft !== null) {
                this.container.style.left = `${this.preCollapseLeft}px`;
                this.preCollapseLeft = null;
            }
            this.clampToView();
        }
        this.updateToggleButton();
    }

    private highlightExits(exits: string[]) {
        const available = new Set(exits.map((e) => getShortDir(e)));

        const buttons = this.container.querySelectorAll<HTMLButtonElement>(
            'button[data-direction]'
        );
        buttons.forEach(btn => {
            const dir = btn.dataset.direction || '';
            if (available.has(dir)) {
                btn.classList.add('exit-available');
            } else {
                btn.classList.remove('exit-available');
            }
        });
    }

    private renderList(target: HTMLDivElement | null, regex: RegExp, prefix: string) {
        if (!target) return;
        target.innerHTML = '';
        const objects = this.client.ObjectManager?.getObjectsOnLocation?.() || [];
        const values = Array.from(new Set(objects
            .filter((o: any) => regex.test(o.shortcut))
            .map((o: any) => o.shortcut)));
        values.forEach((v: string) => {
            const b = document.createElement('button');
            b.className = 'mobile-button';
            this.applyButtonSize(b);
            b.textContent = v;
            b.addEventListener('click', () => {
                this.client.sendCommand(`/${prefix} ${v}`);
            });
            target.appendChild(b);
        });
    }

    private renderZList() {
        this.renderList(this.zList, /^[0-9]+$/, 'z');
    }

    private renderZasList() {
        this.renderList(this.zasList, /^[A-Z]$/, 'zas');
    }

    private renderWList() {
        this.renderList(this.wList, /^[A-Z]$/, 'w');
    }

    private renderPrzeList() {
        this.renderList(this.przeList, /^[0-9]+$/, 'prze');
    }

    private renderIdzList() {
        if (!this.idzList) return;
        this.idzList.innerHTML = '';
        const cmds = [
            {label: 'idz niespiesznie', cmd: 'idz niespiesznie'},
            {label: 'idz marszem', cmd: 'idz marszem'},
            {label: 'idz truchtem', cmd: 'idz truchtem'},
            {label: 'idz biegiem', cmd: 'idz biegiem'},
            {label: 'idz s. biegiem', cmd: 'idz szybkim biegiem'},
        ];
        cmds.forEach(c => {
            const b = document.createElement('button');
            b.className = 'mobile-button';
            this.applyButtonSize(b);
            b.style.width = '72px';
            b.textContent = c.label;
            b.addEventListener('click', () => this.client.sendCommand(c.cmd));
            this.idzList!.appendChild(b);
        });
    }

    private updateTeamMode() {
        const leader = !!this.client.TeamManager.isLeader?.();
        const team = leader || !!this.client.TeamManager.isInAnyTeam?.();
        if (team !== this.teamMode || leader !== this.leaderMode) {
            this.teamMode = team;
            this.leaderMode = leader;
            this.applyActiveSettings();
        }
    }

    private applyActiveSettings() {
        const set = this.leaderMode ? this.allSettings.leader : this.teamMode ? this.allSettings.team : this.allSettings.solo;
        this.dragLocked = !!this.allSettings.locked;
        this.updateDragLock();
        this.buttonSettings = set.buttons;
        Object.keys(this.buttonSettings).forEach(id => {
            const btn = document.getElementById(id) as HTMLButtonElement | null;
            if (btn) this.applyConfigToButton(id, btn);
        });
    }

    private applyConfigToButton(id: string, btn: HTMLButtonElement) {
        const cfg = this.buttonSettings[id];
        if (!cfg) return;

        // Handle color syncing for special exit buttons
        let effectiveColor = cfg.color;
        let effectiveActiveColor = cfg.activeColor;
        let effectiveLabel = cfg.label;

        if (cfg.macroType === 'specialExit' && cfg.syncWithDirections) {
            // Find a direction button to sync colors from
            const directionButton = Object.values(this.buttonSettings).find(b => b.macroType === 'kierunek');
            if (directionButton) {
                effectiveColor = directionButton.color;
                effectiveActiveColor = directionButton.activeColor || '#2fa7c5';
            }
        }

        // Handle stateful plugin macros
        if (cfg.macroType.startsWith('plugin:') && isStatefulMacro(cfg.macroType)) {
            // Pass custom state overrides from pluginConfig if user customized them
            const customOverrides = {
                labels: cfg.pluginConfig?.stateLabels as Record<string, string> | undefined,
                colors: cfg.pluginConfig?.stateColors as Record<string, string> | undefined
            };
            const displayInfo = getButtonMacroDisplayInfo(cfg.macroType, customOverrides);
            if (displayInfo) {
                // Combine user label with state label: "userLabel stateLabel"
                if (displayInfo.stateLabel) {
                    effectiveLabel = cfg.label
                        ? `${cfg.label} ${displayInfo.stateLabel}`
                        : displayInfo.stateLabel;
                }
                if (displayInfo.color) effectiveColor = displayInfo.color;
            }
        }

        const isEmpty = cfg.macroType === 'empty' || !effectiveLabel;
        btn.textContent = isEmpty ? '' : effectiveLabel;
        if (isEmpty) {
            btn.classList.add('empty');
            btn.style.backgroundColor = 'transparent';
            btn.style.border = 'none';
            btn.style.color = '';
            btn.style.removeProperty('--color');
            btn.style.removeProperty('--active-color');
        } else {
            btn.classList.remove('empty');
            btn.style.backgroundColor = effectiveColor;
            btn.style.border = '';
            btn.style.color = cfg.fontColor || defaultFontColor;
            if (cfg.macroType === 'kierunek' || (cfg.macroType === 'specialExit' && (effectiveActiveColor || cfg.syncWithDirections))) {
                btn.style.setProperty('--color', effectiveColor);
                btn.style.setProperty('--active-color', effectiveActiveColor || '#2fa7c5');
            } else {
                btn.style.removeProperty('--color');
                btn.style.removeProperty('--active-color');
            }
        }
        const clone = btn.cloneNode(true) as HTMLButtonElement;
        btn.replaceWith(clone);
        const newBtn = clone;
        this.applyButtonSize(newBtn);
        if (id === 'buttons-toggle') {
            this.toggleButton = newBtn;
            this.updateToggleButton();
        }
        if (id === 'z-list-toggle') this.zToggle = newBtn;
        if (id === 'zas-list-toggle') this.zasToggle = newBtn;
        if (cfg.macroType === 'wList') {
            this.wToggle = newBtn;
        } else if (this.wToggle === newBtn) {
            this.wToggle = null;
        }
        if (cfg.macroType === 'idzList') {
            this.idzToggle = newBtn;
        } else if (this.idzToggle === newBtn) {
            this.idzToggle = null;
        }
        if (cfg.macroType === 'przeList') {
            this.przeToggle = newBtn;
        } else if (this.przeToggle === newBtn) {
            this.przeToggle = null;
        }
        if (id.endsWith('-button')) {
            const dirKey = id.replace('-button', '');
            if (Object.prototype.hasOwnProperty.call(this.directionButtons, dirKey)) {
                this.directionButtons[dirKey] = newBtn;
                newBtn.dataset.direction = dirKey;
            }
        }
        if (cfg.macroType === 'kierunek' && cfg.direction) {
            newBtn.dataset.direction = getShortDir(cfg.direction);
        } else if (!newBtn.dataset.direction) {
            newBtn.removeAttribute('data-direction');
        }

        // Hold action support - macro executes on release, duration determines tap vs hold
        if (cfg.holdEnabled && cfg.hold?.macroType) {
            const hold = cfg.hold;

            const onPointerDown = (e: PointerEvent) => {
                if (this.isDragging) return;
                // Record press start time and position
                this.buttonPressStart.set(id, { time: Date.now(), x: e.clientX, y: e.clientY });
                this.buttonDragged.delete(id);

                // Clear any existing glow timer
                const existingGlowTimer = this.buttonHoldGlowTimers.get(id);
                if (existingGlowTimer) clearTimeout(existingGlowTimer);

                // Start glow timer - add glow class when hold threshold is reached
                const glowTimer = window.setTimeout(() => {
                    // Set glow color based on button's background color
                    const bgColor = window.getComputedStyle(newBtn).backgroundColor;
                    const rgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                    if (rgbaMatch) {
                        const [, r, g, b] = rgbaMatch;
                        newBtn.style.setProperty('--hold-glow-color', `rgba(${r}, ${g}, ${b}, 0.7)`);
                    }
                    newBtn.classList.add('hold-glow');
                    if (this.hapticEnabled) navigator.vibrate?.([50, 30, 50]); // Haptic feedback when hold activates
                }, MobileDirectionButtons.HOLD_DURATION);
                this.buttonHoldGlowTimers.set(id, glowTimer);
            };

            const onPointerMove = (e: PointerEvent) => {
                const pressStart = this.buttonPressStart.get(id);
                if (!pressStart) return;

                const elapsed = Date.now() - pressStart.time;
                const dx = Math.abs(e.clientX - pressStart.x);
                const dy = Math.abs(e.clientY - pressStart.y);
                const moved = dx > MobileDirectionButtons.DRAG_MOVE_THRESHOLD || dy > MobileDirectionButtons.DRAG_MOVE_THRESHOLD;

                // Only mark as dragged if moved significantly AND after drag activation duration AND buttons unlocked
                if (moved && elapsed > MobileDirectionButtons.DRAG_ACTIVATION_DURATION && !this.dragLocked) {
                    this.buttonDragged.add(id);
                    // Cancel glow when dragging
                    const glowTimer = this.buttonHoldGlowTimers.get(id);
                    if (glowTimer) {
                        clearTimeout(glowTimer);
                        this.buttonHoldGlowTimers.delete(id);
                    }
                    newBtn.classList.remove('hold-glow');
                    newBtn.style.removeProperty('--hold-glow-color');
                }
            };

            const onPointerUp = () => {
                // Clear glow timer and remove glow class
                const glowTimer = this.buttonHoldGlowTimers.get(id);
                if (glowTimer) {
                    clearTimeout(glowTimer);
                    this.buttonHoldGlowTimers.delete(id);
                }
                newBtn.classList.remove('hold-glow');
                newBtn.style.removeProperty('--hold-glow-color');

                const pressStart = this.buttonPressStart.get(id);
                this.buttonPressStart.delete(id);

                // If dragged, don't execute any macro
                if (this.buttonDragged.has(id)) {
                    this.buttonDragged.delete(id);
                    return;
                }

                if (!pressStart) return;

                const elapsed = Date.now() - pressStart.time;

                if (elapsed >= MobileDirectionButtons.HOLD_DURATION) {
                    // Execute hold action (haptic already done when glow activated)
                    const holdCfg: MobileButtonSetting = {
                        ...cfg,
                        macroType: hold.macroType,
                        command: hold.command,
                        direction: hold.direction,
                        enemySlot: hold.enemySlot,
                        pluginConfig: hold.pluginConfig,
                        steps: hold.steps,
                    };
                    executeSharedMacro(this.client, hold.macroType, holdCfg, this.getCallbacks(newBtn), newBtn);
                } else {
                    // Execute tap action
                    if (this.hapticEnabled) navigator.vibrate?.(20);
                    executeSharedMacro(this.client, cfg.macroType, cfg, this.getCallbacks(newBtn), newBtn);
                }
            };

            const onPointerCancel = () => {
                // Clear glow timer and remove glow class
                const glowTimer = this.buttonHoldGlowTimers.get(id);
                if (glowTimer) {
                    clearTimeout(glowTimer);
                    this.buttonHoldGlowTimers.delete(id);
                }
                newBtn.classList.remove('hold-glow');
                newBtn.style.removeProperty('--hold-glow-color');
                this.buttonPressStart.delete(id);
                this.buttonDragged.delete(id);
            };

            newBtn.addEventListener('pointerdown', onPointerDown);
            newBtn.addEventListener('pointermove', onPointerMove);
            newBtn.addEventListener('pointerup', onPointerUp);
            newBtn.addEventListener('pointercancel', onPointerCancel);
            newBtn.addEventListener('pointerleave', onPointerCancel);
        } else {
            // Standard click handler (no hold)
            const handler = () => {
                if (this.hapticEnabled) navigator.vibrate?.(20);
                executeSharedMacro(this.client, cfg.macroType, cfg, this.getCallbacks(newBtn), newBtn);
            };
            newBtn.addEventListener('click', handler);
        }

        if (cfg.macroType === 'moveMode') {
            this.client.moveModeButton = newBtn;
            newBtn.dataset.moveModeLabel = cfg.label || '';
            this.updateMoveModeButton(newBtn);
            newBtn.disabled = this.client.carriageMode;
        } else if (cfg.macroType === 'specialExit') {
            // Add direction-button class if activeColor is supported
                newBtn.classList.add('direction-button');
                newBtn.classList.add('mobile-button-text');

            const updateLabel = () => {
                const specialExits = this.client.Map.currentRoom?.specialExits ?? {};
                const firstExit = Object.keys(specialExits)[0];
                if (firstExit) {
                    newBtn.textContent = firstExit.length > 5 ? firstExit.slice(0, 4) + '…' : firstExit;
                    newBtn.title = firstExit;
                    newBtn.dataset.direction = firstExit;
                    // Add exit-available class when special exit exists
                    if (effectiveActiveColor || cfg.syncWithDirections) {
                        newBtn.classList.add('exit-available');
                    }
                } else {
                    newBtn.textContent = cfg.label;
                    newBtn.title = '';
                    newBtn.dataset.direction = cfg.label;
                    // Remove exit-available class when no special exit
                    newBtn.classList.remove('exit-available');
                }
            };
            this.client.on('enterLocation', () => updateLabel());
            updateLabel();
        }
    }

    private getMoveModeOptionsCount() {
        return this.leaderMode ? MOVE_MODE_LABELS.length : Math.max(1, MOVE_MODE_LABELS.length - 1);
    }

    private updateMoveModeButton(button: HTMLButtonElement, mode: number = this.client.moveMode) {
        const options = this.getMoveModeOptionsCount();
        const maxIndex = Math.max(0, options - 1);
        const safeMode = Math.max(0, Math.min(mode, maxIndex));
        if (safeMode !== this.client.moveMode) {
            this.client.moveMode = safeMode;
            this.client.sendEvent('moveModeChanged', this.client.moveMode);
        }
        updateMoveModeLabel(button, safeMode);
    }

    private getCallbacks(btn?: HTMLButtonElement): MacroExecutorCallbacks {
        return {
            toggleList: (macroType: string) => {
                this.toggleMobileList(macroType, btn);
            },
            toggleVisibility: () => this.toggleVisibility(),
            updateMoveModeButton: (b: HTMLButtonElement) => this.updateMoveModeButton(b),
        };
    }

    private toggleMobileList(macroType: string, btn?: HTMLButtonElement) {
        const listMap: Record<string, { list: HTMLDivElement | null; render: () => void }> = {
            zList: { list: this.zList, render: () => this.renderZList() },
            zaList: { list: this.zasList, render: () => this.renderZasList() },
            wList: { list: this.wList, render: () => this.renderWList() },
            przeList: { list: this.przeList, render: () => this.renderPrzeList() },
            idzList: { list: this.idzList, render: () => this.renderIdzList() },
        };
        const entry = listMap[macroType];
        if (!entry) return;
        if (entry.list && entry.list.style.display === 'grid') {
            this.hideLists();
        } else {
            this.hideLists();
            entry.render();
            if (entry.list) entry.list.style.display = 'grid';
            btn?.classList.add('active');
        }
    }

}
