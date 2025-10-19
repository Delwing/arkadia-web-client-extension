import Client from "@client/src/Client";
import { loadSettings, Settings, LayoutSettings, ButtonSetting, RadialCommandSetting } from "../mobileButtonSettings";

type ActiveLayoutKey = "solo" | "team" | "leader";

type RadialCommand = {
    id: string;
    label: string;
    command: string;
    color: string;
    activeColor?: string;
    fontColor?: string;
    angle: number;
    x: number;
    y: number;
    element?: HTMLDivElement;
};

const LONG_PRESS_DELAY = 450;
const ACTIVATION_RADIUS = 56;
const MENU_RADIUS = 112;

export default class MobileCommandRadial {
    private readonly client: Client;
    private readonly overlay: HTMLDivElement | null;
    private readonly commandsLayer: HTMLDivElement | null;
    private readonly threshold: HTMLDivElement | null;
    private readonly selectionLabel: HTMLDivElement | null;
    private readonly contentArea: HTMLDivElement | null;
    private settings: Settings | null = null;
    private activeLayout: LayoutSettings | null = null;
    private commands: RadialCommand[] = [];
    private highlightedCommandId: string | null = null;
    private touchIdentifier: number | null = null;
    private longPressTimer: number | null = null;
    private isMenuActive = false;
    private startX = 0;
    private startY = 0;
    private centerX = 0;
    private centerY = 0;

    constructor(client: Client) {
        this.client = client;
        if (!('ontouchstart' in window) || window.navigator.maxTouchPoints === 0) {
            this.overlay = null;
            this.commandsLayer = null;
            this.threshold = null;
            this.selectionLabel = null;
            this.contentArea = null;
            return;
        }

        this.overlay = document.getElementById('mobile-command-radial') as HTMLDivElement | null;
        this.commandsLayer = this.overlay?.querySelector('.mobile-command-radial__commands') as HTMLDivElement | null;
        this.threshold = this.overlay?.querySelector('.mobile-command-radial__threshold') as HTMLDivElement | null;
        this.selectionLabel = this.overlay?.querySelector('.mobile-command-radial__selected') as HTMLDivElement | null;
        this.contentArea = document.getElementById('main_text_output_msg_wrapper') as HTMLDivElement | null;

        if (!this.overlay || !this.commandsLayer || !this.threshold) {
            console.warn('Mobile radial command overlay missing.');
            return;
        }

        if (!this.selectionLabel) {
            console.warn('Mobile radial command selection label missing.');
        }

        if (!this.contentArea) {
            console.warn('Mobile radial command content area missing.');
            return;
        }

        this.registerEventListeners();
        this.loadInitialSettings();
    }

    private registerEventListeners() {
        this.contentArea.addEventListener('touchstart', this.handleTouchStart, { passive: true });
        this.contentArea.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        this.contentArea.addEventListener('touchend', this.handleTouchEnd, { passive: false });
        this.contentArea.addEventListener('touchcancel', this.handleTouchEnd, { passive: false });

        this.client.addEventListener('mobileButtonsSettings', () => {
            this.reloadSettings();
        });
        this.client.addEventListener('teamChange', () => {
            this.updateActiveLayout();
        });
        this.client.addEventListener('gmcp.objects.nums', () => {
            this.updateActiveLayout();
        });
        this.client.addEventListener('gmcp.objects.data', () => {
            this.updateActiveLayout();
        });
    }

    private loadInitialSettings() {
        loadSettings().then(settings => {
            this.settings = settings;
            this.updateActiveLayout();
        }).catch(err => console.error('Failed to load mobile button settings for radial menu', err));
    }

    private reloadSettings() {
        loadSettings().then(settings => {
            this.settings = settings;
            this.updateActiveLayout();
        }).catch(err => console.error('Failed to reload mobile button settings for radial menu', err));
    }

    private isRadialEnabled(): boolean {
        if (!this.settings) {
            return true;
        }
        return this.settings.radial?.enabled !== false;
    }

