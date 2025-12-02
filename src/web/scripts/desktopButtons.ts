import Client from "@client/Client";
import {
    loadSettings as loadDesktopButtonSettings,
    DesktopButtonSetting,
    DesktopButtonsSettings,
    hexToRgba,
    ListGrowDirection,
    saveSettings,
} from "../desktopButtonSettings";

const LONG_PRESS_DURATION = 500;

export default class DesktopButtons {
    private client: Client;
    private container: HTMLDivElement;
    private settings: DesktopButtonsSettings = { buttons: [], locked: false };
    private buttonElements: Map<string, HTMLButtonElement> = new Map();

    // List containers per button
    private listContainers: Map<string, HTMLDivElement> = new Map();
    private activeListButtonId: string | null = null;

    // Drag state
    private isDragging = false;
    private dragButton: HTMLButtonElement | null = null;
    private dragButtonId: string | null = null;
    private longPressTimer: number | null = null;
    private initialX = 0;
    private initialY = 0;
    private offsetX = 0;
    private offsetY = 0;

    constructor(client: Client) {
        this.client = client;

        // Create container
        this.container = document.createElement('div');
        this.container.id = 'desktop-buttons-container';
        this.container.className = 'desktop-buttons-container';
        document.body.appendChild(this.container);

        // Load settings and render
        loadDesktopButtonSettings().then(settings => {
            this.settings = settings;
            this.render();
        });

        // Listen for settings changes from the options panel
        this.client.on('desktopButtonsSettings', (newSettings) => {
            this.settings = newSettings as DesktopButtonsSettings;
            this.render();
        });

        // Set up global mouse/touch handlers for dragging
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd.bind(this));
        document.addEventListener('touchcancel', this.handleTouchEnd.bind(this));

