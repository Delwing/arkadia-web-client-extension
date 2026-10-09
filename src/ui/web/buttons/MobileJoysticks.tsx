import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type Client from '@client/Client';
import { globalStorage } from '@modules/core/storage';
import { getShellSettings } from '@modules/core/settings';
import { loadSettings } from '@web/mobileButtonSettings';
import { executeMacro } from '@web/scripts/buttonMacroExecutor';
import { specialExitAt } from '@client/scripts/directionBinds.ts';
import {
    JOYSTICK_DIRECTIONS,
    directionAngle,
    joystickMacro,
    parseJoystickSettings,
    pickJoystickDirection,
    type JoystickDirection,
    type JoystickSetting,
    type JoystickSettings,
} from '@web/joystickSettings';

/** Hold still this long to show every command around the joystick (and, unlocked, to start moving it). */
const LONG_PRESS_DELAY = 600;
/** How long the command tags stay up after a long press is released. */
const PEEK_LINGER = 1500;
const EDGE_MARGIN = 4;
const TAG_GAP = 22;

type Orientation = 'portrait' | 'landscape';
type Point = { x: number; y: number };
type Positions = Record<string, Partial<Record<Orientation, Point>>>;
type Viewport = { width: number; height: number };

function currentViewport(): Viewport {
    return { width: window.innerWidth, height: window.innerHeight };
}

function orientationOf(viewport: Viewport): Orientation {
    return viewport.height >= viewport.width ? 'portrait' : 'landscape';
}

function loadPositions(): Positions {
    const raw = globalStorage.get('mobileJoystickPositions');
    return raw && typeof raw === 'object' ? raw : {};
}

function clampCenter(center: Point, size: number, viewport: Viewport): Point {
    const r = size / 2 + EDGE_MARGIN;
    return {
        x: Math.min(Math.max(center.x, r), Math.max(r, viewport.width - r)),
        y: Math.min(Math.max(center.y, r), Math.max(r, viewport.height - r)),
    };
}

/** Unplaced joysticks stack up from the bottom-right corner, clear of the command line. */
function defaultCenters(items: JoystickSetting[], viewport: Viewport): Point[] {
    let bottom = viewport.height - 120;
    return items.map((item) => {
        const center = { x: viewport.width - item.size / 2 - 16, y: bottom - item.size / 2 };
        bottom -= item.size + 16;
        return center;
    });
}

function resolveCenter(item: JoystickSetting, positions: Positions, fallback: Point, viewport: Viewport): Point {
    const orientation = orientationOf(viewport);
    const stored = positions[item.id];
    const fraction = stored?.[orientation] ?? stored?.[orientation === 'portrait' ? 'landscape' : 'portrait'];
    const center = fraction && Number.isFinite(fraction.x) && Number.isFinite(fraction.y)
        ? { x: fraction.x * viewport.width, y: fraction.y * viewport.height }
        : fallback;
    return clampCenter(center, item.size, viewport);
}

type Gesture = {
    pointerId: number;
    start: Point;
    /** press → swipe once past the dead zone; held → drag once moved after a long press. */
    mode: 'press' | 'swipe' | 'held' | 'drag';
    timer: number | null;
    dragOrigin: Point;
    direction: JoystickDirection | null;
};

