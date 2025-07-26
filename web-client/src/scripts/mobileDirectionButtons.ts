import Client from "@client/src/Client";
import { formatLabel } from "@client/src/scripts/functionalBind";
import { loadSettings as loadMobileButtonSettings, ButtonSetting } from "../mobileButtonSettings";
import { getItemSync, setItemSync } from "@client/src/storage";

export default class MobileDirectionButtons {
    private client: Client;
    private readonly container: HTMLDivElement;
    private readonly messageInput: HTMLInputElement | null = null;
    private readonly contentArea: HTMLElement | null = null;
    private readonly zList: HTMLDivElement | null = null;
    private readonly zasList: HTMLDivElement | null = null;
    private readonly zToggle: HTMLButtonElement | null = null;
    private readonly zasToggle: HTMLButtonElement | null = null;
    private bracketRightButton: HTMLButtonElement | null = null;
    private readonly toggleButton: HTMLButtonElement | null = null;
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
    private buttonSettings: Record<string, ButtonSetting> = {};

    private readonly polishToEnglish: Record<string, string> = {
        "polnoc": "north",
        "poludnie": "south",
        "wschod": "east",
        "zachod": "west",
        "polnocny-wschod": "northeast",
        "polnocny-zachod": "northwest",
        "poludniowy-wschod": "southeast",
        "poludniowy-zachod": "southwest",
        "dol": "down",
        "gora": "up",
        "gore": "up",
    };

    private readonly longToShort: Record<string, string> = {
        north: "n",
        south: "s",
        east: "e",
        west: "w",
        northeast: "ne",
        northwest: "nw",
        southeast: "se",
        southwest: "sw",
        up: "u",
        down: "d",
    };

    private getShortDir(dir: string): string {
        const long = this.polishToEnglish[dir] ?? dir;
        return this.longToShort[long] ?? dir;
    }

