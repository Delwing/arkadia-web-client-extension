/**
 * Walking by thumb: a joystick floating at the bottom right of the output for
 * the eight compass directions, small buttons above it for up and down. Swipe from the knob and let go to walk; tap it to look around.
 * The room's actual exits are lit; the rest still walk, since the exit list
 * can lag or hide doors.
 *
 * Only the angle maths is shared with the stock joysticks; their settings,
 * saved positions and macro runner belong to the stock UI.
 */

import { useRef, useState, type PointerEvent } from "react";
import {
    JOYSTICK_DIRECTIONS,
    directionAngle,
    pickJoystickDirection,
    type JoystickDirection,
} from "@web/joystickSettings.ts";

const SIZE = 150;
const RADIUS = SIZE / 2;
const DEAD_ZONE = 22;
const KNOB_TRAVEL = RADIUS * 0.5;
const LABELS: Record<string, string> = {
    n: 'N', ne: 'NE', e: 'E', se: 'SE', s: 'S', sw: 'SW', w: 'W', nw: 'NW', u: 'Góra', d: 'Dół',
};
/** Every direction walks: the exit list is a hint, not a limit. */
const ALL_DIRECTIONS = Object.fromEntries(JOYSTICK_DIRECTIONS.map(dir => [dir, dir])) as Record<JoystickDirection, string>;

interface Gesture {
    pointerId: number;
    x: number;
    y: number;
    direction: JoystickDirection | null;
}

export function DirectionPad({ exits, center, onSend }: {
    exits: Set<string>;
    /** What a tap on the knob sends. */
    center: string;
    onSend: (command: string) => void;
}) {
    const gesture = useRef<Gesture | null>(null);
    const [direction, setDirection] = useState<JoystickDirection | null>(null);
    const [knob, setKnob] = useState({ x: 0, y: 0 });

    const onDown = (event: PointerEvent<HTMLDivElement>) => {
        if (gesture.current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, direction: null };
    };

    const onMove = (event: PointerEvent<HTMLDivElement>) => {
        const g = gesture.current;
        if (!g || g.pointerId !== event.pointerId) return;
        const dx = event.clientX - g.x;
        const dy = event.clientY - g.y;
        const travel = Math.min(Math.hypot(dx, dy), KNOB_TRAVEL);
        const angle = Math.atan2(dy, dx);
        setKnob({ x: Math.cos(angle) * travel, y: Math.sin(angle) * travel });
        const next = pickJoystickDirection(dx, dy, DEAD_ZONE, ALL_DIRECTIONS);
        if (next !== g.direction) {
            if (next) navigator.vibrate?.(10);
            g.direction = next;
            setDirection(next);
        }
    };

    const finish = (send: boolean) => {
        const g = gesture.current;
        if (!g) return;
        gesture.current = null;
        if (send) onSend(g.direction ?? center);
        setDirection(null);
        setKnob({ x: 0, y: 0 });
    };

    return (
        <div className="rc-pad">
            <div className="rc-pad-side">
                {(['u', 'd'] as const).map(dir => (
                    <button
                        key={dir}
                        type="button"
                        className={exits.has(dir) ? 'rc-dir lit' : 'rc-dir'}
                        onClick={() => onSend(dir)}
                    >
                        {LABELS[dir]}
                    </button>
                ))}
            </div>
            <div
                className={direction ? 'rc-joy active' : 'rc-joy'}
                style={{ width: SIZE, height: SIZE }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={() => finish(true)}
                onPointerCancel={() => finish(false)}
                onContextMenu={event => event.preventDefault()}
            >
                {JOYSTICK_DIRECTIONS.map(dir => {
                    const angle = directionAngle(dir);
                    const at = RADIUS * 0.78;
                    const classes = ['rc-joy-dir'];
                    if (exits.has(dir)) classes.push('lit');
                    if (dir === direction) classes.push('on');
                    return (
                        <span
                            key={dir}
                            className={classes.join(' ')}
                            style={{ left: RADIUS + Math.cos(angle) * at, top: RADIUS + Math.sin(angle) * at }}
                        >
                            {LABELS[dir]}
                        </span>
                    );
                })}
                <div className="rc-joy-knob" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}>
                    {direction ? LABELS[direction] : center}
                </div>
            </div>
        </div>
    );
}