function Joystick({ item, center, locked, describe, onSend, onMove, onMoved }: {
    item: JoystickSetting;
    center: Point;
    locked: boolean;
    /** What a slot shows: the command, or a built-in action's name. */
    describe: (value: string) => string;
    onSend: (command: string) => void;
    onMove: (id: string, center: Point) => void;
    onMoved: (id: string, center: Point) => void;
}) {
    const [direction, setDirection] = useState<JoystickDirection | null>(null);
    const [knob, setKnob] = useState<Point>({ x: 0, y: 0 });
    const [peek, setPeek] = useState(false);
    const [dragging, setDragging] = useState(false);
    const gesture = useRef<Gesture | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const peekTimer = useRef<number | null>(null);
    const centerRef = useRef(center);
    centerRef.current = center;

    const radius = item.size / 2;
    const deadZone = Math.max(12, item.size * 0.18);
    const configured = JOYSTICK_DIRECTIONS.filter((dir) => item.commands[dir]);

    useEffect(() => () => {
        if (gesture.current?.timer) window.clearTimeout(gesture.current.timer);
        if (peekTimer.current) window.clearTimeout(peekTimer.current);
    }, []);

    const showPeek = () => {
        if (peekTimer.current) window.clearTimeout(peekTimer.current);
        peekTimer.current = null;
        setPeek(true);
    };

    const hidePeekLater = () => {
        if (peekTimer.current) window.clearTimeout(peekTimer.current);
        peekTimer.current = window.setTimeout(() => setPeek(false), PEEK_LINGER);
    };

    const finish = (send: boolean) => {
        const g = gesture.current;
        if (!g) return;
        if (g.timer) window.clearTimeout(g.timer);
        gesture.current = null;
        if (g.mode === 'drag') {
            onMoved(item.id, centerRef.current);
        } else if (send && g.mode === 'swipe' && g.direction) {
            onSend(item.commands[g.direction]!);
        } else if (send && g.mode === 'press' && item.center) {
            onSend(item.center);
        }
        if (g.mode === 'held' || g.mode === 'drag') hidePeekLater();
        setDirection(null);
        setKnob({ x: 0, y: 0 });
        setDragging(false);
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (gesture.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const g: Gesture = {
            pointerId: event.pointerId,
            start: { x: event.clientX, y: event.clientY },
            mode: 'press',
            timer: null,
            dragOrigin: centerRef.current,
            direction: null,
        };
        g.timer = window.setTimeout(() => {
            g.timer = null;
            if (gesture.current !== g || g.mode !== 'press') return;
            g.mode = 'held';
            showPeek();
        }, LONG_PRESS_DELAY);
        gesture.current = g;
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const g = gesture.current;
        if (!g || g.pointerId !== event.pointerId) return;
        const dx = event.clientX - g.start.x;
        const dy = event.clientY - g.start.y;

        if (g.mode === 'held' && !locked && Math.hypot(dx, dy) > 6) {
            g.mode = 'drag';
            setDragging(true);
        }
        if (g.mode === 'drag') {
            onMove(item.id, { x: g.dragOrigin.x + dx, y: g.dragOrigin.y + dy });
            return;
        }
        if (g.mode === 'press' && Math.hypot(dx, dy) >= deadZone) {
            if (g.timer) window.clearTimeout(g.timer);
            g.timer = null;
            g.mode = 'swipe';
        }
        // A locked long press keeps the tags up and still swipes.
        if (g.mode === 'held' && Math.hypot(dx, dy) >= deadZone) g.mode = 'swipe';
        if (g.mode !== 'swipe') return;

        const travel = Math.min(Math.hypot(dx, dy), radius * 0.55);
        const angle = Math.atan2(dy, dx);
        setKnob({ x: Math.cos(angle) * travel, y: Math.sin(angle) * travel });
        const next = pickJoystickDirection(dx, dy, deadZone, item.commands);
        if (next !== g.direction) {
            if (next && getShellSettings().hapticFeedback !== false) navigator.vibrate?.(10);
            g.direction = next;
            setDirection(next);
        }
    };

    const tagsVisible = peek || direction !== null;
    const label = item.label || (item.center ? describe(item.center) : '');

    // Tags of a joystick parked by the screen edge would run off it; nudge them back in.
    useLayoutEffect(() => {
        if (!tagsVisible || !rootRef.current) return;
        rootRef.current.querySelectorAll<HTMLElement>('.mobile-joystick__tag').forEach((tag) => {
            tag.style.marginLeft = '';
            tag.style.marginTop = '';
            const rect = tag.getBoundingClientRect();
            const overRight = rect.right - (window.innerWidth - EDGE_MARGIN);
            const overBottom = rect.bottom - (window.innerHeight - EDGE_MARGIN);
            if (overRight > 0) tag.style.marginLeft = `${-overRight}px`;
            else if (rect.left < EDGE_MARGIN) tag.style.marginLeft = `${EDGE_MARGIN - rect.left}px`;
            if (overBottom > 0) tag.style.marginTop = `${-overBottom}px`;
            else if (rect.top < EDGE_MARGIN) tag.style.marginTop = `${EDGE_MARGIN - rect.top}px`;
        });
    });

    return (
        <div
            ref={rootRef}
            className={'mobile-joystick' + (direction ? ' mobile-joystick--active' : '') + (dragging ? ' mobile-joystick--dragging' : '')}
            data-joystick-id={item.id}
            data-direction={direction ?? undefined}
            style={{
                left: center.x - radius,
                top: center.y - radius,
                width: item.size,
                height: item.size,
                '--joystick-color': item.color,
                '--joystick-font-color': item.fontColor,
            } as React.CSSProperties}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => finish(true)}
            onPointerCancel={() => finish(false)}
            onContextMenu={(e) => e.preventDefault()}
        >
            {configured.map((dir) => {
                const angle = directionAngle(dir);
                const at = radius * 0.78;
                return (
                    <span
                        key={dir}
                        className={'mobile-joystick__tick' + (dir === direction ? ' mobile-joystick__tick--active' : '')}
                        style={{ left: radius + Math.cos(angle) * at, top: radius + Math.sin(angle) * at }}
                    />
                );
            })}
            <div className="mobile-joystick__knob" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}>
                {label && <span className="mobile-joystick__label">{label}</span>}
            </div>
            {tagsVisible && configured.map((dir) => {
                if (!peek && dir !== direction) return null;
                const angle = directionAngle(dir);
                const at = radius + TAG_GAP;
                return (
                    <span
                        key={dir}
                        className={'mobile-joystick__tag' + (dir === direction ? ' mobile-joystick__tag--active' : '')}
                        style={{ left: radius + Math.cos(angle) * at, top: radius + Math.sin(angle) * at }}
                    >
                        {describe(item.commands[dir]!)}
                    </span>
                );
            })}
        </div>
    );
}

