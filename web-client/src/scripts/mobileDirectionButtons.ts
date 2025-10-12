import Client from "@client/src/Client";
import { formatLabel } from "@client/src/scripts/functionalBind";
import {
    loadSettings as loadMobileButtonSettings,
    ButtonSetting,
    Settings,
    defaultFontColor,
    defaultBackground,
} from "../mobileButtonSettings";
import { getItemSync, setItemSync } from "@client/src/storage";
import { getShortDir } from "@client/src/utils/directions.ts";
import type { CommandDispatcher } from "@client/src/runtime/command-dispatcher";
import { uiStore, selectNearbyObjects, selectTeamStatus } from "../ui/store";
import type { NearbyObject, TeamStatus } from "../ui/store";

const MOVE_MODE_LABELS = ["zwykly", "prz", "prz dr"];
const MOVE_MODE_TITLES = ["zwykly", "przemknij", "przemknij z druzyna"];

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
    private bracketRightButton: HTMLButtonElement | null = null;
    private toggleButton: HTMLButtonElement | null = null;
    private boundKey = 'BracketRight';
    private boundCtrl = false;
    private boundAlt = false;
    private boundShift = false;
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
    private directionButtons: Record<string, HTMLButtonElement | null> = {};
    private allSettings: Settings = {
        solo: { buttons: {}, order: [], cols: 0, background: defaultBackground },
        team: { buttons: {}, order: [], cols: 0, background: defaultBackground },
        leader: { buttons: {}, order: [], cols: 0, background: defaultBackground },
        locked: false,
    };
    private buttonSettings: Record<string, ButtonSetting> = {};
    private teamMode = false;
    private leaderMode = false;
    private hapticEnabled = true;
    private dragLocked = false;
    private dispatcher: CommandDispatcher | null;
    private unsubscribeObjects: (() => void) | null = null;
    private unsubscribeTeam: (() => void) | null = null;
    private nearbyObjects: readonly NearbyObject[] = [];
    private teamStatus: TeamStatus = { inTeam: false, isLeader: false };


    constructor(client: Client, dispatcher: CommandDispatcher | null = null) {
        this.client = client;
        this.dispatcher = dispatcher ?? uiStore.getState().commandDispatcher;
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
        this.bracketRightButton = document.getElementById('bracket-right-button') as HTMLButtonElement;
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

        this.nearbyObjects = uiStore.getState().nearbyObjects;
        this.teamStatus = uiStore.getState().teamStatus;
        this.unsubscribeObjects = uiStore.subscribe(selectNearbyObjects, (objects) => {
            this.nearbyObjects = objects;
            this.refreshVisibleLists();
        });
        this.unsubscribeTeam = uiStore.subscribe(selectTeamStatus, (status) => {
            this.teamStatus = status;
            this.applyTeamStatus(status);
        });
        // Subscriptions are allowed to live for the lifetime of the page; the
        // host runtime resets on navigation, so there is nothing to clean up on
        // unload.

        loadMobileButtonSettings().then(settings => {
            this.allSettings = settings;
            this.dragLocked = !!settings.locked;
            this.updateDragLock();
            this.applyTeamStatus(this.teamStatus, { forceApply: true });
            this.setupEventHandlers();
        });
        this.updateBracketRightButton();
        this.updateToggleButton();
        this.setupDraggable();
        this.checkMobile();
        this.setupKeyboardHandlers();

        this.client.addEventListener('gmcp.room.info', (ev: CustomEvent) => {
            const exits = Array.isArray(ev.detail?.exits) ? ev.detail.exits : [];
            this.highlightExits(exits);
        });

        this.highlightExits([]);

        // Listen for window resize to check if mobile view
        window.addEventListener('resize', () => {
            this.checkMobile();
            this.scrollToBottom();
        });

        // Listen for UI settings changes
        this.client.addEventListener("uiSettings", (event: CustomEvent) => {
            const detail = event.detail || {};
            if (Object.prototype.hasOwnProperty.call(detail, "hapticFeedback")) {
                this.hapticEnabled = detail.hapticFeedback !== false;
            }
            if (Object.prototype.hasOwnProperty.call(detail, "mobileDirectionButtons")) {
                const disabled = detail.mobileDirectionButtons === false;
                if (disabled) {
                    this.disable();
                } else {
                    this.enable();
                }
            }
        });

        this.client.addEventListener('mobileButtonsSettings', (ev: CustomEvent) => {
            this.buttonSettings = ev.detail || this.buttonSettings;
            this.toggleButton = document.getElementById('buttons-toggle') as HTMLButtonElement | null;
            this.bracketRightButton = document.getElementById('bracket-right-button') as HTMLButtonElement | null;
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
            this.refreshVisibleLists();
            loadMobileButtonSettings().then(s => {
                this.allSettings = s;
                this.dragLocked = !!s.locked;
                this.updateDragLock();
                this.applyTeamStatus(this.teamStatus, { forceApply: true });
            });
        });

        // Listen for bind settings changes
        this.client.addEventListener('settings', (ev: CustomEvent) => {
            const bind = ev.detail?.binds?.main;
            if (bind) {
                this.boundKey = bind.key;
                this.boundCtrl = !!bind.ctrl;
                this.boundAlt = !!bind.alt;
                this.boundShift = !!bind.shift;
                this.updateBracketRightButton();
            }
        });

        // Enable by default for all devices
        this.enable();
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
        this.clampToView();
    }

    disable() {
        if (!this.enabled) return;
        this.enabled = false;
        this.container.style.display = 'none';
    }

    private clampToView() {
        const rect = this.container.getBoundingClientRect();
        let left = parseInt(this.container.style.left, 10);
        let top = parseInt(this.container.style.top, 10);
        if (isNaN(left)) {
            left = rect.left;
        }
        if (isNaN(top)) {
            top = rect.top;
        }
        const maxLeft = Math.max(5, window.innerWidth - this.container.offsetWidth - 5);
        const maxTop = window.innerHeight - this.container.offsetHeight - 5;
        const clampedLeft = Math.min(Math.max(5, left), maxLeft);
        const clampedTop = Math.min(Math.max(5, top), maxTop);
        this.container.style.left = `${clampedLeft}px`;
        this.container.style.top = `${clampedTop}px`;
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

        const savedData = getItemSync('mobileButtonsPosition');
        const savedPosition = savedData?.mobileButtonsPosition;
        if (savedPosition) {
            try {
                const { x, y, origin } = savedPosition as any;
                const rect = this.container.getBoundingClientRect();
                const width = rect.width || this.container.offsetWidth;
                const safeWidth = Number.isFinite(width) ? width : 0;
                if (typeof x === 'number' && !Number.isNaN(x)) {
                    if (origin === 'left') {
                        this.container.style.left = `${x}px`;
                    } else {
                        const fromLeft = window.innerWidth - safeWidth - x;
                        if (Number.isFinite(fromLeft)) {
                            this.container.style.left = `${fromLeft}px`;
                        }
                    }
                }
                if (typeof y === 'number' && !Number.isNaN(y)) {
                    this.container.style.top = `${y}px`;
                }
                this.container.style.removeProperty('right');
                requestAnimationFrame(() => this.clampToView());
            } catch (e) {
                console.error('Error parsing saved position:', e);
            }
        }
        // Add touch event listeners for long press and drag
        this.container.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.container.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
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
        }, 500);
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
            const rect = this.container.getBoundingClientRect();
            const position = {
                x: rect.left,
                y: rect.top,
                origin: 'left' as const,
            };
            setItemSync('mobileButtonsPosition', position);

            this.isDragging = false;
            this.container.classList.remove('dragging');
            this.container.style.opacity = '1';

            const buttons = this.container.querySelectorAll('button');
            buttons.forEach(button => {
                button.classList.remove('no-click');
            });

            if (preventDefault) preventDefault();
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

    private updateBracketRightButton() {
        if (!this.bracketRightButton) return;
        this.bracketRightButton.textContent = formatLabel({
            key: this.boundKey,
            ctrl: this.boundCtrl,
            alt: this.boundAlt,
            shift: this.boundShift,
        });
    }

    private updateToggleButton() {
        if (!this.toggleButton) return;
        this.toggleButton.textContent = this.collapsed ? '⇧' : '⇩';
    }

    private toggleVisibility() {
        if (!this.container) return;
        this.collapsed = !this.collapsed;
        if (this.collapsed) {
            this.container.classList.add('collapsed');
        } else {
            this.container.classList.remove('collapsed');
        }
        this.updateToggleButton();
    }

    private refreshVisibleLists() {
        if (this.zList && this.zList.style.display !== 'none') {
            this.renderZList();
        }
        if (this.zasList && this.zasList.style.display !== 'none') {
            this.renderZasList();
        }
        if (this.wList && this.wList.style.display !== 'none') {
            this.renderWList();
        }
        if (this.przeList && this.przeList.style.display !== 'none') {
            this.renderPrzeList();
        }
        if (this.idzList && this.idzList.style.display !== 'none') {
            this.renderIdzList();
        }
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
        const values = Array.from(
            new Set(
                this.nearbyObjects
                    .filter((obj) => typeof obj.shortcut === 'string' && regex.test(obj.shortcut))
                    .map((obj) => obj.shortcut as string)
            )
        );
        values.forEach((v: string) => {
            const b = document.createElement('button');
            b.className = 'mobile-button';
            this.applyButtonSize(b);
            b.textContent = v;
            b.addEventListener('click', () => {
                this.sendCommand(`/${prefix} ${v}`);
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
            { label: 'idz niespiesznie', cmd: 'idz niespiesznie' },
            { label: 'idz marszem', cmd: 'idz marszem' },
            { label: 'idz truchtem', cmd: 'idz truchtem' },
            { label: 'idz biegiem', cmd: 'idz biegiem' },
            { label: 'idz s. biegiem', cmd: 'idz szybkim biegiem' },
        ];
        cmds.forEach(c => {
            const b = document.createElement('button');
            b.className = 'mobile-button';
            this.applyButtonSize(b);
            b.style.width = '72px';
            b.textContent = c.label;
            b.addEventListener('click', () => this.sendCommand(c.cmd));
            this.idzList!.appendChild(b);
        });
    }

    private applyTeamStatus(status: TeamStatus, options: { forceApply?: boolean } = {}) {
        const nextTeam = status.inTeam || status.isLeader;
        const nextLeader = status.isLeader;
        const changed = nextTeam !== this.teamMode || nextLeader !== this.leaderMode;
        this.teamMode = nextTeam;
        this.leaderMode = nextLeader;
        if (changed || options.forceApply) {
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
        const isEmpty = cfg.macro === 'empty' || !cfg.label;
        btn.textContent = isEmpty ? '' : cfg.label;
        if (isEmpty) {
            btn.classList.add('empty');
            btn.style.backgroundColor = 'transparent';
            btn.style.border = 'none';
            btn.style.color = '';
            btn.style.removeProperty('--color');
            btn.style.removeProperty('--active-color');
        } else {
            btn.classList.remove('empty');
            btn.style.backgroundColor = cfg.color;
            btn.style.border = '';
            btn.style.color = cfg.fontColor || defaultFontColor;
            if (cfg.macro === 'kierunek') {
                btn.style.setProperty('--color', cfg.color);
                btn.style.setProperty('--active-color', cfg.activeColor || '#2fa7c5');
            } else {
                btn.style.removeProperty('--color');
                btn.style.removeProperty('--active-color');
            }
        }
        const clone = btn.cloneNode(true) as HTMLButtonElement;
        btn.replaceWith(clone);
        const newBtn = clone;
        this.applyButtonSize(newBtn);
        if (id === 'bracket-right-button') this.bracketRightButton = newBtn;
        if (id === 'buttons-toggle') {
            this.toggleButton = newBtn;
            this.updateToggleButton();
        }
        if (id === 'z-list-toggle') this.zToggle = newBtn;
        if (id === 'zas-list-toggle') this.zasToggle = newBtn;
        if (cfg.macro === 'wList') {
            this.wToggle = newBtn;
        } else if (this.wToggle === newBtn) {
            this.wToggle = null;
        }
        if (cfg.macro === 'idzList') {
            this.idzToggle = newBtn;
        } else if (this.idzToggle === newBtn) {
            this.idzToggle = null;
        }
        if (cfg.macro === 'przeList') {
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
        if (cfg.macro === 'kierunek' && cfg.direction) {
            newBtn.dataset.direction = getShortDir(cfg.direction);
        } else if (!newBtn.dataset.direction) {
            newBtn.removeAttribute('data-direction');
        }

        const handler = () => {
            if (this.hapticEnabled) navigator.vibrate?.(20);
            switch (cfg.macro) {
                case 'empty':
                    break;
                case 'functional':
                    const event = new KeyboardEvent('keydown', {
                        code: this.boundKey,
                        key: this.boundKey,
                        ctrlKey: this.boundCtrl,
                        altKey: this.boundAlt,
                        shiftKey: this.boundShift,
                        bubbles: true,
                        cancelable: true
                    });
                    document.dispatchEvent(event);
                    break;
                case 'zList':
                    if (this.zList && this.zList.style.display === 'grid') {
                        this.hideLists();
                    } else {
                        this.hideLists();
                        this.renderZList();
                        if (this.zList) this.zList.style.display = 'grid';
                        newBtn.classList.add('active');
                    }
                    break;
                case 'zaList':
                    if (this.zasList && this.zasList.style.display === 'grid') {
                        this.hideLists();
                    } else {
                        this.hideLists();
                        this.renderZasList();
                        if (this.zasList) this.zasList.style.display = 'grid';
                        newBtn.classList.add('active');
                    }
                    break;
                case 'wList':
                    if (this.wList && this.wList.style.display === 'grid') {
                        this.hideLists();
                    } else {
                        this.hideLists();
                        this.renderWList();
                        if (this.wList) this.wList.style.display = 'grid';
                        newBtn.classList.add('active');
                    }
                    break;
                case 'przeList':
                    if (this.przeList && this.przeList.style.display === 'grid') {
                        this.hideLists();
                    } else {
                        this.hideLists();
                        this.renderPrzeList();
                        if (this.przeList) this.przeList.style.display = 'grid';
                        newBtn.classList.add('active');
                    }
                    break;
                case 'idzList':
                    if (this.idzList && this.idzList.style.display === 'grid') {
                        this.hideLists();
                    } else {
                        this.hideLists();
                        this.renderIdzList();
                        if (this.idzList) this.idzList.style.display = 'grid';
                        newBtn.classList.add('active');
                    }
                    break;
                case 'toggleButtons':
                    this.toggleVisibility();
                    break;
                case 'command':
                    if (cfg.command) this.sendCommand(cfg.command);
                    break;
                case 'kierunek':
                    if (cfg.command) {
                        this.sendCommand(cfg.command);
                    } else if (cfg.direction) {
                        this.sendCommand(cfg.direction);
                    }
                    break;
                case 'wesprzyj':
                    this.client.support();
                    break;
                case 'moveMode':
                    if (this.client.carriageMode) break;
                    const options = this.getMoveModeOptionsCount() || 1;
                    this.client.moveMode = (this.client.moveMode + 1) % options;
                    this.updateMoveModeButton(newBtn);
                    this.sendEvent('moveModeChanged', this.client.moveMode);
                    break;
                case 'specialExit':
                    const specialExits = this.client.Map.currentRoom?.specialExits ?? {};
                    const firstExit = Object.keys(specialExits)[0];
                    if (firstExit) {
                        this.sendCommand(firstExit);
                    }
                    break;
            }
        };
        newBtn.addEventListener('click', handler);

        if (cfg.macro === 'moveMode') {
            this.client.moveModeButton = newBtn;
            newBtn.dataset.moveModeLabel = cfg.label || '';
            this.updateMoveModeButton(newBtn);
            newBtn.disabled = this.client.carriageMode;
        } else if (cfg.macro === 'specialExit') {
            const updateLabel = () => {
                const specialExits = this.client.Map.currentRoom?.specialExits ?? {};
                const firstExit = Object.keys(specialExits)[0];
                if (firstExit) {
                    newBtn.textContent = firstExit.length > 5 ? firstExit.slice(0, 4) + '…' : firstExit;
                    newBtn.title = firstExit;
                } else {
                    newBtn.textContent = cfg.label;
                    newBtn.title = '';
                }
            };
            this.client.addEventListener('enterLocation', updateLabel as EventListener);
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
            this.sendEvent('moveModeChanged', this.client.moveMode);
        }
        const prefix = button.dataset.moveModeLabel ?? '';
        const label = prefix ? `${prefix} ${MOVE_MODE_LABELS[safeMode]}` : MOVE_MODE_LABELS[safeMode];
        const title = prefix ? `${prefix} ${MOVE_MODE_TITLES[safeMode]}` : MOVE_MODE_TITLES[safeMode];
        button.textContent = label;
        button.title = title;
    }

    private sendCommand(command: string, options?: { echo?: boolean }): boolean {
        if (!command) {
            return false;
        }
        if (this.dispatcher) {
            return this.dispatcher.sendCommand(command, options);
        }
        return this.client.sendCommand(command, options?.echo ?? true);
    }

    private sendEvent(event: string, payload?: unknown) {
        if (this.dispatcher) {
            this.dispatcher.sendEvent(event, payload);
        } else {
            this.client.sendEvent(event, payload);
        }
    }

}
