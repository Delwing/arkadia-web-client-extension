import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type Client from '@client/Client';
import { getButtonMacroDisplayInfo, isStatefulMacro } from '@modules/core/pluginButtonMacroRegistry';
import {
    loadSettings as loadDesktopButtonSettings,
    saveSettings,
    hexToRgba,
    type DesktopButtonsSettings,
} from '@web/desktopButtonSettings';
import type { DesktopButtonSetting, ListGrowDirection, ListPosition } from '@web/buttonSettings';
import { executeMacro, updateMoveModeLabel, type MacroExecutorCallbacks } from '@web/scripts/buttonMacroExecutor';
import { useClientEvent } from '../hooks';

const LONG_PRESS_DURATION = 1000; // ms for drag activation
const HOLD_THRESHOLD = 500; // ms determines tap vs hold
const DRAG_MOVE_THRESHOLD = 10; // px to consider as movement

type PressStart = { time: number; x: number; y: number; settings: DesktopButtonSetting; btn: HTMLButtonElement };

/**
 * Shared, host-agnostic rewrite of the stock `DesktopButtons` class (see
 * `src/web/scripts/desktopButtons.ts`) as a React component both the stock UI
 * and forge-ui mount. Renders the exact same DOM contract (`#desktop-buttons-container`,
 * `.desktop-button`, `.desktop-button-list`) the existing e2e suite
 * (`e2e/attack-all-button.spec.ts`, `e2e/compound-macro-desktop.spec.ts`)
 * already asserts against, so those specs keep passing unchanged.
 *
 * Gesture/drag/hold state (press timing, drag offsets, glow timers) is kept in
 * refs rather than React state — it's high-frequency and purely visual/imperative,
 * mirroring the original class's instance fields; only settings and which
 * list-popup is open are React state, since those actually drive what renders.
 */
