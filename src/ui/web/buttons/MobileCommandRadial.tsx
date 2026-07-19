import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type Client from '@client/Client';
import eventBus from '@modules/core/eventBus';
import { loadSettings, type Settings, type LayoutSettings, type RadialCommandSetting } from '@web/mobileButtonSettings';
import type { MobileButtonSetting } from '@web/buttonSettings';

type ActiveLayoutKey = 'solo' | 'team' | 'leader';

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
const CONTENT_AREA_ID = 'main_text_output_msg_wrapper';

/**
 * Shared, host-agnostic rewrite of the stock `MobileCommandRadial` class (see
 * `src/web/scripts/mobileCommandRadial.ts`) as a React component both the
 * stock UI and forge-ui mount. Renders the exact same overlay markup
 * (`#mobile-command-radial` + its threshold/selected/commands children) the
 * existing e2e suite (`e2e/mobile-command-radial.spec.ts`) already asserts
 * against — it used to be static HTML in `index.html`; this component now
 * owns it.
 *
 * Everything below is intentionally imperative (refs + one big mount effect,
 * not React state) — the show/hide choreography relies on precise DOM timing
 * (an `requestAnimationFrame`-deferred class add so a CSS transition can
 * play, then a `transitionend`-gated `display:none`) that fighting with
 * React's render cycle would only make fragile. Only the interaction
 * skeleton is JSX; the rest mirrors the original class almost verbatim,
 * translated into local closures over refs instead of instance fields.
 */