    private readonly handleTouchStart = (event: TouchEvent) => {
        if (this.overlay?.classList.contains('mobile-command-radial--visible')) {
            return;
        }
        if (!this.isRadialEnabled()) {
            this.cancelLongPress();
            return;
        }
        if (event.touches.length !== 1) {
            this.cancelLongPress();
            return;
        }
        const touch = event.touches[0];
        if (!this.isEligibleTouch(touch, event.target)) {
            this.cancelLongPress();
            return;
        }
        if (!this.commands.length) {
            this.cancelLongPress();
            return;
        }
        this.touchIdentifier = touch.identifier;
        this.startX = touch.clientX;
        this.startY = touch.clientY;
        this.longPressTimer = window.setTimeout(() => {
            this.activateMenu(this.startX, this.startY);
        }, LONG_PRESS_DELAY);
    };

    private readonly handleTouchMove = (event: TouchEvent) => {
        const touch = this.getTrackedTouch(event.changedTouches);
        if (!touch) {
            return;
        }

        if (this.longPressTimer !== null && !this.isMenuActive) {
            const dx = touch.clientX - this.startX;
            const dy = touch.clientY - this.startY;
            const distance = Math.hypot(dx, dy);
            if (distance > 12) {
                this.cancelLongPress();
            }
            return;
        }

        if (!this.isMenuActive) {
            return;
        }

        event.preventDefault();
        const dx = touch.clientX - this.centerX;
        const dy = touch.clientY - this.centerY;
        const distance = Math.hypot(dx, dy);
        if (distance < ACTIVATION_RADIUS) {
            this.highlightCommand(null);
            return;
        }
        let closest: { id: string; distance: number } | null = null;
        for (const cmd of this.commands) {
            const commandDistance = Math.hypot(touch.clientX - (this.centerX + cmd.x), touch.clientY - (this.centerY + cmd.y));
            if (!closest || commandDistance < closest.distance) {
                closest = { id: cmd.id, distance: commandDistance };
            }
        }
        this.highlightCommand(closest ? closest.id : null);
    };

    private readonly handleTouchEnd = (event: TouchEvent) => {
        const touch = this.getTrackedTouch(event.changedTouches);
        if (!touch) {
            if (!this.isMenuActive) {
                this.cancelLongPress();
            }
            return;
        }

        if (this.longPressTimer !== null && !this.isMenuActive) {
            this.cancelLongPress();
            return;
        }

        event.preventDefault();
        if (!this.isMenuActive) {
            return;
        }

        const dx = touch.clientX - this.centerX;
        const dy = touch.clientY - this.centerY;
        const distance = Math.hypot(dx, dy);
        if (distance >= ACTIVATION_RADIUS && this.highlightedCommandId) {
            const command = this.commands.find(c => c.id === this.highlightedCommandId);
            if (command) {
                this.client.sendCommand(command.command);
            }
        }
        this.hideMenu();
    };

    private getTrackedTouch(touchList: TouchList): Touch | null {
        if (this.touchIdentifier === null) {
            return null;
        }
        for (let i = 0; i < touchList.length; i++) {
            const touch = touchList.item(i);
            if (touch && touch.identifier === this.touchIdentifier) {
                return touch;
            }
        }
        return null;
    }