        // Close lists when clicking outside
        document.addEventListener('click', (e) => {
            if (this.activeListButtonId) {
                const target = e.target as HTMLElement;
                const listContainer = this.listContainers.get(this.activeListButtonId);
                const button = this.buttonElements.get(this.activeListButtonId);
                if (listContainer && button &&
                    !listContainer.contains(target) && !button.contains(target)) {
                    this.hideAllLists();
                }
            }
        });
    }

    private render() {
        // Clear existing buttons and lists
        this.container.innerHTML = '';
        this.buttonElements.clear();
        this.listContainers.clear();
        this.activeListButtonId = null;

        // Render each button
        for (const btnSettings of this.settings.buttons) {
            const btn = this.createButton(btnSettings);
            this.container.appendChild(btn);
            this.buttonElements.set(btnSettings.id, btn);

            // Create list container for list-type buttons
            if (['zList', 'zaList', 'wList', 'przeList', 'idzList'].includes(btnSettings.macroType)) {
                const listContainer = this.createListContainer(btnSettings);
                this.container.appendChild(listContainer);
                this.listContainers.set(btnSettings.id, listContainer);
            }
        }

        // Update locked state
        this.container.classList.toggle('drag-locked', this.settings.locked);
    }

    private createButton(settings: DesktopButtonSetting): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.id = settings.id;
        btn.className = 'desktop-button';
        btn.textContent = settings.label;
        btn.dataset.buttonId = settings.id;

        // Apply styles
        btn.style.left = `${settings.x}px`;
        btn.style.top = `${settings.y}px`;
        btn.style.width = `${settings.width}px`;
        btn.style.height = `${settings.height}px`;
        btn.style.backgroundColor = hexToRgba(settings.color, settings.backgroundOpacity);
        btn.style.color = settings.fontColor;
        btn.style.fontSize = `${settings.fontSize}px`;

        // Event handlers
        btn.addEventListener('click', (e) => this.handleClick(e, settings));
        btn.addEventListener('mousedown', (e) => this.handleMouseDown(e, settings));
        btn.addEventListener('touchstart', (e) => this.handleTouchStart(e, settings), { passive: false });
        btn.addEventListener('contextmenu', (e) => e.preventDefault());

        return btn;
    }

    private createListContainer(settings: DesktopButtonSetting): HTMLDivElement {
        const container = document.createElement('div');
        container.className = 'desktop-button-list';
        container.style.display = 'none';
        container.dataset.forButton = settings.id;
        return container;
    }

    private positionListContainer(buttonId: string, settings: DesktopButtonSetting) {
        const btn = this.buttonElements.get(buttonId);
        const listContainer = this.listContainers.get(buttonId);
        if (!btn || !listContainer) return;

        const btnRect = btn.getBoundingClientRect();
        const listPosition: ListPosition = settings.listPosition ?? 'bottom';
        const gap = 4;

        let top: number;
        let left: number;

        switch (listPosition) {
            case 'top':
                top = btnRect.top - listContainer.offsetHeight - gap;
                left = btnRect.left;
                break;
            case 'bottom':
                top = btnRect.bottom + gap;
                left = btnRect.left;
                break;
            case 'left':
                top = btnRect.top;
                left = btnRect.left - listContainer.offsetWidth - gap;
                break;
            case 'right':
                top = btnRect.top;
                left = btnRect.right + gap;
                break;
        }

        // Clamp to viewport
        left = Math.max(5, Math.min(left, window.innerWidth - listContainer.offsetWidth - 5));
        top = Math.max(5, Math.min(top, window.innerHeight - listContainer.offsetHeight - 5));

        listContainer.style.left = `${left}px`;
        listContainer.style.top = `${top}px`;
    }

    private hideAllLists() {
        this.listContainers.forEach((container, buttonId) => {
            container.style.display = 'none';
            const btn = this.buttonElements.get(buttonId);
            if (btn) btn.classList.remove('active');
        });
        this.activeListButtonId = null;
    }

    private toggleList(buttonId: string, settings: DesktopButtonSetting) {
        const listContainer = this.listContainers.get(buttonId);
        const btn = this.buttonElements.get(buttonId);
        if (!listContainer || !btn) return;

        const isVisible = listContainer.style.display !== 'none';

        // Hide all lists first
        this.hideAllLists();

        if (!isVisible) {
            // Render list content
            this.renderListContent(listContainer, settings);

            // Show the list
            const growDirection: ListGrowDirection = settings.listGrowDirection ?? 'horizontal';

            // Determine flex direction based on grow direction setting
            const flexDirection = growDirection === 'horizontal' ? 'row' : 'column';

            listContainer.style.display = 'flex';
            listContainer.style.flexDirection = flexDirection;
            btn.classList.add('active');
            this.activeListButtonId = buttonId;

            // Position after showing (so we can measure)
            requestAnimationFrame(() => {
                this.positionListContainer(buttonId, settings);
            });
        }
    }

    private renderListContent(container: HTMLDivElement, settings: DesktopButtonSetting) {
        container.innerHTML = '';

        switch (settings.macroType) {
            case 'zList':
                this.renderObjectList(container, settings, /^[0-9]+$/, 'z');
                break;
            case 'zaList':
                this.renderObjectList(container, settings, /^[A-Z]$/, 'zas');
                break;
            case 'wList':
                this.renderObjectList(container, settings, /^[A-Z]$/, 'w');
                break;
            case 'przeList':
                this.renderObjectList(container, settings, /^[0-9]+$/, 'prze');
                break;
            case 'idzList':
                this.renderIdzList(container, settings);
                break;
        }
    }

    private applyListItemStyle(btn: HTMLButtonElement, settings: DesktopButtonSetting) {
        btn.style.width = `${settings.width}px`;
        btn.style.height = `${settings.height}px`;
        btn.style.backgroundColor = hexToRgba(settings.color, settings.backgroundOpacity);
        btn.style.color = settings.fontColor;
        btn.style.fontSize = `${settings.fontSize}px`;
        btn.style.border = '1px solid rgba(160, 208, 224, 0.6)';
        btn.style.borderRadius = '4px';
        btn.style.display = 'flex';
        btn.style.justifyContent = 'center';
        btn.style.alignItems = 'center';
        btn.style.textAlign = 'center';
        btn.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.25)';
        btn.style.cursor = 'pointer';
        btn.style.flexShrink = '0';
    }

    private renderObjectList(container: HTMLDivElement, settings: DesktopButtonSetting, regex: RegExp, prefix: string) {
        const objects = this.client.ObjectManager?.getObjectsOnLocation?.() || [];
        const values = Array.from(new Set(
            objects
                .filter((o: any) => regex.test(o.shortcut))
                .map((o: any) => o.shortcut)
        ));

        if (values.length === 0) {
            return;
        }

        values.forEach((v: string) => {
            const b = document.createElement('button');
            b.className = 'desktop-button-list-item';
            b.textContent = v;
            this.applyListItemStyle(b, settings);
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                this.client.sendCommand(`/${prefix} ${v}`);
                this.hideAllLists();
            });
            container.appendChild(b);
        });
    }

    private renderIdzList(container: HTMLDivElement, settings: DesktopButtonSetting) {
        const cmds = [
            { label: 'niespiesznie', cmd: 'idz niespiesznie' },
            { label: 'marszem', cmd: 'idz marszem' },
            { label: 'truchtem', cmd: 'idz truchtem' },
            { label: 'biegiem', cmd: 'idz biegiem' },
            { label: 's. biegiem', cmd: 'idz szybkim biegiem' },
        ];

        cmds.forEach(c => {
            const b = document.createElement('button');
            b.className = 'desktop-button-list-item';
            b.textContent = c.label;
            this.applyListItemStyle(b, settings);
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                this.client.sendCommand(c.cmd);
                this.hideAllLists();
            });
            container.appendChild(b);
        });
    }

    private handleClick(e: MouseEvent, settings: DesktopButtonSetting) {
        // Don't trigger click if we just finished dragging
        if (this.isDragging) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // Execute macro based on type
        switch (settings.macroType) {
            case 'command':
                if (settings.command) {
                    const commands = settings.command.split('\n').filter(cmd => cmd.trim());
                    for (const cmd of commands) {
                        this.client.sendCommand(cmd.trim());
                    }
                }
                break;
            case 'zList':
            case 'zaList':
            case 'wList':
            case 'przeList':
            case 'idzList':
                e.stopPropagation();
                this.toggleList(settings.id, settings);
                break;
            case 'wesprzyj':
                this.client.support();
                break;
            case 'moveMode':
                if (!this.client.carriageMode) {
                    const options = this.getMoveModeOptionsCount();
                    this.client.moveMode = (this.client.moveMode + 1) % options;
                    this.client.sendEvent('moveModeChanged', this.client.moveMode);
                }
                break;
            case 'attackEnemy': {
                const slot = settings.enemySlot ?? 0;
                this.client.attackEnemySlot(slot);
                break;
            }
            case 'blockEnemy': {
                const slot = settings.enemySlot ?? 0;
                this.client.blockEnemySlot(slot);
                break;
            }
        }
    }

    private getMoveModeOptionsCount(): number {
        const inTeam = this.client.TeamManager?.isInAnyTeam?.() ?? false;
        return inTeam ? 3 : 2;
    }

    private handleMouseDown(e: MouseEvent, settings: DesktopButtonSetting) {
        if (this.settings.locked) return;
        if (e.button !== 0) return;

        const btn = e.currentTarget as HTMLButtonElement;
        this.startLongPress(e.clientX, e.clientY, btn, settings.id);
    }

    private handleMouseMove(e: MouseEvent) {
        if (!this.isDragging || !this.dragButton) return;
        e.preventDefault();
        this.updateDragPosition(e.clientX, e.clientY);
    }

    private handleMouseUp(_e: MouseEvent) {
        this.endDrag();
    }

    private handleTouchStart(e: TouchEvent, settings: DesktopButtonSetting) {
        if (this.settings.locked) return;
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        const btn = e.currentTarget as HTMLButtonElement;
        this.startLongPress(touch.clientX, touch.clientY, btn, settings.id);
    }

    private handleTouchMove(e: TouchEvent) {
        if (!this.isDragging || !this.dragButton) return;
        e.preventDefault();
        const touch = e.touches[0];
        this.updateDragPosition(touch.clientX, touch.clientY);
    }

    private handleTouchEnd(_e: TouchEvent) {
        this.endDrag();
    }

    private startLongPress(clientX: number, clientY: number, btn: HTMLButtonElement, buttonId: string) {
        this.cancelLongPress();

        this.initialX = clientX;
        this.initialY = clientY;

        this.longPressTimer = window.setTimeout(() => {
            this.startDrag(btn, buttonId);
        }, LONG_PRESS_DURATION);
    }

    private cancelLongPress() {
        if (this.longPressTimer !== null) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    private startDrag(btn: HTMLButtonElement, buttonId: string) {
        this.isDragging = true;
        this.dragButton = btn;
        this.dragButtonId = buttonId;

        const rect = btn.getBoundingClientRect();
        this.offsetX = this.initialX - rect.left;
        this.offsetY = this.initialY - rect.top;

        btn.classList.add('dragging');
        btn.style.zIndex = '10000';
        btn.style.opacity = '0.85';

        // Hide any open lists while dragging
        this.hideAllLists();
    }

    private updateDragPosition(clientX: number, clientY: number) {
        if (!this.dragButton) return;

        const newX = clientX - this.offsetX;
        const newY = clientY - this.offsetY;

        // Clamp to viewport
        const maxX = window.innerWidth - this.dragButton.offsetWidth - 5;
        const maxY = window.innerHeight - this.dragButton.offsetHeight - 5;
        const clampedX = Math.min(maxX, Math.max(5, newX));
        const clampedY = Math.min(maxY, Math.max(5, newY));

        this.dragButton.style.left = `${clampedX}px`;
        this.dragButton.style.top = `${clampedY}px`;
    }

    private endDrag() {
        this.cancelLongPress();

        if (this.isDragging && this.dragButton && this.dragButtonId) {
            const newX = parseInt(this.dragButton.style.left, 10) || 0;
            const newY = parseInt(this.dragButton.style.top, 10) || 0;

            // Update settings
            this.settings.buttons = this.settings.buttons.map(btn =>
                btn.id === this.dragButtonId ? { ...btn, x: newX, y: newY } : btn
            );

            // Save settings
            saveSettings(this.settings);

            // Reset button style
            this.dragButton.classList.remove('dragging');
            this.dragButton.style.zIndex = '';
            this.dragButton.style.opacity = '';
        }

        // Reset drag state after a short delay to prevent click
        setTimeout(() => {
            this.isDragging = false;
            this.dragButton = null;
            this.dragButtonId = null;
        }, 50);
    }
}