export default function MobileCommandRadial({ client }: { client: Client }) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const commandsLayerRef = useRef<HTMLDivElement>(null);
    const thresholdRef = useRef<HTMLDivElement>(null);
    const selectionLabelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const overlay = overlayRef.current;
        const commandsLayer = commandsLayerRef.current;
        const threshold = thresholdRef.current;
        const selectionLabel = selectionLabelRef.current;
        const contentArea = document.getElementById(CONTENT_AREA_ID) as HTMLElement | null;
        if (!overlay || !commandsLayer || !threshold) return;

        let settings: Settings | null = null;
        let activeLayout: LayoutSettings | null = null;
        let commands: RadialCommand[] = [];
        let highlightedCommandId: string | null = null;
        let touchIdentifier: number | null = null;
        let longPressTimer: number | null = null;
        let isMenuActive = false;
        let startX = 0;
        let startY = 0;
        let centerX = 0;
        let centerY = 0;

        const isRadialEnabled = () => !settings || settings.radial?.enabled !== false;

        function resolveActiveLayoutKey(): ActiveLayoutKey {
            const manager = (client as any).TeamManager;
            const isLeader = !!manager?.isLeader?.();
            if (isLeader) return 'leader';
            return manager?.isInAnyTeam?.() ? 'team' : 'solo';
        }

        function extractCommand(config?: MobileButtonSetting): string | null {
            if (!config) return null;
            if (typeof config.command === 'string' && config.command.trim()) return config.command.trim();
            if (typeof config.direction === 'string' && config.direction.trim()) return config.direction.trim();
            return null;
        }

        function updateSelectionLabel(id: string | null) {
            if (!selectionLabel) return;
            const command = id ? commands.find((c) => c.id === id) : undefined;
            if (!command) {
                selectionLabel.textContent = '';
                selectionLabel.classList.remove('mobile-command-radial__selected--visible');
                return;
            }
            selectionLabel.textContent = command.label || command.command;
            selectionLabel.classList.add('mobile-command-radial__selected--visible');
        }

        function highlightCommand(id: string | null) {
            if (highlightedCommandId === id) return;
            commands.forEach((cmd) => {
                if (!cmd.element) return;
                if (cmd.id === id) {
                    cmd.element.classList.add('mobile-command-radial__command--highlighted');
                    if (cmd.activeColor) {
                        cmd.element.style.backgroundColor = cmd.activeColor;
                        cmd.element.style.setProperty('--btn-accent', cmd.activeColor);
                    }
                } else {
                    cmd.element.classList.remove('mobile-command-radial__command--highlighted');
                    cmd.element.style.backgroundColor = cmd.color || 'rgba(110, 180, 220, 0.85)';
                    cmd.element.style.setProperty('--btn-accent', cmd.color || 'rgba(110, 180, 220, 0.85)');
                }
            });
            highlightedCommandId = id;
            updateSelectionLabel(id);
        }

        function positionThreshold() {
            threshold!.style.width = `${ACTIVATION_RADIUS * 2}px`;
            threshold!.style.height = `${ACTIVATION_RADIUS * 2}px`;
            threshold!.style.left = `${centerX}px`;
            threshold!.style.top = `${centerY}px`;
        }

        function positionSelectionLabel() {
            if (!selectionLabel) return;
            selectionLabel.style.left = `${centerX}px`;
            selectionLabel.style.top = `${centerY}px`;
        }

        function renderCommands() {
            highlightCommand(null);
            commandsLayer!.innerHTML = '';
            updateSelectionLabel(null);
            if (!commands.length) return;
            const total = commands.length;
            const step = (Math.PI * 2) / total;
            const startAngle = -Math.PI / 2;
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < total; i++) {
                const cmd = commands[i];
                const angle = startAngle + i * step;
                const x = Math.cos(angle) * MENU_RADIUS;
                const y = Math.sin(angle) * MENU_RADIUS;
                cmd.angle = angle;
                cmd.x = x;
                cmd.y = y;
                const button = document.createElement('div');
                button.className = 'mobile-command-radial__command';
                button.textContent = cmd.label;
                button.style.left = `${centerX + x}px`;
                button.style.top = `${centerY + y}px`;
                button.style.backgroundColor = cmd.color || 'rgba(110, 180, 220, 0.85)';
                button.style.setProperty('--btn-accent', cmd.color || 'rgba(110, 180, 220, 0.85)');
                button.style.color = cmd.fontColor || '#f1f5f9';
                button.dataset.commandId = cmd.id;
                fragment.appendChild(button);
                cmd.element = button;
            }
            commandsLayer!.appendChild(fragment);
        }

        function activateMenu(x: number, y: number) {
            if (!commands.length) return;
            centerX = x;
            centerY = y;
            isMenuActive = true;
            overlay!.style.display = 'block';
            window.requestAnimationFrame(() => overlay!.classList.add('mobile-command-radial--visible'));
            document.body.classList.add('mobile-command-radial-active');
            positionThreshold();
            positionSelectionLabel();
            updateSelectionLabel(null);
            renderCommands();
        }

        function cancelLongPress() {
            if (longPressTimer !== null) {
                window.clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            touchIdentifier = null;
        }

        function hideMenu() {
            overlay!.classList.remove('mobile-command-radial--visible');
            overlay!.addEventListener('transitionend', () => {
                if (!isMenuActive) overlay!.style.display = 'none';
            }, { once: true });
            isMenuActive = false;
            highlightCommand(null);
            document.body.classList.remove('mobile-command-radial-active');
            touchIdentifier = null;
            cancelLongPress();
        }

        function isEligibleTouch(touch: Touch, origin: EventTarget | null): boolean {
            if (!contentArea) return false;
            const originNode = origin instanceof Node ? origin : null;
            if (originNode) {
                if (!contentArea.contains(originNode)) return false;
                if (originNode instanceof Element && originNode.closest('[data-mobile-command-radial-ignore]')) return false;
            }
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            if (!element) return false;
            if (element instanceof Element && element.closest('[data-mobile-command-radial-ignore]')) return false;
            return contentArea.contains(element);
        }

        function getTrackedTouch(touchList: TouchList): Touch | null {
            if (touchIdentifier === null) return null;
            for (let i = 0; i < touchList.length; i++) {
                const t = touchList.item(i);
                if (t && t.identifier === touchIdentifier) return t;
            }
            return null;
        }

        function updateCommandsFromRadial(entries: RadialCommandSetting[]) {
            const next: RadialCommand[] = [];
            const seen = new Set<string>();
            entries.forEach((entry) => {
                if (!entry || typeof entry !== 'object') return;
                const command = typeof entry.command === 'string' ? entry.command.trim() : '';
                if (!command) return;
                const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : command;
                let id = typeof entry.id === 'string' && entry.id ? entry.id : `radial-${next.length + 1}`;
                while (seen.has(id)) id = `${id}-${next.length + 1}`;
                seen.add(id);
                const color = typeof entry.color === 'string' && entry.color.trim() ? entry.color.trim() : 'rgba(110, 180, 220, 0.85)';
                const fontColor = typeof entry.fontColor === 'string' && entry.fontColor.trim() ? entry.fontColor.trim() : '#f1f5f9';
                const activeColor = typeof entry.activeColor === 'string' && entry.activeColor.trim() ? entry.activeColor.trim() : undefined;
                next.push({ id, label, command, color, activeColor, fontColor, angle: 0, x: 0, y: 0 });
            });
            commands = next;
            if (isMenuActive) renderCommands();
            else highlightCommand(null);
        }

        function updateCommandsFromLayout(layout: LayoutSettings) {
            const next: RadialCommand[] = [];
            const seen = new Set<string>();
            layout.order.forEach((id) => {
                if (seen.has(id)) return;
                seen.add(id);
                const config = layout.buttons[id] || ({} as MobileButtonSetting);
                const commandText = extractCommand(config);
                if (!commandText) return;
                const label = config.label && config.label.trim() ? config.label : commandText;
                next.push({
                    id, label, command: commandText,
                    color: config.color || 'rgba(110, 180, 220, 0.85)',
                    activeColor: config.activeColor, fontColor: config.fontColor,
                    angle: 0, x: 0, y: 0,
                });
            });
            commands = next;
            if (isMenuActive) renderCommands();
            else highlightCommand(null);
        }

        function updateCommands() {
            if (!settings || !isRadialEnabled()) {
                commands = [];
                highlightCommand(null);
                return;
            }
            const configured = settings.radial?.commands || [];
            if (configured.length) {
                updateCommandsFromRadial(configured);
                return;
            }
            if (activeLayout) {
                updateCommandsFromLayout(activeLayout);
                return;
            }
            commands = [];
            highlightCommand(null);
        }

        function updateActiveLayout() {
            if (!settings) {
                activeLayout = null;
                updateCommands();
                return;
            }
            const mode = resolveActiveLayoutKey();
            activeLayout = settings[mode] || null;
            updateCommands();
        }

        function reloadSettings() {
            settings = loadSettings();
            updateActiveLayout();
        }

        const handleTouchStart = (event: TouchEvent) => {
            if (overlay!.classList.contains('mobile-command-radial--visible')) return;
            if (!isRadialEnabled()) {
                cancelLongPress();
                return;
            }
            if (event.touches.length !== 1) {
                cancelLongPress();
                return;
            }
            const touch = event.touches[0];
            if (!isEligibleTouch(touch, event.target)) {
                cancelLongPress();
                return;
            }
            if (!commands.length) {
                cancelLongPress();
                return;
            }
            touchIdentifier = touch.identifier;
            startX = touch.clientX;
            startY = touch.clientY;
            longPressTimer = window.setTimeout(() => activateMenu(startX, startY), LONG_PRESS_DELAY);
        };

        const handleTouchMove = (event: TouchEvent) => {
            const touch = getTrackedTouch(event.changedTouches);
            if (!touch) return;
            if (longPressTimer !== null && !isMenuActive) {
                const dx = touch.clientX - startX;
                const dy = touch.clientY - startY;
                if (Math.hypot(dx, dy) > 12) cancelLongPress();
                return;
            }
            if (!isMenuActive) return;
            event.preventDefault();
            const dx = touch.clientX - centerX;
            const dy = touch.clientY - centerY;
            if (Math.hypot(dx, dy) < ACTIVATION_RADIUS) {
                highlightCommand(null);
                return;
            }
            let closest: { id: string; distance: number } | null = null;
            for (const cmd of commands) {
                const d = Math.hypot(touch.clientX - (centerX + cmd.x), touch.clientY - (centerY + cmd.y));
                if (!closest || d < closest.distance) closest = { id: cmd.id, distance: d };
            }
            highlightCommand(closest ? closest.id : null);
        };

        const handleTouchEnd = (event: TouchEvent) => {
            const touch = getTrackedTouch(event.changedTouches);
            if (!touch) {
                if (!isMenuActive) cancelLongPress();
                return;
            }
            if (longPressTimer !== null && !isMenuActive) {
                cancelLongPress();
                return;
            }
            event.preventDefault();
            if (!isMenuActive) return;
            const dx = touch.clientX - centerX;
            const dy = touch.clientY - centerY;
            if (Math.hypot(dx, dy) >= ACTIVATION_RADIUS && highlightedCommandId) {
                const command = commands.find((c) => c.id === highlightedCommandId);
                if (command) client.sendCommand(command.command);
            }
            hideMenu();
        };

        const handleMouseMove = (event: MouseEvent) => {
            if (!isMenuActive) return;
            const dx = event.clientX - centerX;
            const dy = event.clientY - centerY;
            if (Math.hypot(dx, dy) < ACTIVATION_RADIUS) {
                highlightCommand(null);
                return;
            }
            let closest: { id: string; distance: number } | null = null;
            for (const cmd of commands) {
                const d = Math.hypot(event.clientX - (centerX + cmd.x), event.clientY - (centerY + cmd.y));
                if (!closest || d < closest.distance) closest = { id: cmd.id, distance: d };
            }
            highlightCommand(closest ? closest.id : null);
        };

        const removeMouseListeners = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('keydown', handleKeyDown);
        };

        function handleMouseUp(event: MouseEvent) {
            if (!isMenuActive) return;
            const dx = event.clientX - centerX;
            const dy = event.clientY - centerY;
            if (Math.hypot(dx, dy) >= ACTIVATION_RADIUS && highlightedCommandId) {
                const command = commands.find((c) => c.id === highlightedCommandId);
                if (command) client.sendCommand(command.command);
            }
            removeMouseListeners();
            hideMenu();
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (!isMenuActive) return;
            if (event.key === 'Escape') {
                removeMouseListeners();
                hideMenu();
            }
        }

        // Middle-mouse-click on the content area opens the same menu at the click
        // point — a desktop trigger alongside the touch long-press. Previously
        // wired only in stock's main.ts against the old class's public `showAt`;
        // folded in here so forge gets it for free too, since it's just another
        // way to activate the one shared menu.
        const handleContentAreaMouseDown = (event: MouseEvent) => {
            if (event.button !== 1) return;
            if (!isRadialEnabled() || !commands.length) return;
            event.preventDefault();
            activateMenu(event.clientX, event.clientY);
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('keydown', handleKeyDown);
        };

        const hasTouchSupport = ('ontouchstart' in window) && window.navigator.maxTouchPoints > 0;
        if (hasTouchSupport && contentArea) {
            contentArea.addEventListener('touchstart', handleTouchStart, { passive: true });
            contentArea.addEventListener('touchmove', handleTouchMove, { passive: false });
            contentArea.addEventListener('touchend', handleTouchEnd, { passive: false });
            contentArea.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        }
        contentArea?.addEventListener('mousedown', handleContentAreaMouseDown);

        const offSettings = eventBus.on('mobileButtonsSettings', reloadSettings);
        const offTeamChange = client.on('teamChange', updateActiveLayout);
        const offObjectsNums = client.on('gmcp.objects.nums', updateActiveLayout);
        const offObjectsData = client.on('gmcp.objects.data', updateActiveLayout);

        settings = loadSettings();
        updateActiveLayout();

        return () => {
            contentArea?.removeEventListener('touchstart', handleTouchStart);
            contentArea?.removeEventListener('touchmove', handleTouchMove);
            contentArea?.removeEventListener('touchend', handleTouchEnd);
            contentArea?.removeEventListener('touchcancel', handleTouchEnd);
            contentArea?.removeEventListener('mousedown', handleContentAreaMouseDown);
            removeMouseListeners();
            offSettings();
            offTeamChange();
            offObjectsNums();
            offObjectsData();
            cancelLongPress();
        };
    }, [client]);

    return createPortal(
        <div id="mobile-command-radial" className="mobile-command-radial" ref={overlayRef}>
            <div className="mobile-command-radial__threshold" ref={thresholdRef} />
            <div className="mobile-command-radial__selected" ref={selectionLabelRef} />
            <div className="mobile-command-radial__commands" ref={commandsLayerRef} />
        </div>,
        document.body,
    );
}