export default function DesktopButtons({ client }: { client: Client }) {
    const [settings, setSettings] = useState<DesktopButtonsSettings>(() => loadDesktopButtonSettings());
    const [activeListButtonId, setActiveListButtonId] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement | null>(null);
    const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
    const listRefs = useRef(new Map<string, HTMLDivElement>());
    const settingsRef = useRef(settings);
    settingsRef.current = settings;
    const activeListButtonIdRef = useRef(activeListButtonId);
    activeListButtonIdRef.current = activeListButtonId;

    // Drag state.
    const dragState = useRef<{
        isDragging: boolean;
        dragButtonId: string | null;
        offsetX: number;
        offsetY: number;
        initialX: number;
        initialY: number;
        longPressTimer: number | null;
    }>({ isDragging: false, dragButtonId: null, offsetX: 0, offsetY: 0, initialX: 0, initialY: 0, longPressTimer: null });

    // Hold-action state (tap-vs-hold disambiguation via press/release timing).
    const buttonPressStart = useRef(new Map<string, PressStart>());
    const buttonDragged = useRef(new Set<string>());
    const buttonHoldGlowTimers = useRef(new Map<string, number>());

    useClientEvent<unknown>('desktopButtonsSettings', (newSettings) => {
        setSettings(newSettings as DesktopButtonsSettings);
    });
    useClientEvent('pluginButtonMacrosChanged', () => setSettings((s) => ({ ...s })));
    useClientEvent('pluginButtonMacroStateChanged', () => setSettings((s) => ({ ...s })));

    const hideAllLists = useCallback(() => {
        setActiveListButtonId(null);
    }, []);

    const positionListContainer = useCallback((buttonId: string, btnSettings: DesktopButtonSetting) => {
        const btn = buttonRefs.current.get(buttonId);
        const listContainer = listRefs.current.get(buttonId);
        if (!btn || !listContainer) return;

        const btnRect = btn.getBoundingClientRect();
        const listPosition: ListPosition = btnSettings.listPosition ?? 'bottom';
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

        left = Math.max(5, Math.min(left, window.innerWidth - listContainer.offsetWidth - 5));
        top = Math.max(5, Math.min(top, window.innerHeight - listContainer.offsetHeight - 5));
        listContainer.style.left = `${left}px`;
        listContainer.style.top = `${top}px`;
    }, []);

    const toggleList = useCallback((buttonId: string, btnSettings: DesktopButtonSetting) => {
        const wasOpen = activeListButtonIdRef.current === buttonId;
        setActiveListButtonId(wasOpen ? null : buttonId);
        if (!wasOpen) {
            requestAnimationFrame(() => positionListContainer(buttonId, btnSettings));
        }
    }, [positionListContainer]);

    const getCallbacks = useCallback((btnSettings?: DesktopButtonSetting, e?: MouseEvent): MacroExecutorCallbacks => ({
        toggleList: () => {
            if (e && btnSettings) {
                e.stopPropagation();
                toggleList(btnSettings.id, btnSettings);
            }
        },
        updateMoveModeButton: (btn: HTMLButtonElement) => {
            updateMoveModeLabel(btn, client.moveMode);
        },
    }), [client, toggleList]);

    const clearGlow = useCallback((buttonId: string, btn: HTMLButtonElement) => {
        const glowTimer = buttonHoldGlowTimers.current.get(buttonId);
        if (glowTimer) {
            clearTimeout(glowTimer);
            buttonHoldGlowTimers.current.delete(buttonId);
        }
        btn.classList.remove('hold-glow');
        btn.style.removeProperty('--hold-glow-color');
    }, []);

    const armHoldDetection = useCallback((btnSettings: DesktopButtonSetting, btn: HTMLButtonElement, x: number, y: number) => {
        if (!btnSettings.holdEnabled || !btnSettings.hold?.macroType) return;

        buttonPressStart.current.set(btnSettings.id, { time: Date.now(), x, y, settings: btnSettings, btn });
        buttonDragged.current.delete(btnSettings.id);

        const existingGlowTimer = buttonHoldGlowTimers.current.get(btnSettings.id);
        if (existingGlowTimer) clearTimeout(existingGlowTimer);

        const glowTimer = window.setTimeout(() => {
            const bgColor = window.getComputedStyle(btn).backgroundColor;
            const rgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (rgbaMatch) {
                const [, r, g, b] = rgbaMatch;
                btn.style.setProperty('--hold-glow-color', `rgba(${r}, ${g}, ${b}, 0.7)`);
            }
            btn.classList.add('hold-glow');
            navigator.vibrate?.([50, 30, 50]);
        }, HOLD_THRESHOLD);
        buttonHoldGlowTimers.current.set(btnSettings.id, glowTimer);
    }, []);

    const resolveHoldOrTapRelease = useCallback(() => {
        buttonPressStart.current.forEach((pressStart, buttonId) => {
            const btnSettings = pressStart.settings;
            const btn = pressStart.btn;
            clearGlow(buttonId, btn);

            if (buttonDragged.current.has(buttonId)) {
                buttonDragged.current.delete(buttonId);
                buttonPressStart.current.delete(buttonId);
                return;
            }

            const elapsed = Date.now() - pressStart.time;
            buttonPressStart.current.delete(buttonId);

            if (elapsed >= HOLD_THRESHOLD && btnSettings.hold?.macroType) {
                const hold = btnSettings.hold;
                const holdConfig = {
                    ...btnSettings,
                    macroType: hold.macroType,
                    command: hold.command,
                    direction: hold.direction,
                    enemySlot: hold.enemySlot,
                    pluginConfig: hold.pluginConfig,
                    steps: hold.steps,
                };
                executeMacro(client, hold.macroType, holdConfig, getCallbacks(btnSettings), btn);
            } else {
                executeMacro(client, btnSettings.macroType, btnSettings, getCallbacks(btnSettings), btn);
            }
        });
    }, [client, clearGlow, getCallbacks]);

    const startLongPress = useCallback((clientX: number, clientY: number, btn: HTMLButtonElement, buttonId: string) => {
        const ds = dragState.current;
        if (ds.longPressTimer !== null) {
            clearTimeout(ds.longPressTimer);
            ds.longPressTimer = null;
        }
        ds.initialX = clientX;
        ds.initialY = clientY;
        ds.longPressTimer = window.setTimeout(() => {
            ds.isDragging = true;
            ds.dragButtonId = buttonId;
            const rect = btn.getBoundingClientRect();
            ds.offsetX = ds.initialX - rect.left;
            ds.offsetY = ds.initialY - rect.top;
            btn.classList.add('dragging');
            btn.style.zIndex = '10000';
            btn.style.opacity = '0.85';
            hideAllLists();
        }, LONG_PRESS_DURATION);
    }, [hideAllLists]);

    const updateDragPosition = useCallback((clientX: number, clientY: number) => {
        const ds = dragState.current;
        const btn = ds.dragButtonId ? buttonRefs.current.get(ds.dragButtonId) : null;
        if (!btn) return;
        const newX = clientX - ds.offsetX;
        const newY = clientY - ds.offsetY;
        const maxX = window.innerWidth - btn.offsetWidth - 5;
        const maxY = window.innerHeight - btn.offsetHeight - 5;
        btn.style.left = `${Math.min(maxX, Math.max(5, newX))}px`;
        btn.style.top = `${Math.min(maxY, Math.max(5, newY))}px`;
    }, []);

    const endDrag = useCallback(() => {
        const ds = dragState.current;
        if (ds.longPressTimer !== null) {
            clearTimeout(ds.longPressTimer);
            ds.longPressTimer = null;
        }
        if (ds.dragButtonId) {
            buttonPressStart.current.delete(ds.dragButtonId);
            buttonDragged.current.delete(ds.dragButtonId);
        }

        if (ds.isDragging && ds.dragButtonId) {
            const btn = buttonRefs.current.get(ds.dragButtonId);
            if (btn) {
                const newX = parseInt(btn.style.left, 10) || 0;
                const newY = parseInt(btn.style.top, 10) || 0;
                const dragButtonId = ds.dragButtonId;
                setSettings((prev) => {
                    const next = { ...prev, buttons: prev.buttons.map((b) => (b.id === dragButtonId ? { ...b, x: newX, y: newY } : b)) };
                    saveSettings(next);
                    return next;
                });
                btn.classList.remove('dragging');
                btn.style.zIndex = '';
                btn.style.opacity = '';
            }
        }

        setTimeout(() => {
            ds.isDragging = false;
            ds.dragButtonId = null;
        }, 50);
    }, []);

    // Global pointer handlers — mirrors the class's document-level listeners.
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            buttonPressStart.current.forEach((pressStart, buttonId) => {
                const elapsed = Date.now() - pressStart.time;
                const dx = Math.abs(e.clientX - pressStart.x);
                const dy = Math.abs(e.clientY - pressStart.y);
                const moved = dx > DRAG_MOVE_THRESHOLD || dy > DRAG_MOVE_THRESHOLD;
                if (moved && elapsed > LONG_PRESS_DURATION && !settingsRef.current.locked) {
                    buttonDragged.current.add(buttonId);
                    clearGlow(buttonId, pressStart.btn);
                }
            });
            const ds = dragState.current;
            if (!ds.isDragging || !ds.dragButtonId) return;
            e.preventDefault();
            updateDragPosition(e.clientX, e.clientY);
        };
        const handleMouseUp = () => {
            resolveHoldOrTapRelease();
            endDrag();
        };
        const handleTouchMove = (e: TouchEvent) => {
            const touch = e.touches[0];
            buttonPressStart.current.forEach((pressStart, buttonId) => {
                const elapsed = Date.now() - pressStart.time;
                const dx = Math.abs(touch.clientX - pressStart.x);
                const dy = Math.abs(touch.clientY - pressStart.y);
                const moved = dx > DRAG_MOVE_THRESHOLD || dy > DRAG_MOVE_THRESHOLD;
                if (moved && elapsed > LONG_PRESS_DURATION && !settingsRef.current.locked) {
                    buttonDragged.current.add(buttonId);
                    clearGlow(buttonId, pressStart.btn);
                }
            });
            const ds = dragState.current;
            if (!ds.isDragging || !ds.dragButtonId) return;
            e.preventDefault();
            updateDragPosition(touch.clientX, touch.clientY);
        };
        const handleTouchEnd = () => {
            resolveHoldOrTapRelease();
            endDrag();
        };
        const handleOutsideClick = (e: MouseEvent) => {
            const activeId = activeListButtonIdRef.current;
            if (!activeId) return;
            const activeButtonSettings = settingsRef.current.buttons.find((b) => b.id === activeId);
            if (activeButtonSettings?.listCloseOnlyByButton) return;
            const target = e.target as HTMLElement;
            const listContainer = listRefs.current.get(activeId);
            const button = buttonRefs.current.get(activeId);
            if (listContainer && button && !listContainer.contains(target) && !button.contains(target)) {
                hideAllLists();
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd);
        document.addEventListener('touchcancel', handleTouchEnd);
        document.addEventListener('click', handleOutsideClick);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
            document.removeEventListener('touchcancel', handleTouchEnd);
            document.removeEventListener('click', handleOutsideClick);
        };
    }, [clearGlow, endDrag, hideAllLists, resolveHoldOrTapRelease, updateDragPosition]);

    // moveMode buttons show "label mode-suffix" (e.g. "Ruch zwykly"); the suffix
    // comes from client.moveMode, not settings, so it's applied imperatively here
    // — same as the original class did once at button creation — rather than
    // threaded through as React state for a value React doesn't own. Layout
    // effect (not a plain effect) so it lands before paint — no flash of the
    // un-suffixed label on first render or after a settings change.
    useLayoutEffect(() => {
        for (const btnSettings of settings.buttons) {
            if (btnSettings.macroType !== 'moveMode') continue;
            const btn = buttonRefs.current.get(btnSettings.id);
            if (btn) updateMoveModeLabel(btn, client.moveMode);
        }
    }, [settings, client]);

    const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>, btnSettings: DesktopButtonSetting) => {
        if (dragState.current.isDragging) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (btnSettings.holdEnabled && btnSettings.hold?.macroType) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (buttonDragged.current.has(btnSettings.id)) {
            e.preventDefault();
            e.stopPropagation();
            buttonDragged.current.delete(btnSettings.id);
            return;
        }
        executeMacro(client, btnSettings.macroType, btnSettings, getCallbacks(btnSettings, e.nativeEvent), e.currentTarget);
    }, [client, getCallbacks]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>, btnSettings: DesktopButtonSetting) => {
        if (e.button !== 0) return;
        const btn = e.currentTarget;
        armHoldDetection(btnSettings, btn, e.clientX, e.clientY);
        if (settingsRef.current.locked) return;
        startLongPress(e.clientX, e.clientY, btn, btnSettings.id);
    }, [armHoldDetection, startLongPress]);

    const handleTouchStart = useCallback((e: React.TouchEvent<HTMLButtonElement>, btnSettings: DesktopButtonSetting) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const btn = e.currentTarget;
        if (btnSettings.holdEnabled && btnSettings.hold?.macroType) {
            // Prevent synthetic mouse events from double-firing the macro.
            e.preventDefault();
        }
        armHoldDetection(btnSettings, btn, touch.clientX, touch.clientY);
        if (settingsRef.current.locked) return;
        startLongPress(touch.clientX, touch.clientY, btn, btnSettings.id);
    }, [armHoldDetection, startLongPress]);

    const displayFor = useCallback((btnSettings: DesktopButtonSetting): { label: string; color: string } => {
        let label = btnSettings.label;
        let color = btnSettings.color;
        if (btnSettings.macroType.startsWith('plugin:') && isStatefulMacro(btnSettings.macroType)) {
            const customOverrides = {
                labels: btnSettings.pluginConfig?.stateLabels as Record<string, string> | undefined,
                colors: btnSettings.pluginConfig?.stateColors as Record<string, string> | undefined,
            };
            const displayInfo = getButtonMacroDisplayInfo(btnSettings.macroType, customOverrides);
            if (displayInfo) {
                if (displayInfo.stateLabel) {
                    label = btnSettings.label ? `${btnSettings.label} ${displayInfo.stateLabel}` : displayInfo.stateLabel;
                }
                if (displayInfo.color) color = displayInfo.color;
            }
        }
        return { label, color };
    }, []);

    const listItemCommands = useMemo(() => ({
        zList: { regex: /^[0-9]+$/, prefix: 'z' },
        zaList: { regex: /^[A-Z]$/, prefix: 'zas' },
        wList: { regex: /^[A-Z]$/, prefix: 'w' },
        przeList: { regex: /^[0-9]+$/, prefix: 'prze' },
    } as const), []);

    const renderListContent = (btnSettings: DesktopButtonSetting) => {
        if (btnSettings.macroType === 'idzList') {
            const cmds = [
                { label: 'niespiesznie', cmd: 'idz niespiesznie' },
                { label: 'marszem', cmd: 'idz marszem' },
                { label: 'truchtem', cmd: 'idz truchtem' },
                { label: 'biegiem', cmd: 'idz biegiem' },
                { label: 's. biegiem', cmd: 'idz szybkim biegiem' },
            ];
            return cmds.map((c) => (
                <button
                    key={c.cmd}
                    type="button"
                    className="desktop-button-list-item"
                    style={listItemStyle(btnSettings)}
                    onClick={(e) => {
                        e.stopPropagation();
                        client.sendCommand(c.cmd);
                        hideAllLists();
                    }}
                >
                    {c.label}
                </button>
            ));
        }

        const spec = listItemCommands[btnSettings.macroType as keyof typeof listItemCommands];
        if (!spec) return null;
        const objects = client.ObjectManager?.getObjectsOnLocation?.() || [];
        const values = Array.from(new Set(
            objects.filter((o: any) => spec.regex.test(o.shortcut)).map((o: any) => o.shortcut as string),
        ));
        return values.map((v) => (
            <button
                key={v}
                type="button"
                className="desktop-button-list-item"
                style={listItemStyle(btnSettings)}
                onClick={(e) => {
                    e.stopPropagation();
                    client.sendCommand(`/${spec.prefix} ${v}`);
                    hideAllLists();
                }}
            >
                {v}
            </button>
        ));
    };

    const content = (
        <div
            id="desktop-buttons-container"
            className={'desktop-buttons-container' + (settings.locked ? ' drag-locked' : '')}
            ref={containerRef}
        >
            {settings.buttons.map((btnSettings) => {
                const { label, color } = displayFor(btnSettings);
                const isListButton = ['zList', 'zaList', 'wList', 'przeList', 'idzList'].includes(btnSettings.macroType);
                const isOpen = activeListButtonId === btnSettings.id;
                return (
                    <div key={btnSettings.id} style={{ display: 'contents' }}>
                        <button
                            id={btnSettings.id}
                            data-button-id={btnSettings.id}
                            className={'desktop-button' + (isOpen ? ' active' : '')}
                            ref={(el) => {
                                if (el) buttonRefs.current.set(btnSettings.id, el);
                                else buttonRefs.current.delete(btnSettings.id);
                            }}
                            style={{
                                left: btnSettings.x,
                                top: btnSettings.y,
                                width: btnSettings.width,
                                height: btnSettings.height,
                                backgroundColor: hexToRgba(color, btnSettings.backgroundOpacity),
                                color: btnSettings.fontColor,
                                fontSize: btnSettings.fontSize,
                            }}
                            data-move-mode-label={btnSettings.macroType === 'moveMode' ? (btnSettings.label || '') : undefined}
                            onClick={(e) => handleClick(e, btnSettings)}
                            onMouseDown={(e) => handleMouseDown(e, btnSettings)}
                            onTouchStart={(e) => handleTouchStart(e, btnSettings)}
                            onContextMenu={(e) => e.preventDefault()}
                        >
                            {label}
                        </button>
                        {isListButton && (
                            <div
                                className="desktop-button-list"
                                data-for-button={btnSettings.id}
                                ref={(el) => {
                                    if (el) listRefs.current.set(btnSettings.id, el);
                                    else listRefs.current.delete(btnSettings.id);
                                }}
                                style={{
                                    display: isOpen ? 'flex' : 'none',
                                    flexDirection: (btnSettings.listGrowDirection ?? 'horizontal' as ListGrowDirection) === 'horizontal' ? 'row' : 'column',
                                }}
                            >
                                {isOpen && renderListContent(btnSettings)}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    return createPortal(content, document.body);
}

function listItemStyle(settings: DesktopButtonSetting): React.CSSProperties {
    return {
        boxSizing: 'border-box',
        width: settings.width,
        height: settings.height,
        padding: 0,
        margin: 0,
        backgroundColor: hexToRgba(settings.color, settings.backgroundOpacity),
        color: settings.fontColor,
        fontSize: settings.fontSize,
        border: '1px solid rgba(160, 208, 224, 0.6)',
        borderRadius: 4,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.25)',
        cursor: 'pointer',
        flexShrink: 0,
    };
}