/**
 * Floating joysticks (Fado-style) — shared by the stock UI and forge-ui, each
 * portalled to document.body. Configured on the "Joysticki" settings page.
 */
export default function MobileJoysticks({ client }: { client: Client }) {
    const [joysticks, setJoysticks] = useState<JoystickSettings>(() => loadSettings().joysticks);
    const [positions, setPositions] = useState<Positions>(loadPositions);
    const [viewport, setViewport] = useState<Viewport>(currentViewport);
    /** Live centres while a joystick is being dragged; persisted on release. */
    const [moving, setMoving] = useState<Record<string, Point>>({});

    useEffect(() => globalStorage.onChange('mobileButtonSettings', (next) => {
        setJoysticks(parseJoystickSettings((next as any)?.joysticks, !!next?.locked));
    }), []);

    useEffect(() => globalStorage.onChange('mobileJoystickPositions', (next) => {
        setPositions(next && typeof next === 'object' ? next : {});
    }), []);

    useEffect(() => {
        const update = () => setViewport(currentViewport());
        window.addEventListener('resize', update);
        window.visualViewport?.addEventListener('resize', update);
        return () => {
            window.removeEventListener('resize', update);
            window.visualViewport?.removeEventListener('resize', update);
        };
    }, []);

    if (!joysticks.enabled || joysticks.items.length === 0) return null;

    const fallbacks = defaultCenters(joysticks.items, viewport);

    const send = (value: string) => {
        if (getShellSettings().hapticFeedback !== false) navigator.vibrate?.(20);
        const macro = joystickMacro(value);
        if (macro) executeMacro(client, macro.macroType, { macroType: macro.macroType, exitIndex: macro.exitIndex });
        else client.sendCommand(value);
    };

    const describe = (value: string) => {
        const macro = joystickMacro(value);
        if (!macro) return value;
        if (macro.macroType === 'specialExit') {
            // Name the exit this room actually has, as the action would take it.
            return specialExitAt(client, macro.exitIndex) ?? macro.label;
        }
        return macro.label;
    };

    const move = (id: string, center: Point) => {
        const item = joysticks.items.find((j) => j.id === id);
        if (!item) return;
        setMoving((prev) => ({ ...prev, [id]: clampCenter(center, item.size, viewport) }));
    };

    const moved = (id: string, center: Point) => {
        const item = joysticks.items.find((j) => j.id === id);
        setMoving((prev) => {
            const { [id]: _, ...rest } = prev;
            return rest;
        });
        if (!item) return;
        const final = clampCenter(center, item.size, viewport);
        const next: Positions = { ...loadPositions() };
        next[id] = {
            ...next[id],
            [orientationOf(viewport)]: { x: final.x / viewport.width, y: final.y / viewport.height },
        };
        globalStorage.set('mobileJoystickPositions', next);
    };

    return createPortal(
        <div className="mobile-joysticks" data-mobile-command-radial-ignore>
            {joysticks.items.map((item, index) => (
                <Joystick
                    key={item.id}
                    item={item}
                    center={moving[item.id] ?? resolveCenter(item, positions, fallbacks[index], viewport)}
                    locked={joysticks.locked}
                    describe={describe}
                    onSend={send}
                    onMove={move}
                    onMoved={moved}
                />
            ))}
        </div>,
        document.body,
    );
}
