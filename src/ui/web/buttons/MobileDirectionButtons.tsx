import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type Client from '@client/Client';
import { globalStorage } from '@modules/core/storage';
import { getShellSettings, onShellSettingsChange } from '@modules/core/settings';
import { getShortDir } from '@shared/map/directions';
import eventBus from '@modules/core/eventBus';
import { getButtonMacroDisplayInfo, isStatefulMacro } from '@modules/core/pluginButtonMacroRegistry';
import {
    loadSettings as loadMobileButtonSettings,
    computeBoxShadow,
    defaultButtonSize,
    defaultButtonGap,
    defaultSettings,
    type Settings,
} from '@web/mobileButtonSettings';
import type { MobileButtonSetting } from '@web/buttonSettings';
import { defaultFontColor } from '@web/buttonSettings';
import { executeMacro, updateMoveModeLabel, type MacroExecutorCallbacks } from '@web/scripts/buttonMacroExecutor';
import { useClientEvent } from '../hooks';

const HOLD_DURATION = 500;
const DRAG_ACTIVATION_DURATION = 1000;
const DRAG_MOVE_THRESHOLD = 10;
const CONTENT_AREA_ID = 'main_text_output_msg_wrapper';

const ORIENTATIONS = ['portrait', 'landscape'] as const;
type Orientation = (typeof ORIENTATIONS)[number];
type StoredPosition = { x: number; y: number; origin: 'left' | 'right' };
const DEFAULT_ORIGIN: StoredPosition['origin'] = 'left';

