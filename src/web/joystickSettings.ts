/**
 * On-screen joysticks (after the Fado MUD client): round floating controls
 * the user adds and places freely. A tap sends the centre command, a swipe
 * from the centre sends the command of the direction it ends in.
 *
 * Stored inside `mobileButtonSettings` (so sync, device bundles and export
 * carry it with the rest of the buttons); positions are per device and live
 * apart in `mobileJoystickPositions`.
 */

export const JOYSTICK_DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type JoystickDirection = (typeof JOYSTICK_DIRECTIONS)[number];

export interface JoystickSetting {
    id: string;
    label: string;
    /** Sent on a tap without a swipe. Empty = nothing. */
    center: string;
    /** Swipe commands; a direction without one is not selectable. */
    commands: Partial<Record<JoystickDirection, string>>;
    /** Diameter in px. */
    size: number;
    color: string;
    fontColor: string;
}

export interface JoystickSettings {
    enabled: boolean;
    /** Locked joysticks can't be dragged: a long press only shows the commands. */
    locked: boolean;
    items: JoystickSetting[];
}

export const JOYSTICK_MIN_SIZE = 56;
export const JOYSTICK_MAX_SIZE = 220;
export const defaultJoystickColor = '#6CA6CD';
export const defaultJoystickFontColor = '#f1f5f9';

/**
 * Built-in actions a slot can hold instead of a command: the same macros the
 * mobile buttons run, for things a fixed command can't express.
 */
export interface JoystickMacro {
    macroType: string;
    label: string;
    /** For specialExit: which of the room's special exits (0-2). */
    exitIndex?: number;
}

export const JOYSTICK_MACROS: Record<string, JoystickMacro> = {
    '@zerknij': { macroType: 'zerknij', label: 'zerknij' },
    '@wyjscie': { macroType: 'specialExit', label: 'wyjście specjalne' },
    '@wyjscie2': { macroType: 'specialExit', label: 'drugie wyjście specjalne', exitIndex: 1 },
    '@wyjscie3': { macroType: 'specialExit', label: 'trzecie wyjście specjalne', exitIndex: 2 },
};

export function joystickMacro(value: string): JoystickMacro | null {
    return JOYSTICK_MACROS[value.trim().toLowerCase()] ?? null;
}

const DEFAULT_JOYSTICKS: JoystickSetting[] = [
    {
        id: 'joystick-compass',
        label: '',
        center: '',
        commands: { n: 'n', ne: 'ne', e: 'e', se: 'se', s: 's', sw: 'sw', w: 'w', nw: 'nw' },
        size: 130,
        color: defaultJoystickColor,
        fontColor: defaultJoystickFontColor,
    },
    {
        id: 'joystick-vertical',
        label: '',
        center: '',
        commands: { n: 'u', e: '@zerknij', s: 'd', w: '@wyjscie' },
        size: 84,
        color: defaultJoystickColor,
        fontColor: defaultJoystickFontColor,
    },
];

export function createDefaultJoysticks(): JoystickSettings {
    return {
        enabled: false,
        locked: false,
        items: DEFAULT_JOYSTICKS.map(j => ({ ...j, commands: { ...j.commands } })),
    };
}

export function createJoystickId(): string {
    const globalCrypto = typeof crypto !== 'undefined' ? crypto : undefined;
    if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
        return `joystick-${globalCrypto.randomUUID()}`;
    }
    return `joystick-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

export function clampJoystickSize(size: unknown): number {
    const n = Number(size);
    if (!Number.isFinite(n)) return DEFAULT_JOYSTICKS[0].size;
    return Math.round(Math.min(JOYSTICK_MAX_SIZE, Math.max(JOYSTICK_MIN_SIZE, n)));
}

/**
 * `legacyLocked` is the mobile buttons' lock, which joysticks followed before
 * they had their own; it applies until the joystick lock is first saved.
 */
export function parseJoystickSettings(raw: unknown, legacyLocked = false): JoystickSettings {
    if (!raw || typeof raw !== 'object') return { ...createDefaultJoysticks(), locked: legacyLocked };
    const source = raw as Record<string, unknown>;
    const items: JoystickSetting[] = [];
    const usedIds = new Set<string>();
    const list = Array.isArray(source.items) ? source.items : [];
    list.forEach((entry: any, index: number) => {
        if (!entry || typeof entry !== 'object') return;
        let id = str(entry.id) || `joystick-${index + 1}`;
        while (usedIds.has(id)) id = `${id}-${index + 1}`;
        usedIds.add(id);
        const commands: Partial<Record<JoystickDirection, string>> = {};
        const rawCommands = entry.commands && typeof entry.commands === 'object' ? entry.commands : {};
        for (const dir of JOYSTICK_DIRECTIONS) {
            const command = str(rawCommands[dir]).trim();
            if (command) commands[dir] = command;
        }
        items.push({
            id,
            label: str(entry.label).trim(),
            center: str(entry.center).trim(),
            commands,
            size: clampJoystickSize(entry.size),
            color: str(entry.color) || defaultJoystickColor,
            fontColor: str(entry.fontColor) || defaultJoystickFontColor,
        });
    });
    const locked = typeof source.locked === 'boolean' ? source.locked : legacyLocked;
    return { enabled: source.enabled === true, locked, items };
}

/** Angle (radians, screen coordinates: y grows down) each direction points at. */
const DIRECTION_ANGLES: Record<JoystickDirection, number> = {
    e: 0,
    se: Math.PI / 4,
    s: Math.PI / 2,
    sw: (3 * Math.PI) / 4,
    w: Math.PI,
    nw: (-3 * Math.PI) / 4,
    n: -Math.PI / 2,
    ne: -Math.PI / 4,
};

export function directionAngle(dir: JoystickDirection): number {
    return DIRECTION_ANGLES[dir];
}

function angleDistance(a: number, b: number): number {
    const d = Math.abs(a - b) % (Math.PI * 2);
    return d > Math.PI ? Math.PI * 2 - d : d;
}

/**
 * The configured direction a swipe of (dx, dy) points at, or null inside the
 * dead zone. Picks the nearest direction that has a command, so a joystick
 * with only n/e/s/w gives each a quarter of the circle.
 */
export function pickJoystickDirection(
    dx: number,
    dy: number,
    deadZone: number,
    commands: Partial<Record<JoystickDirection, string>>,
): JoystickDirection | null {
    if (Math.hypot(dx, dy) < deadZone) return null;
    const angle = Math.atan2(dy, dx);
    let best: JoystickDirection | null = null;
    let bestDistance = Infinity;
    for (const dir of JOYSTICK_DIRECTIONS) {
        if (!commands[dir]) continue;
        const distance = angleDistance(angle, DIRECTION_ANGLES[dir]);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = dir;
        }
    }
    // A swipe at a right angle (or more) to every configured direction picks nothing.
    return bestDistance < Math.PI / 2 ? best : null;
}