    private cancelLongPress() {
        if (this.longPressTimer !== null) {
            window.clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        this.touchIdentifier = null;
    }

    private activateMenu(x: number, y: number) {
        if (!this.overlay || !this.commandsLayer || !this.threshold || !this.commands.length) {
            return;
        }
        this.centerX = x;
        this.centerY = y;
        this.isMenuActive = true;
        this.overlay.style.display = 'block';
        window.requestAnimationFrame(() => {
            this.overlay?.classList.add('mobile-command-radial--visible');
        });
        document.body.classList.add('mobile-command-radial-active');
        this.positionThreshold();
        this.positionSelectionLabel();
        this.updateSelectionLabel(null);
        this.renderCommands();
    }

    private hideMenu() {
        if (!this.overlay) {
            return;
        }
        this.overlay.classList.remove('mobile-command-radial--visible');
        this.overlay.addEventListener('transitionend', () => {
            if (!this.isMenuActive && this.overlay) {
                this.overlay.style.display = 'none';
            }
        }, { once: true });
        this.isMenuActive = false;
        this.highlightCommand(null);
        document.body.classList.remove('mobile-command-radial-active');
        this.touchIdentifier = null;
        this.cancelLongPress();
    }

    private positionThreshold() {
        if (!this.threshold) {
            return;
        }
        this.threshold.style.width = `${ACTIVATION_RADIUS * 2}px`;
        this.threshold.style.height = `${ACTIVATION_RADIUS * 2}px`;
        this.threshold.style.left = `${this.centerX}px`;
        this.threshold.style.top = `${this.centerY}px`;
    }

    private renderCommands() {
        if (!this.commandsLayer) {
            return;
        }
        this.highlightCommand(null);
        this.commandsLayer.innerHTML = '';
        this.updateSelectionLabel(null);
        if (!this.commands.length) {
            return;
        }
        const total = this.commands.length;
        const step = (Math.PI * 2) / total;
        const startAngle = -Math.PI / 2;
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < total; i++) {
            const cmd = this.commands[i];
            const angle = startAngle + i * step;
            const x = Math.cos(angle) * MENU_RADIUS;
            const y = Math.sin(angle) * MENU_RADIUS;
            cmd.angle = angle;
            cmd.x = x;
            cmd.y = y;
            const button = document.createElement('div');
            button.className = 'mobile-command-radial__command';
            button.textContent = cmd.label;
            button.style.left = `${this.centerX + x}px`;
            button.style.top = `${this.centerY + y}px`;
            button.style.backgroundColor = cmd.color || 'rgba(110, 180, 220, 0.85)';
            button.style.color = cmd.fontColor || '#f1f5f9';
            button.dataset.commandId = cmd.id;
            fragment.appendChild(button);
            cmd.element = button;
        }
        this.commandsLayer.appendChild(fragment);
    }

    private highlightCommand(id: string | null) {
        if (this.highlightedCommandId === id) {
            return;
        }
        this.commands.forEach(cmd => {
            if (!cmd.element) {
                return;
            }
            if (cmd.id === id) {
                cmd.element.classList.add('mobile-command-radial__command--highlighted');
                if (cmd.activeColor) {
                    cmd.element.style.backgroundColor = cmd.activeColor;
                }
            } else {
                cmd.element.classList.remove('mobile-command-radial__command--highlighted');
                cmd.element.style.backgroundColor = cmd.color || 'rgba(110, 180, 220, 0.85)';
            }
        });
        this.highlightedCommandId = id;
        this.updateSelectionLabel(id);
    }

    private positionSelectionLabel() {
        if (!this.selectionLabel) {
            return;
        }
        this.selectionLabel.style.left = `${this.centerX}px`;
        this.selectionLabel.style.top = `${this.centerY}px`;
    }

    private updateSelectionLabel(id: string | null) {
        if (!this.selectionLabel) {
            return;
        }
        if (!id) {
            this.selectionLabel.textContent = '';
            this.selectionLabel.classList.remove('mobile-command-radial__selected--visible');
            return;
        }
        const command = this.commands.find(cmd => cmd.id === id);
        if (!command) {
            this.selectionLabel.textContent = '';
            this.selectionLabel.classList.remove('mobile-command-radial__selected--visible');
            return;
        }
        this.selectionLabel.textContent = command.label || command.command;
        this.selectionLabel.classList.add('mobile-command-radial__selected--visible');
    }

    private updateActiveLayout() {
        if (!this.settings) {
            this.activeLayout = null;
            this.updateCommands();
            return;
        }
        const mode = this.resolveActiveLayoutKey();
        const layout = this.settings[mode];
        this.activeLayout = layout || null;
        this.updateCommands();
    }