    constructor(client: Client) {
        this.client = client;
        this.container = document.getElementById('mobile-direction-buttons') as HTMLDivElement;
        this.messageInput = document.getElementById('message-input') as HTMLInputElement;
        this.contentArea = document.getElementById('main_text_output_msg_wrapper');
        this.zList = document.getElementById('z-buttons-list') as HTMLDivElement;
        this.zasList = document.getElementById('zas-buttons-list') as HTMLDivElement;
        this.zToggle = document.getElementById('z-list-toggle') as HTMLButtonElement;
        this.zasToggle = document.getElementById('zas-list-toggle') as HTMLButtonElement;
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

        loadMobileButtonSettings().then(settings => {
            this.buttonSettings = settings;
            this.setupEventHandlers();
            Object.keys(this.buttonSettings).forEach(id => {
                const btn = document.getElementById(id) as HTMLButtonElement | null;
                if (btn) this.applyConfigToButton(id, btn);
            });
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

        const updateLists = () => {
            if (this.zList && this.zList.style.display !== 'none') {
                this.renderZList();
            }
            if (this.zasList && this.zasList.style.display !== 'none') {
                this.renderZasList();
            }
        };
        this.client.addEventListener('gmcp.objects.nums', updateLists);
        this.client.addEventListener('gmcp.objects.data', updateLists);

        // Listen for window resize to check if mobile view
        window.addEventListener('resize', () => {
            this.checkMobile();
            this.scrollToBottom();
        });

        // Listen for UI settings changes
        this.client.addEventListener("uiSettings", (event: CustomEvent) => {
            const detail = event.detail || {};
            if (!Object.prototype.hasOwnProperty.call(detail, "mobileDirectionButtons")) {
                return;
            }
            // Only disable if explicitly set to false
            const disabled = detail.mobileDirectionButtons === false;
            if (disabled) {
                this.disable();
            } else {
                this.enable();
            }
        });

        this.client.addEventListener('mobileButtonsSettings', (ev: CustomEvent) => {
            this.buttonSettings = ev.detail || this.buttonSettings;
            Object.keys(this.buttonSettings).forEach(id => {
                const b = document.getElementById(id) as HTMLButtonElement | null;
                if (b) this.applyConfigToButton(id, b);
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
            this.toggleButton.addEventListener('click', () => {
                this.toggleVisibility();
            });
        }

        // Center and special exit buttons configured via settings
    }


    enable() {
        if (this.enabled) return;
        this.enabled = true;
        // Show buttons regardless of device type
        this.container.style.display = 'grid';
    }

    disable() {
        if (!this.enabled) return;
        this.enabled = false;
        this.container.style.display = 'none';
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

        // Set initial position from storage if available
        const savedData = getItemSync('mobileButtonsPosition');
        const savedPosition = savedData?.mobileButtonsPosition;
        if (savedPosition) {
            try {
                const { x, y } = savedPosition as any;
                this.container.style.right = `${x}px`;
                this.container.style.top = `${y}px`;
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

    private dragStart(x: number, y: number, preventDefault?: () => void) {
        if (!this.container) return;

        if (this.isScrolling) return;

        this.initialX = x;
        this.initialY = y;

        this.longPressTimer = window.setTimeout(() => {
            if (preventDefault) preventDefault();

            this.isDragging = true;
            this.container.classList.add('dragging');

            const rect = this.container.getBoundingClientRect();
            this.offsetX = window.innerWidth - rect.right;
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

        const deltaX = this.initialX - this.currentX;
        const deltaY = this.currentY - this.initialY;

        const newRight = this.offsetX + deltaX;
        const newTop = this.offsetY + deltaY;

        const maxRight = window.innerWidth - this.container.offsetWidth - 5;
        const clampedRight = Math.min(maxRight, Math.max(5, newRight));
        const clampedTop = Math.max(5, newTop);

        this.container.style.right = `${clampedRight}px`;
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
                x: window.innerWidth - rect.right,
                y: rect.top,
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
        const touch = e.touches[0];
        this.dragStart(touch.clientX, touch.clientY, () => e.preventDefault());
    }

    private handleTouchMove(e: TouchEvent) {
        e.preventDefault();
        const touch = e.touches[0];
        this.dragMove(touch.clientX, touch.clientY);
    }

    private handleTouchEnd(e: TouchEvent) {
        this.dragEnd(() => e.preventDefault());
    }

    private handleMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        this.dragStart(e.clientX, e.clientY);
    }

    private handleMouseMove(e: MouseEvent) {
        this.dragMove(e.clientX, e.clientY);
    }

    private handleMouseUp(e: MouseEvent) {
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
        if (this.zToggle) this.zToggle.classList.remove('active');
        if (this.zasToggle) this.zasToggle.classList.remove('active');
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

    private highlightExits(exits: string[]) {
        const available = new Set(exits.map((e) => this.getShortDir(e)));
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
        const objects = (window as any).clientExtension?.ObjectManager?.getObjectsOnLocation?.() || [];
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

    private applyConfigToButton(id: string, btn: HTMLButtonElement) {
        const cfg = this.buttonSettings[id];
        if (!cfg) return;
        btn.textContent = cfg.label;
        btn.style.backgroundColor = cfg.color;
        const clone = btn.cloneNode(true) as HTMLButtonElement;
        btn.replaceWith(clone);
        const newBtn = clone;
        this.applyButtonSize(newBtn);
        if (id === 'bracket-right-button') this.bracketRightButton = newBtn;
        if (id === 'z-list-toggle') this.zToggle = newBtn;
        if (id === 'zas-list-toggle') this.zasToggle = newBtn;
        if (id.endsWith('-button')) {
            const dirKey = id.replace('-button', '');
            if (Object.prototype.hasOwnProperty.call(this.directionButtons, dirKey)) {
                this.directionButtons[dirKey] = newBtn;
                newBtn.dataset.direction = dirKey;
            }
        }
        if (cfg.macro === 'kierunek' && cfg.direction) {
            newBtn.dataset.direction = this.getShortDir(cfg.direction);
        } else if (!newBtn.dataset.direction) {
            newBtn.removeAttribute('data-direction');
        }

        const handler = () => {
            switch (cfg.macro) {
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
                case 'command':
                    if (cfg.command) this.client.sendCommand(cfg.command);
                    break;
                case 'kierunek':
                    if (cfg.command) {
                        this.client.sendCommand(cfg.command);
                    } else if (cfg.direction) {
                        this.client.sendCommand(cfg.direction);
                    }
                    break;
                case 'specialExit':
                    const specialExits = this.client.Map.currentRoom?.specialExits ?? {};
                    const firstExit = Object.keys(specialExits)[0];
                    if (firstExit) {
                        this.client.sendCommand(firstExit);
                    }
                    break;
            }
        };
        newBtn.addEventListener('click', handler);

        if (cfg.macro === 'specialExit') {
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

}
