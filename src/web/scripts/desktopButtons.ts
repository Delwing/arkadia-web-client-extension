import Client from "@client/Client";
import {
    loadSettings as loadDesktopButtonSettings,
    DesktopButtonsSettings,
    hexToRgba,
    saveSettings,
} from "../desktopButtonSettings";
import type { DesktopButtonSetting, ListGrowDirection, ListPosition } from "../buttonSettings";
import {
    getButtonMacroDisplayInfo,
    isStatefulMacro
} from "@modules/core/pluginButtonMacroRegistry";
import eventBus from "@modules/core/eventBus";
import { executeMacro, type MacroExecutorCallbacks } from "./buttonMacroExecutor";

const LONG_PRESS_DURATION = 1000;  // 1s for drag activation
const HOLD_THRESHOLD = 500;  // 500ms determines tap vs hold
const DRAG_MOVE_THRESHOLD = 10;  // pixels to consider as movement

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

    // Hold action state - tracks press start for release-based execution
    private buttonPressStart: Map<string, { time: number; x: number; y: number; settings: DesktopButtonSetting; btn: HTMLButtonElement }> = new Map();
    private buttonDragged: Set<string> = new Set();
    private buttonHoldGlowTimers: Map<string, number> = new Map();

    constructor(client: Client) {
        this.client = client;

        // Create container
        this.container = document.createElement('div');
        this.container.id = 'desktop-buttons-container';
        this.container.className = 'desktop-buttons-container';
        document.body.appendChild(this.container);

        // Load settings and render
        this.settings = loadDesktopButtonSettings();
        this.render();

        // Listen for settings changes from the options panel
        this.client.on('desktopButtonsSettings', (newSettings) => {
            this.settings = newSettings as DesktopButtonsSettings;
            this.render();
        });

        // Listen for plugin macro state changes to update button display
        eventBus.on('pluginButtonMacroStateChanged', () => {
            this.render();
        });

        // Listen for plugin macro registration to show initial state
        eventBus.on('pluginButtonMacrosChanged', () => {
            this.render();
        });

        // Set up global mouse/touch handlers for dragging
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd.bind(this));
        document.addEventListener('touchcancel', this.handleTouchEnd.bind(this));

        // Close lists when clicking outside (unless listCloseOnlyByButton is set)
        document.addEventListener('click', (e) => {
            if (this.activeListButtonId) {
                const activeButtonSettings = this.settings.buttons.find(b => b.id === this.activeListButtonId);
                if (activeButtonSettings?.listCloseOnlyByButton) {
                    return; // Don't close on outside click
                }
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
        btn.dataset.buttonId = settings.id;

        // Get display info for stateful plugin macros
        let displayLabel = settings.label;
        let displayColor = settings.color;

        if (settings.macroType.startsWith('plugin:') && isStatefulMacro(settings.macroType)) {
            // Pass custom state overrides from pluginConfig if user customized them
            const customOverrides = {
                labels: settings.pluginConfig?.stateLabels as Record<string, string> | undefined,
                colors: settings.pluginConfig?.stateColors as Record<string, string> | undefined
            };
            const displayInfo = getButtonMacroDisplayInfo(settings.macroType, customOverrides);
            if (displayInfo) {
                // Combine user label with state label: "userLabel stateLabel"
                if (displayInfo.stateLabel) {
                    displayLabel = settings.label
                        ? `${settings.label} ${displayInfo.stateLabel}`
                        : displayInfo.stateLabel;
                }
                if (displayInfo.color) displayColor = displayInfo.color;
            }
        }

        btn.textContent = displayLabel;

        // Apply styles
        btn.style.left = `${settings.x}px`;
        btn.style.top = `${settings.y}px`;
        btn.style.width = `${settings.width}px`;
        btn.style.height = `${settings.height}px`;
        btn.style.backgroundColor = hexToRgba(displayColor, settings.backgroundOpacity);
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
        btn.style.boxSizing = 'border-box';
        btn.style.width = `${settings.width}px`;
        btn.style.height = `${settings.height}px`;
        btn.style.padding = '0';
        btn.style.margin = '0';
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

    private getCallbacks(settings?: DesktopButtonSetting, e?: MouseEvent): MacroExecutorCallbacks {
        return {
            toggleList: () => {
                if (e && settings) {
                    e.stopPropagation();
                    this.toggleList(settings.id, settings);
                }
            },
        };
    }

    private handleClick(e: MouseEvent, settings: DesktopButtonSetting) {
        // Don't trigger click if we just finished dragging
        if (this.isDragging) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // If button has hold enabled, click is handled in mouseup/touchend
        if (settings.holdEnabled && settings.hold?.macroType) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // Don't trigger if button was dragged
        if (this.buttonDragged.has(settings.id)) {
            e.preventDefault();
            e.stopPropagation();
            this.buttonDragged.delete(settings.id);
            return;
        }

        const btn = e.currentTarget as HTMLButtonElement;
        executeMacro(this.client, settings.macroType, settings, this.getCallbacks(settings, e), btn);
    }

    private handleMouseDown(e: MouseEvent, settings: DesktopButtonSetting) {
        if (e.button !== 0) return;

        const btn = e.currentTarget as HTMLButtonElement;

        // Record press start for hold detection
        if (settings.holdEnabled && settings.hold?.macroType) {
            this.buttonPressStart.set(settings.id, {
                time: Date.now(),
                x: e.clientX,
                y: e.clientY,
                settings,
                btn
            });
            this.buttonDragged.delete(settings.id);

            // Clear any existing glow timer
            const existingGlowTimer = this.buttonHoldGlowTimers.get(settings.id);
            if (existingGlowTimer) clearTimeout(existingGlowTimer);

            // Start glow timer - add glow class when hold threshold is reached
            const glowTimer = window.setTimeout(() => {
                // Set glow color based on button's background color
                const bgColor = window.getComputedStyle(btn).backgroundColor;
                const rgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (rgbaMatch) {
                    const [, r, g, b] = rgbaMatch;
                    btn.style.setProperty('--hold-glow-color', `rgba(${r}, ${g}, ${b}, 0.7)`);
                }
                btn.classList.add('hold-glow');
                navigator.vibrate?.([50, 30, 50]); // Haptic feedback when hold activates
            }, HOLD_THRESHOLD);
            this.buttonHoldGlowTimers.set(settings.id, glowTimer);
        }

        if (this.settings.locked) return;

        this.startLongPress(e.clientX, e.clientY, btn, settings.id);
    }

    private handleMouseMove(e: MouseEvent) {
        // Check for button press movement (for hold detection)
        this.buttonPressStart.forEach((pressStart, buttonId) => {
            const elapsed = Date.now() - pressStart.time;
            const dx = Math.abs(e.clientX - pressStart.x);
            const dy = Math.abs(e.clientY - pressStart.y);
            const moved = dx > DRAG_MOVE_THRESHOLD || dy > DRAG_MOVE_THRESHOLD;

            // Mark as dragged if moved significantly AND after drag activation time AND buttons unlocked
            if (moved && elapsed > LONG_PRESS_DURATION && !this.settings.locked) {
                this.buttonDragged.add(buttonId);
                // Cancel glow when dragging
                const glowTimer = this.buttonHoldGlowTimers.get(buttonId);
                if (glowTimer) {
                    clearTimeout(glowTimer);
                    this.buttonHoldGlowTimers.delete(buttonId);
                }
                pressStart.btn.classList.remove('hold-glow');
                pressStart.btn.style.removeProperty('--hold-glow-color');
            }
        });

        if (!this.isDragging || !this.dragButton) return;
        e.preventDefault();
        this.updateDragPosition(e.clientX, e.clientY);
    }

    private handleMouseUp(_e: MouseEvent) {
        // Handle hold button release
        this.buttonPressStart.forEach((pressStart, buttonId) => {
            const settings = pressStart.settings;
            const btn = pressStart.btn;

            // Clear glow timer and remove glow class
            const glowTimer = this.buttonHoldGlowTimers.get(buttonId);
            if (glowTimer) {
                clearTimeout(glowTimer);
                this.buttonHoldGlowTimers.delete(buttonId);
            }
            btn.classList.remove('hold-glow');
            btn.style.removeProperty('--hold-glow-color');

            // If dragged, don't execute macro
            if (this.buttonDragged.has(buttonId)) {
                this.buttonDragged.delete(buttonId);
                this.buttonPressStart.delete(buttonId);
                return;
            }

            const elapsed = Date.now() - pressStart.time;
            this.buttonPressStart.delete(buttonId);

            if (elapsed >= HOLD_THRESHOLD) {
                // Execute hold action
                const hold = settings.hold!;
                const holdConfig = { ...settings, macroType: hold.macroType, command: hold.command, direction: hold.direction, enemySlot: hold.enemySlot, pluginConfig: hold.pluginConfig, steps: hold.steps };
                executeMacro(this.client, hold.macroType, holdConfig, this.getCallbacks(settings), btn);
            } else {
                // Execute tap action
                executeMacro(this.client, settings.macroType, settings, this.getCallbacks(settings), btn);
            }
        });

        this.endDrag();
    }

    private handleTouchStart(e: TouchEvent, settings: DesktopButtonSetting) {
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        const btn = e.currentTarget as HTMLButtonElement;

        // Record press start for hold detection
        if (settings.holdEnabled && settings.hold?.macroType) {
            // Prevent synthetic mouse events from firing after touch events
            // Without this, tap would execute macro twice (touchend + mouseup)
            e.preventDefault();

            this.buttonPressStart.set(settings.id, {
                time: Date.now(),
                x: touch.clientX,
                y: touch.clientY,
                settings,
                btn
            });
            this.buttonDragged.delete(settings.id);

            // Clear any existing glow timer
            const existingGlowTimer = this.buttonHoldGlowTimers.get(settings.id);
            if (existingGlowTimer) clearTimeout(existingGlowTimer);

            // Start glow timer - add glow class when hold threshold is reached
            const glowTimer = window.setTimeout(() => {
                // Set glow color based on button's background color
                const bgColor = window.getComputedStyle(btn).backgroundColor;
                const rgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (rgbaMatch) {
                    const [, r, g, b] = rgbaMatch;
                    btn.style.setProperty('--hold-glow-color', `rgba(${r}, ${g}, ${b}, 0.7)`);
                }
                btn.classList.add('hold-glow');
                navigator.vibrate?.([50, 30, 50]); // Haptic feedback when hold activates
            }, HOLD_THRESHOLD);
            this.buttonHoldGlowTimers.set(settings.id, glowTimer);
        }

        if (this.settings.locked) return;

        this.startLongPress(touch.clientX, touch.clientY, btn, settings.id);
    }

    private handleTouchMove(e: TouchEvent) {
        const touch = e.touches[0];

        // Check for button press movement (for hold detection)
        this.buttonPressStart.forEach((pressStart, buttonId) => {
            const elapsed = Date.now() - pressStart.time;
            const dx = Math.abs(touch.clientX - pressStart.x);
            const dy = Math.abs(touch.clientY - pressStart.y);
            const moved = dx > DRAG_MOVE_THRESHOLD || dy > DRAG_MOVE_THRESHOLD;

            // Mark as dragged if moved significantly AND after drag activation time AND buttons unlocked
            if (moved && elapsed > LONG_PRESS_DURATION && !this.settings.locked) {
                this.buttonDragged.add(buttonId);
                // Cancel glow when dragging
                const glowTimer = this.buttonHoldGlowTimers.get(buttonId);
                if (glowTimer) {
                    clearTimeout(glowTimer);
                    this.buttonHoldGlowTimers.delete(buttonId);
                }
                pressStart.btn.classList.remove('hold-glow');
                pressStart.btn.style.removeProperty('--hold-glow-color');
            }
        });

        if (!this.isDragging || !this.dragButton) return;
        e.preventDefault();
        this.updateDragPosition(touch.clientX, touch.clientY);
    }

    private handleTouchEnd(_e: TouchEvent) {
        // Handle hold button release
        this.buttonPressStart.forEach((pressStart, buttonId) => {
            const settings = pressStart.settings;
            const btn = pressStart.btn;

            // Clear glow timer and remove glow class
            const glowTimer = this.buttonHoldGlowTimers.get(buttonId);
            if (glowTimer) {
                clearTimeout(glowTimer);
                this.buttonHoldGlowTimers.delete(buttonId);
            }
            btn.classList.remove('hold-glow');
            btn.style.removeProperty('--hold-glow-color');

            // If dragged, don't execute macro
            if (this.buttonDragged.has(buttonId)) {
                this.buttonDragged.delete(buttonId);
                this.buttonPressStart.delete(buttonId);
                return;
            }

            const elapsed = Date.now() - pressStart.time;
            this.buttonPressStart.delete(buttonId);

            if (elapsed >= HOLD_THRESHOLD) {
                // Execute hold action
                const hold = settings.hold!;
                const holdConfig = { ...settings, macroType: hold.macroType, command: hold.command, direction: hold.direction, enemySlot: hold.enemySlot, pluginConfig: hold.pluginConfig, steps: hold.steps };
                executeMacro(this.client, hold.macroType, holdConfig, this.getCallbacks(settings), btn);
            } else {
                // Execute tap action
                executeMacro(this.client, settings.macroType, settings, this.getCallbacks(settings), btn);
            }
        });

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

        // Clear button press state if we were dragging
        if (this.dragButtonId) {
            this.buttonPressStart.delete(this.dragButtonId);
            this.buttonDragged.delete(this.dragButtonId);
        }

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