const FIXED_DIRECTION_KEYS = new Set(['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'u', 'd']);

type ListId = 'zList' | 'zaList' | 'wList' | 'przeList' | 'idzList';

const LIST_ITEM_SPECS: Record<Exclude<ListId, 'idzList'>, { regex: RegExp; prefix: string }> = {
    zList: { regex: /^[0-9]+$/, prefix: 'z' },
    zaList: { regex: /^[A-Z]$/, prefix: 'zas' },
    wList: { regex: /^[A-Z]$/, prefix: 'w' },
    przeList: { regex: /^[0-9]+$/, prefix: 'prze' },
};

const IDZ_COMMANDS = [
    { label: 'idz niespiesznie', cmd: 'idz niespiesznie' },
    { label: 'idz marszem', cmd: 'idz marszem' },
    { label: 'idz truchtem', cmd: 'idz truchtem' },
    { label: 'idz biegiem', cmd: 'idz biegiem' },
    { label: 'idz s. biegiem', cmd: 'idz szybkim biegiem' },
];

const emptyButton: MobileButtonSetting = { macroType: 'empty', label: '', color: 'transparent', fontColor: defaultFontColor };

type PressStart = { time: number; x: number; y: number; cfg: MobileButtonSetting; btn: HTMLButtonElement };

type CSSVarStyle = React.CSSProperties & { '--color'?: string; '--active-color'?: string };

function getCurrentOrientation(): Orientation {
    if (window.matchMedia) {
        if (window.matchMedia('(orientation: portrait)').matches) return 'portrait';
        if (window.matchMedia('(orientation: landscape)').matches) return 'landscape';
    }
    return window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape';
}

function getAlternateOrientation(orientation: Orientation): Orientation {
    return orientation === 'portrait' ? 'landscape' : 'portrait';
}

function sanitizePosition(raw: unknown): StoredPosition | null {
    if (!raw || typeof raw !== 'object') return null;
    const candidate = raw as Partial<StoredPosition>;
    const x = Number(candidate?.x);
    const y = Number(candidate?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const origin = candidate?.origin === 'right' ? 'right' : DEFAULT_ORIGIN;
    return { x, y, origin };
}

function normalizeSavedPositions(raw: unknown): Partial<Record<Orientation, StoredPosition>> {
    const positions: Partial<Record<Orientation, StoredPosition>> = {};
    if (!raw || typeof raw !== 'object') return positions;
    const source = raw as Record<string, unknown>;
    let hasOrientationSpecific = false;
    ORIENTATIONS.forEach((orientation) => {
        const sanitized = sanitizePosition(source[orientation]);
        if (sanitized) {
            positions[orientation] = sanitized;
            hasOrientationSpecific = true;
        }
    });
    if (hasOrientationSpecific) return positions;
    const fallback = sanitizePosition(source);
    if (fallback) {
        ORIENTATIONS.forEach((orientation) => {
            positions[orientation] = { ...fallback };
        });
    }
    return positions;
}

function positionsEqual(a?: StoredPosition | null, b?: StoredPosition | null): boolean {
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y && a.origin === b.origin;
}

/** Declarative equivalent of the old class's `applyConfigToButton` display logic. */
function computeButtonVisual(id: string, cfg: MobileButtonSetting, activeButtons: Record<string, MobileButtonSetting>, client: Client) {
    let effectiveColor = cfg.color;
    let effectiveActiveColor = cfg.activeColor;
    let effectiveLabel = cfg.label;

    if (cfg.macroType === 'specialExit' && cfg.syncWithDirections) {
        const directionButton = Object.values(activeButtons).find((b) => b.macroType === 'kierunek');
        if (directionButton) {
            effectiveColor = directionButton.color;
            effectiveActiveColor = directionButton.activeColor || '#2fa7c5';
        }
    }

    if (cfg.macroType.startsWith('plugin:') && isStatefulMacro(cfg.macroType)) {
        const customOverrides = {
            labels: cfg.pluginConfig?.stateLabels as Record<string, string> | undefined,
            colors: cfg.pluginConfig?.stateColors as Record<string, string> | undefined,
        };
        const displayInfo = getButtonMacroDisplayInfo(cfg.macroType, customOverrides);
        if (displayInfo) {
            if (displayInfo.stateLabel) {
                effectiveLabel = cfg.label ? `${cfg.label} ${displayInfo.stateLabel}` : displayInfo.stateLabel;
            }
            if (displayInfo.color) effectiveColor = displayInfo.color;
        }
    }

    let dataDirection: string | undefined;
    if (cfg.macroType === 'specialExit') {
        const specialExits = client.Map.currentRoom?.specialExits ?? {};
        const firstExit = Object.keys(specialExits)[0];
        if (firstExit) {
            effectiveLabel = firstExit.length > 5 ? `${firstExit.slice(0, 4)}…` : firstExit;
            dataDirection = firstExit;
        } else {
            effectiveLabel = cfg.label;
            dataDirection = cfg.label || undefined;
        }
    } else if (cfg.macroType === 'kierunek' && cfg.direction) {
        dataDirection = getShortDir(cfg.direction);
    } else {
        const dirKey = id.endsWith('-button') ? id.slice(0, id.length - '-button'.length) : '';
        dataDirection = FIXED_DIRECTION_KEYS.has(dirKey) ? dirKey : undefined;
    }

    const isDirectionButtonClass = cfg.macroType === 'kierunek' || cfg.macroType === 'specialExit';
    const isTextButtonClass = cfg.macroType !== 'kierunek';
    const isEmpty = cfg.macroType === 'empty' || !effectiveLabel;
    const useColorVars = cfg.macroType === 'kierunek' || (cfg.macroType === 'specialExit' && !!(effectiveActiveColor || cfg.syncWithDirections));

    return {
        label: isEmpty ? '' : effectiveLabel,
        color: effectiveColor,
        activeColor: effectiveActiveColor,
        isEmpty,
        isDirectionButtonClass,
        isTextButtonClass,
        useColorVars,
        dataDirection,
    };
}

/**
 * Shared, host-agnostic rewrite of the stock `MobileDirectionButtons` class
 * (see `src/web/scripts/mobileDirectionButtons.ts`) as a React component both
 * the stock UI and forge-ui mount. Renders the exact same DOM contract
 * (`#mobile-direction-buttons`, the ten direction buttons, `#buttons-toggle`,
 * the five sub-lists) the existing e2e suite already asserts against.
 *
 * Container-level drag (long-press-then-drag, orientation-aware saved
 * position) and per-button hold/tap disambiguation are kept fully imperative
 * (refs + closures, direct DOM mutation for transient classes like `dragging`/
 * `no-click`/`hold-glow`) — same rationale as `DesktopButtons`/
 * `MobileCommandRadial`: this is high-frequency gesture-timing state that
 * fighting React's render cycle would only make fragile. `collapsed` is real
 * React state (not transient — it should survive an unrelated re-render), with
 * the toggle-button-stays-in-place position compensation done in a
 * `useLayoutEffect` so it runs synchronously against the already-collapsed
 * layout, before paint.
 *
 * `left`/`top` on the container are never part of the JSX `style` object —
 * they're set only by imperative code (drag, saved-position restore, clamp).
 * React's `style` prop only touches the CSS properties it's given, so as long
 * as those two keys never appear there, nothing here can clobber them.
 */
export default function MobileDirectionButtons({ client, messageInputId = 'message-input' }: { client: Client; messageInputId?: string }) {
    const [settings, setSettings] = useState<Settings>(() => loadMobileButtonSettings());
    const [teamMode, setTeamMode] = useState(false);
    const [leaderMode, setLeaderMode] = useState(false);
    const [visible, setVisible] = useState(() => globalStorage.get('uiSettings')?.showButtons !== false);
    const [collapsed, setCollapsed] = useState(false);
    const [openListId, setOpenListId] = useState<ListId | null>(null);
    const [availableExits, setAvailableExits] = useState<Set<string>>(new Set());
    const [, forceUpdate] = useReducer((x) => x + 1, 0);

    const containerRef = useRef<HTMLDivElement | null>(null);
    const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
    const settingsRef = useRef(settings);
    settingsRef.current = settings;
    const hapticEnabledRef = useRef(getShellSettings().hapticFeedback !== false);
    const isMobileRef = useRef(window.innerWidth < 768);
    const orientationRef = useRef<Orientation>(getCurrentOrientation());
    const savedPositionsRef = useRef<Partial<Record<Orientation, StoredPosition>>>({});
    const viewportBaselineHeightsRef = useRef<Partial<Record<Orientation, number>>>({});
    const preCollapseLeftRef = useRef<number | null>(null);
    const pendingCollapseRef = useRef<{ toggleScreenX: number } | null>(null);

    const dragState = useRef({
        isDragging: false,
        longPressTimer: null as number | null,
        initialX: 0,
        initialY: 0,
        offsetX: 0,
        offsetY: 0,
        isScrolling: false,
        lastScrollTop: 0,
    });

    const buttonPressStart = useRef(new Map<string, PressStart>());
    const buttonDragged = useRef(new Set<string>());
    const buttonHoldGlowTimers = useRef(new Map<string, number>());

    const activeSet = useMemo(
        () => (leaderMode ? settings.leader : teamMode ? settings.team : settings.solo),
        [settings, teamMode, leaderMode],
    );

    useEffect(() => onShellSettingsChange((shell) => {
        hapticEnabledRef.current = shell.hapticFeedback !== false;
    }), []);

    useEffect(() => globalStorage.onChange('mobileButtonSettings', (next) => {
        if (next) setSettings(next);
    }), []);

    useEffect(() => globalStorage.onChange('uiSettings', (next) => {
        if (!next || !('showButtons' in next)) return;
        setVisible(next.showButtons !== false);
    }), []);

    const updateTeamMode = useCallback(() => {
        const leader = !!client.TeamManager.isLeader?.();
        const team = leader || !!client.TeamManager.isInAnyTeam?.();
        setLeaderMode(leader);
        setTeamMode(team);
    }, [client]);

    useEffect(() => {
        updateTeamMode();
    }, [updateTeamMode]);

    useClientEvent('teamChange', () => updateTeamMode());
    useClientEvent('gmcp.objects.nums', () => {
        updateTeamMode();
        forceUpdate();
    });
    useClientEvent('gmcp.objects.data', () => {
        updateTeamMode();
        forceUpdate();
    });
    useClientEvent('enterLocation', () => forceUpdate());
    useClientEvent('pluginButtonMacrosChanged', () => forceUpdate());
    useClientEvent('pluginButtonMacroStateChanged', () => forceUpdate());
    useClientEvent<{ exits?: string[] }>('gmcp.room.info', (detail) => {
        const exits = Array.isArray(detail?.exits) ? detail.exits : [];
        setAvailableExits(new Set(exits.map((e) => getShortDir(e))));
    });

    const scrollToBottom = useCallback(() => {
        const contentArea = document.getElementById(CONTENT_AREA_ID);
        if (!contentArea || !isMobileRef.current) return;
        setTimeout(() => {
            contentArea.scrollTop = contentArea.scrollHeight;
        }, 100);
    }, []);

    const updateViewportBaseline = useCallback((force = false) => {
        if (!isMobileRef.current && !force) return;
        const orientation = orientationRef.current;
        const currentHeight = Math.max(0, window.innerHeight || 0);
        if (currentHeight === 0) return;
        const existing = viewportBaselineHeightsRef.current[orientation];
        if (force || !existing || currentHeight > existing) {
            viewportBaselineHeightsRef.current[orientation] = currentHeight;
        }
    }, []);

    const getViewportHeightForClamp = useCallback(() => {
        if (!isMobileRef.current) return window.innerHeight;
        const baseline = viewportBaselineHeightsRef.current[orientationRef.current];
        return baseline && baseline > 0 ? baseline : window.innerHeight;
    }, []);

    const persistCurrentPosition = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const position: StoredPosition = { x: Math.round(rect.left), y: Math.round(rect.top), origin: DEFAULT_ORIGIN };
        const existing = savedPositionsRef.current[orientationRef.current];
        if (positionsEqual(existing ?? null, position)) return;
        savedPositionsRef.current = { ...savedPositionsRef.current, [orientationRef.current]: position };
        const toStore: Partial<Record<Orientation, StoredPosition>> = {};
        ORIENTATIONS.forEach((o) => {
            const v = savedPositionsRef.current[o];
            if (v) toStore[o] = v;
        });
        globalStorage.set('mobileButtonsPosition', toStore);
    }, []);

    const clampToView = useCallback((persist = false) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const fullyOutsideLeft = rect.right <= 0;
        const fullyOutsideRight = rect.left >= window.innerWidth;
        const viewportHeight = getViewportHeightForClamp();
        const fullyOutsideTop = rect.bottom <= 0;
        const fullyOutsideBottom = rect.top >= viewportHeight;
        const adjustHorizontal = fullyOutsideLeft || fullyOutsideRight;
        const adjustVertical = fullyOutsideTop || fullyOutsideBottom;

        if (!adjustHorizontal && !adjustVertical) {
            if (persist) persistCurrentPosition();
            return;
        }

        let left = parseInt(container.style.left, 10);
        let top = parseInt(container.style.top, 10);
        if (isNaN(left)) left = rect.left;
        if (isNaN(top)) top = rect.top;

        let clampedLeft = left;
        let clampedTop = top;
        if (adjustHorizontal) {
            const maxLeft = Math.max(5, window.innerWidth - container.offsetWidth - 5);
            clampedLeft = Math.min(Math.max(5, left), maxLeft);
        }
        if (adjustVertical) {
            const maxTop = viewportHeight - container.offsetHeight - 5;
            clampedTop = Math.min(Math.max(5, top), maxTop);
        }
        if (clampedLeft !== left || clampedTop !== top) {
            container.style.left = `${clampedLeft}px`;
            container.style.top = `${clampedTop}px`;
        }
        if (persist) persistCurrentPosition();
    }, [getViewportHeightForClamp, persistCurrentPosition]);

    const applySavedPosition = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        container.style.removeProperty('right');
        const saved = savedPositionsRef.current[orientationRef.current]
            || savedPositionsRef.current[getAlternateOrientation(orientationRef.current)];
        if (!saved) return;
        const rect = container.getBoundingClientRect();
        const width = rect.width || container.offsetWidth;
        const safeWidth = Number.isFinite(width) ? width : 0;
        let left = saved.x;
        if (saved.origin === 'right') {
            const fromLeft = window.innerWidth - safeWidth - saved.x;
            if (Number.isFinite(fromLeft)) left = fromLeft;
        }
        container.style.left = `${left}px`;
        container.style.top = `${saved.y}px`;
    }, []);

    const resetPosition = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        savedPositionsRef.current = {};
        globalStorage.remove('mobileButtonsPosition');
        container.style.removeProperty('left');
        container.style.removeProperty('top');
        container.style.removeProperty('right');
        preCollapseLeftRef.current = null;
        requestAnimationFrame(() => clampToView(false));
    }, [clampToView]);

    const dragStartFn = useCallback((x: number, y: number, preventDefault?: () => void) => {
        const container = containerRef.current;
        if (!container || settingsRef.current.locked) return;
        if (dragState.current.isScrolling) return;
        dragState.current.initialX = x;
        dragState.current.initialY = y;
        dragState.current.longPressTimer = window.setTimeout(() => {
            preventDefault?.();
            dragState.current.isDragging = true;
            container.classList.add('dragging');
            const rect = container.getBoundingClientRect();
            dragState.current.offsetX = rect.left;
            dragState.current.offsetY = rect.top;
            container.style.opacity = '0.8';
            buttonRefs.current.forEach((btn) => btn.classList.add('no-click'));
        }, DRAG_ACTIVATION_DURATION);
    }, []);

    const dragMoveFn = useCallback((x: number, y: number) => {
        const container = containerRef.current;
        if (!dragState.current.isDragging || !container) return;
        const deltaX = x - dragState.current.initialX;
        const deltaY = y - dragState.current.initialY;
        const newLeft = dragState.current.offsetX + deltaX;
        const newTop = dragState.current.offsetY + deltaY;
        const maxLeft = Math.max(5, window.innerWidth - container.offsetWidth - 5);
        const clampedLeft = Math.min(maxLeft, Math.max(5, newLeft));
        const clampedTop = Math.max(5, newTop);
        container.style.left = `${clampedLeft}px`;
        container.style.top = `${clampedTop}px`;
    }, []);

    const dragEndFn = useCallback((preventDefault?: () => void) => {
        if (dragState.current.longPressTimer !== null) {
            clearTimeout(dragState.current.longPressTimer);
            dragState.current.longPressTimer = null;
        }
        const container = containerRef.current;
        if (dragState.current.isDragging && container) {
            dragState.current.isDragging = false;
            container.classList.remove('dragging');
            container.style.opacity = '1';
            buttonRefs.current.forEach((btn) => btn.classList.remove('no-click'));
            preventDefault?.();
            clampToView(true);
        }
    }, [clampToView]);

    const handleContainerTouchStart = useCallback((e: TouchEvent) => {
        if (settingsRef.current.locked) return;
        const touch = e.touches[0];
        dragStartFn(touch.clientX, touch.clientY, () => e.preventDefault());
    }, [dragStartFn]);
    const handleContainerTouchMove = useCallback((e: TouchEvent) => {
        if (settingsRef.current.locked) return;
        e.preventDefault();
        const touch = e.touches[0];
        dragMoveFn(touch.clientX, touch.clientY);
    }, [dragMoveFn]);
    const handleContainerTouchEnd = useCallback((e: TouchEvent) => {
        if (settingsRef.current.locked) return;
        dragEndFn(() => e.preventDefault());
    }, [dragEndFn]);
    const handleContainerMouseDown = useCallback((e: MouseEvent) => {
        if (settingsRef.current.locked) return;
        if (e.button !== 0) return;
        dragStartFn(e.clientX, e.clientY);
    }, [dragStartFn]);
    const handleContainerMouseMove = useCallback((e: MouseEvent) => {
        if (settingsRef.current.locked) return;
        dragMoveFn(e.clientX, e.clientY);
    }, [dragMoveFn]);
    const handleContainerMouseUp = useCallback((e: MouseEvent) => {
        if (settingsRef.current.locked) return;
        dragEndFn(() => e.preventDefault());
    }, [dragEndFn]);

    // Container-level wiring: drag, scroll-cancels-longpress, orientation/
    // viewport tracking, keyboard-open scrolling, reset-position event.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const preventContextMenu = (e: Event) => e.preventDefault();
        container.addEventListener('contextmenu', preventContextMenu);

        container.style.removeProperty('right');
        const savedRaw = globalStorage.get('mobileButtonsPosition');
        if (savedRaw) {
            try {
                savedPositionsRef.current = normalizeSavedPositions(savedRaw);
            } catch {
                savedPositionsRef.current = {};
            }
        }
        orientationRef.current = getCurrentOrientation();
        applySavedPosition();
        const rafId = requestAnimationFrame(() => clampToView(true));

        container.addEventListener('touchstart', handleContainerTouchStart, { passive: false });
        container.addEventListener('touchmove', handleContainerTouchMove, { passive: false });
        container.addEventListener('touchend', handleContainerTouchEnd);
        container.addEventListener('touchcancel', handleContainerTouchEnd);
        container.addEventListener('mousedown', handleContainerMouseDown);
        document.addEventListener('mousemove', handleContainerMouseMove);
        document.addEventListener('mouseup', handleContainerMouseUp);

        const contentArea = document.getElementById(CONTENT_AREA_ID);
        dragState.current.lastScrollTop = contentArea?.scrollTop ?? 0;
        const handleScroll = () => {
            if (!contentArea) return;
            const currentScrollTop = contentArea.scrollTop;
            if (Math.abs(currentScrollTop - dragState.current.lastScrollTop) > 5) {
                dragState.current.isScrolling = true;
                if (dragState.current.longPressTimer) {
                    clearTimeout(dragState.current.longPressTimer);
                    dragState.current.longPressTimer = null;
                }
                window.setTimeout(() => {
                    dragState.current.isScrolling = false;
                }, 100);
            }
            dragState.current.lastScrollTop = currentScrollTop;
        };
        contentArea?.addEventListener('scroll', handleScroll);

        const handleResize = () => {
            isMobileRef.current = window.innerWidth < 768;
            const newOrientation = getCurrentOrientation();
            if (newOrientation !== orientationRef.current) {
                orientationRef.current = newOrientation;
                updateViewportBaseline(true);
                applySavedPosition();
            } else {
                updateViewportBaseline();
            }
            if (!viewportBaselineHeightsRef.current[orientationRef.current]) {
                updateViewportBaseline(true);
            }
            clampToView(true);
            scrollToBottom();
        };
        window.addEventListener('resize', handleResize);

        const messageInput = document.getElementById(messageInputId) as HTMLInputElement | HTMLTextAreaElement | null;
        const handleFocusIn = () => {
            scrollToBottom();
            setTimeout(() => messageInput?.select());
            setTimeout(() => scrollToBottom(), 300);
        };
        const handleInput = () => scrollToBottom();
        messageInput?.addEventListener('focusin', handleFocusIn);
        messageInput?.addEventListener('input', handleInput);
        const handleVisualViewportResize = () => scrollToBottom();
        window.visualViewport?.addEventListener('resize', handleVisualViewportResize);

        updateViewportBaseline(true);

        const offReset = eventBus.on('mobileButtonsResetPosition', resetPosition);

        return () => {
            cancelAnimationFrame(rafId);
            container.removeEventListener('contextmenu', preventContextMenu);
            container.removeEventListener('touchstart', handleContainerTouchStart);
            container.removeEventListener('touchmove', handleContainerTouchMove);
            container.removeEventListener('touchend', handleContainerTouchEnd);
            container.removeEventListener('touchcancel', handleContainerTouchEnd);
            container.removeEventListener('mousedown', handleContainerMouseDown);
            document.removeEventListener('mousemove', handleContainerMouseMove);
            document.removeEventListener('mouseup', handleContainerMouseUp);
            contentArea?.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleResize);
            messageInput?.removeEventListener('focusin', handleFocusIn);
            messageInput?.removeEventListener('input', handleInput);
            window.visualViewport?.removeEventListener('resize', handleVisualViewportResize);
            offReset();
        };
    }, [
        applySavedPosition, clampToView, handleContainerMouseDown, handleContainerMouseMove,
        handleContainerMouseUp, handleContainerTouchEnd, handleContainerTouchMove, handleContainerTouchStart,
        messageInputId, resetPosition, scrollToBottom, updateViewportBaseline,
    ]);

    // Collapse toggle — real state (it's a lasting UI choice, not a transient
    // gesture), with the toggle-button-stays-in-place compensation done here
    // once the DOM has actually committed the `collapsed` class, before paint.
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        if (collapsed) {
            const pending = pendingCollapseRef.current;
            const toggleId = activeSet.order.find((id) => (activeSet.buttons[id] ?? defaultSettings[id])?.macroType === 'toggleButtons');
            const toggleBtn = toggleId ? buttonRefs.current.get(toggleId) : undefined;
            if (pending && toggleBtn) {
                const newToggleX = toggleBtn.getBoundingClientRect().left;
                const delta = pending.toggleScreenX - newToggleX;
                if (delta !== 0) {
                    const left = container.getBoundingClientRect().left;
                    container.style.left = `${left + delta}px`;
                }
            }
            clampToView(false);
        } else {
            if (preCollapseLeftRef.current !== null) {
                container.style.left = `${preCollapseLeftRef.current}px`;
                preCollapseLeftRef.current = null;
            }
            clampToView(false);
        }
        pendingCollapseRef.current = null;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when collapsed itself flips
    }, [collapsed]);

    const requestToggleVisibility = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const toggleId = activeSet.order.find((id) => (activeSet.buttons[id] ?? defaultSettings[id])?.macroType === 'toggleButtons');
        const toggleBtn = toggleId ? buttonRefs.current.get(toggleId) : undefined;
        const toggleScreenX = toggleBtn?.getBoundingClientRect().left;
        setCollapsed((prev) => {
            if (!prev) {
                preCollapseLeftRef.current = container.getBoundingClientRect().left;
            }
            pendingCollapseRef.current = toggleScreenX !== undefined ? { toggleScreenX } : null;
            return !prev;
        });
    }, [activeSet]);

    const clearButtonGlow = useCallback((id: string, btn: HTMLButtonElement) => {
        const timer = buttonHoldGlowTimers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            buttonHoldGlowTimers.current.delete(id);
        }
        btn.classList.remove('hold-glow');
        btn.style.removeProperty('--hold-glow-color');
    }, []);

    const getCallbacks = useCallback((): MacroExecutorCallbacks => ({
        toggleList: (macroType) => setOpenListId((prev) => (prev === macroType ? null : macroType as ListId)),
        toggleVisibility: () => requestToggleVisibility(),
        updateMoveModeButton: (btn) => updateMoveModeLabel(btn, client.moveMode),
    }), [client, requestToggleVisibility]);

    const handleButtonTap = useCallback((cfg: MobileButtonSetting, e: React.MouseEvent<HTMLButtonElement>) => {
        if (hapticEnabledRef.current) navigator.vibrate?.(20);
        executeMacro(client, cfg.macroType, cfg, getCallbacks(), e.currentTarget);
    }, [client, getCallbacks]);

    const handleButtonPointerDown = useCallback((id: string, e: React.PointerEvent<HTMLButtonElement>, cfg: MobileButtonSetting) => {
        const btn = e.currentTarget;
        buttonPressStart.current.set(id, { time: Date.now(), x: e.clientX, y: e.clientY, cfg, btn });
        buttonDragged.current.delete(id);
        const existingGlowTimer = buttonHoldGlowTimers.current.get(id);
        if (existingGlowTimer) clearTimeout(existingGlowTimer);
        const glowTimer = window.setTimeout(() => {
            const bgColor = window.getComputedStyle(btn).backgroundColor;
            const rgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (rgbaMatch) {
                const [, r, g, b] = rgbaMatch;
                btn.style.setProperty('--hold-glow-color', `rgba(${r}, ${g}, ${b}, 0.7)`);
            }
            btn.classList.add('hold-glow');
            if (hapticEnabledRef.current) navigator.vibrate?.([50, 30, 50]);
        }, HOLD_DURATION);
        buttonHoldGlowTimers.current.set(id, glowTimer);
    }, []);

    const handleButtonPointerMove = useCallback((id: string, e: React.PointerEvent<HTMLButtonElement>) => {
        const pressStart = buttonPressStart.current.get(id);
        if (!pressStart) return;
        const elapsed = Date.now() - pressStart.time;
        const dx = Math.abs(e.clientX - pressStart.x);
        const dy = Math.abs(e.clientY - pressStart.y);
        const moved = dx > DRAG_MOVE_THRESHOLD || dy > DRAG_MOVE_THRESHOLD;
        if (moved && elapsed > DRAG_ACTIVATION_DURATION && !settingsRef.current.locked) {
            buttonDragged.current.add(id);
            clearButtonGlow(id, pressStart.btn);
        }
    }, [clearButtonGlow]);

    const handleButtonPointerUp = useCallback((id: string) => {
        const pressStart = buttonPressStart.current.get(id);
        if (pressStart) clearButtonGlow(id, pressStart.btn);
        buttonPressStart.current.delete(id);
        if (buttonDragged.current.has(id)) {
            buttonDragged.current.delete(id);
            return;
        }
        if (!pressStart) return;
        const elapsed = Date.now() - pressStart.time;
        const cfg = pressStart.cfg;
        if (elapsed >= HOLD_DURATION && cfg.hold?.macroType) {
            const hold = cfg.hold;
            const holdCfg: MobileButtonSetting = {
                ...cfg,
                macroType: hold.macroType,
                command: hold.command,
                direction: hold.direction,
                enemySlot: hold.enemySlot,
                pluginConfig: hold.pluginConfig,
                steps: hold.steps,
            };
            executeMacro(client, hold.macroType, holdCfg, getCallbacks(), pressStart.btn);
        } else {
            if (hapticEnabledRef.current) navigator.vibrate?.(20);
            executeMacro(client, cfg.macroType, cfg, getCallbacks(), pressStart.btn);
        }
    }, [client, clearButtonGlow, getCallbacks]);

    const handleButtonPointerCancel = useCallback((id: string) => {
        const pressStart = buttonPressStart.current.get(id);
        if (pressStart) clearButtonGlow(id, pressStart.btn);
        buttonPressStart.current.delete(id);
        buttonDragged.current.delete(id);
    }, [clearButtonGlow]);

    // moveMode buttons drive a single global `client.moveModeButton` reference
    // (read by client/scripts/moveMode.ts + carriage.ts to update the label on
    // keybind toggles and disable it during carriage mode) — preserved as-is;
    // `disabled` is intentionally never a JSX prop so carriage.ts's later direct
    // mutation of it isn't clobbered by an unrelated re-render.
    useLayoutEffect(() => {
        let moveModeBtn: HTMLButtonElement | undefined;
        activeSet.order.forEach((id) => {
            const cfg = activeSet.buttons[id] ?? defaultSettings[id];
            if (cfg?.macroType === 'moveMode') {
                const btn = buttonRefs.current.get(id);
                if (btn) moveModeBtn = btn;
            }
        });
        if (moveModeBtn) {
            client.moveModeButton = moveModeBtn;
            updateMoveModeLabel(moveModeBtn, client.moveMode);
            moveModeBtn.disabled = client.carriageMode;
        }
    }, [activeSet, client]);

    const buttonSize = settings.buttonSize ?? defaultButtonSize;
    const listItemFontSize = Math.max(6, Math.round(buttonSize * 0.20));

    const renderListItems = (listId: Exclude<ListId, 'idzList'>) => {
        const spec = LIST_ITEM_SPECS[listId];
        const objects = (client.ObjectManager?.getObjectsOnLocation?.() || []) as any[];
        const values = Array.from(new Set(objects.filter((o) => spec.regex.test(o.shortcut)).map((o) => o.shortcut as string)));
        return values.map((v) => (
            <button
                key={v}
                type="button"
                className="mobile-button"
                style={{ width: buttonSize, height: buttonSize, fontSize: listItemFontSize }}
                onClick={() => client.sendCommand(`/${spec.prefix} ${v}`)}
            >
                {v}
            </button>
        ));
    };

    const renderIdzItems = () => IDZ_COMMANDS.map((c) => (
        <button
            key={c.cmd}
            type="button"
            className="mobile-button"
            style={{ width: 72, height: buttonSize, fontSize: listItemFontSize }}
            onClick={() => client.sendCommand(c.cmd)}
        >
            {c.label}
        </button>
    ));

    const content = (
        <div
            id="mobile-direction-buttons"
            className={'mobile-direction-buttons' + (settings.locked ? ' drag-locked' : '') + (collapsed ? ' collapsed' : '')}
            data-drag-locked={settings.locked ? 'true' : undefined}
            ref={containerRef}
            style={{
                display: visible ? 'grid' : 'none',
                gridTemplateColumns: `repeat(${activeSet.cols}, auto)`,
                gap: `${settings.buttonGap ?? defaultButtonGap}px`,
                backgroundColor: activeSet.background,
                boxShadow: computeBoxShadow(activeSet.background),
            }}
        >
            {activeSet.order.map((id) => {
                const cfg: MobileButtonSetting = activeSet.buttons[id] || defaultSettings[id] || emptyButton;
                const visual = computeButtonVisual(id, cfg, activeSet.buttons, client);
                const hasHold = !!cfg.holdEnabled && !!cfg.hold?.macroType;
                const isExitAvailable = !!visual.dataDirection && availableExits.has(visual.dataDirection);
                const fontSize = visual.isTextButtonClass ? Math.max(6, Math.round(buttonSize * 0.20)) : Math.round(buttonSize * 0.35);
                const isListToggleActive = openListId !== null && cfg.macroType === openListId;
                const label = cfg.macroType === 'toggleButtons' ? (collapsed ? '⇧' : '⇩') : visual.label;

                const className = [
                    'mobile-button',
                    visual.isTextButtonClass && 'mobile-button-text',
                    visual.isDirectionButtonClass && 'direction-button',
                    isExitAvailable && 'exit-available',
                    visual.isEmpty && 'empty',
                    isListToggleActive && 'active',
                ].filter(Boolean).join(' ');

                const style: CSSVarStyle = { width: buttonSize, height: buttonSize, fontSize };
                if (visual.isEmpty) {
                    style.backgroundColor = 'transparent';
                    style.border = 'none';
                    style.color = '';
                } else {
                    style.backgroundColor = visual.color;
                    style.color = cfg.fontColor || defaultFontColor;
                    if (visual.useColorVars) {
                        style['--color'] = visual.color;
                        style['--active-color'] = visual.activeColor || '#2fa7c5';
                    }
                }

                return (
                    <button
                        key={id}
                        id={id}
                        type="button"
                        data-button-id={id}
                        data-direction={visual.dataDirection}
                        data-move-mode-label={cfg.macroType === 'moveMode' ? (cfg.label || '') : undefined}
                        className={className}
                        style={style}
                        ref={(el) => {
                            if (el) buttonRefs.current.set(id, el);
                            else buttonRefs.current.delete(id);
                        }}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={!hasHold ? (e) => handleButtonTap(cfg, e) : undefined}
                        onPointerDown={hasHold ? (e) => handleButtonPointerDown(id, e, cfg) : undefined}
                        onPointerMove={hasHold ? (e) => handleButtonPointerMove(id, e) : undefined}
                        onPointerUp={hasHold ? () => handleButtonPointerUp(id) : undefined}
                        onPointerCancel={hasHold ? () => handleButtonPointerCancel(id) : undefined}
                        onPointerLeave={hasHold ? () => handleButtonPointerCancel(id) : undefined}
                    >
                        {label}
                    </button>
                );
            })}
            <div
                id="z-buttons-list"
                className="mobile-z-buttons"
                style={{ display: openListId === 'zList' ? 'grid' : 'none', gridAutoRows: `${buttonSize}px` }}
            >
                {openListId === 'zList' && renderListItems('zList')}
            </div>
            <div
                id="zas-buttons-list"
                className="mobile-z-buttons"
                style={{ display: openListId === 'zaList' ? 'grid' : 'none', gridAutoRows: `${buttonSize}px` }}
            >
                {openListId === 'zaList' && renderListItems('zaList')}
            </div>
            <div
                id="w-buttons-list"
                className="mobile-z-buttons"
                style={{ display: openListId === 'wList' ? 'grid' : 'none', gridAutoRows: `${buttonSize}px` }}
            >
                {openListId === 'wList' && renderListItems('wList')}
            </div>
            <div
                id="prze-buttons-list"
                className="mobile-z-buttons"
                style={{ display: openListId === 'przeList' ? 'grid' : 'none', gridAutoRows: `${buttonSize}px` }}
            >
                {openListId === 'przeList' && renderListItems('przeList')}
            </div>
            <div
                id="idz-buttons-list"
                className="mobile-idz-buttons"
                style={{ display: openListId === 'idzList' ? 'grid' : 'none', gridAutoRows: `${buttonSize}px` }}
            >
                {openListId === 'idzList' && renderIdzItems()}
            </div>
        </div>
    );

    return createPortal(content, document.body);
}