    private updateCommands() {
        if (!this.settings || !this.isRadialEnabled()) {
            this.commands = [];
            this.highlightCommand(null);
            return;
        }
        const configured = this.settings.radial?.commands || [];
        if (configured.length) {
            this.updateCommandsFromRadial(configured);
            return;
        }
        if (this.activeLayout) {
            this.updateCommandsFromLayout(this.activeLayout);
            return;
        }
        this.commands = [];
        this.highlightCommand(null);
    }

    private updateCommandsFromRadial(entries: RadialCommandSetting[]) {
        const commands: RadialCommand[] = [];
        const seen = new Set<string>();
        entries.forEach(entry => {
            if (!entry || typeof entry !== 'object') {
                return;
            }
            const command = typeof entry.command === 'string' ? entry.command.trim() : '';
            if (!command) {
                return;
            }
            const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : command;
            let id = typeof entry.id === 'string' && entry.id ? entry.id : `radial-${commands.length + 1}`;
            while (seen.has(id)) {
                id = `${id}-${commands.length + 1}`;
            }
            seen.add(id);
            const color = typeof entry.color === 'string' && entry.color.trim()
                ? entry.color.trim()
                : 'rgba(110, 180, 220, 0.85)';
            const fontColor = typeof entry.fontColor === 'string' && entry.fontColor.trim()
                ? entry.fontColor.trim()
                : '#f1f5f9';
            const activeColor = typeof entry.activeColor === 'string' && entry.activeColor.trim()
                ? entry.activeColor.trim()
                : undefined;
            commands.push({
                id,
                label,
                command,
                color,
                activeColor,
                fontColor,
                angle: 0,
                x: 0,
                y: 0,
            });
        });
        this.commands = commands;
        if (this.isMenuActive) {
            this.renderCommands();
        } else {
            this.highlightCommand(null);
        }
    }

    private resolveActiveLayoutKey(): ActiveLayoutKey {
        const manager = (this.client as any).TeamManager;
        const isLeader = !!manager?.isLeader?.();
        if (isLeader) {
            return 'leader';
        }
        const inTeam = !!manager?.isInAnyTeam?.();
        return inTeam ? 'team' : 'solo';
    }

    private updateCommandsFromLayout(layout: LayoutSettings) {
        const commands: RadialCommand[] = [];
        const seen = new Set<string>();
        layout.order.forEach(id => {
            if (seen.has(id)) {
                return;
            }
            seen.add(id);
            const config = layout.buttons[id] || ({} as ButtonSetting);
            const commandText = this.extractCommand(config);
            if (!commandText) {
                return;
            }
            const label = config.label && config.label.trim() ? config.label : commandText;
            commands.push({
                id,
                label,
                command: commandText,
                color: config.color || 'rgba(110, 180, 220, 0.85)',
                activeColor: config.activeColor,
                fontColor: config.fontColor,
                angle: 0,
                x: 0,
                y: 0,
            });
        });
        this.commands = commands;
        if (this.isMenuActive) {
            this.renderCommands();
        } else {
            this.highlightCommand(null);
        }
    }

    private extractCommand(config: ButtonSetting | undefined): string | null {
        if (!config) {
            return null;
        }
        if (typeof config.command === 'string' && config.command.trim()) {
            return config.command.trim();
        }
        if (typeof config.direction === 'string' && config.direction.trim()) {
            return config.direction.trim();
        }
        return null;
    }

    private isEligibleTouch(touch: Touch, origin: EventTarget | null = null): boolean {
        if (!this.contentArea) {
            return false;
        }
        const originNode = origin instanceof Node ? origin : null;
        if (originNode) {
            if (!this.contentArea.contains(originNode)) {
                return false;
            }
            if (originNode instanceof Element && originNode.closest('[data-mobile-command-radial-ignore]')) {
                return false;
            }
        }
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!element) {
            return false;
        }
        if (element instanceof Element && element.closest('[data-mobile-command-radial-ignore]')) {
            return false;
        }
        return this.contentArea.contains(element);
    }
}
