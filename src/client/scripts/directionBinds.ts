import type Client from "../Client";
import { globalStorage } from "@modules/core/storage";
import { shouldIgnoreGlobalKeybind } from "../keybindGuard";
import type { WalkModifiers } from "@modules/core/keymapTypes";
import { isDrivableExit } from "@shared/map/exitCommands";
import {
    directionModifiers,
    effectiveWalkModifiers,
    getWalkModes,
    hasWalkModifier,
    walkModifiersOf,
    type WalkMode,
} from "@modules/core/walkModeRegistry";

/**
 * Direction (numpad movement) keybinds.
 *
 * Extracted from the stock web UI so every UI gets identical movement keys. The
 * bindings come from the shared `binds.directions` keymap slice (with built-in
 * numpad defaults) and dispatch straight through `client.sendCommand`, so this
 * runs the same headless or under an alternate UI.
 *
 * Suppression is UI-agnostic: keys are ignored while a non-command text field is
 * focused, or when the active UI asks to suppress keybinds via the injected
 * `UiPort.shouldSuppressKeys` hook (e.g. the stock UI's open-modal check). The
 * command input opts back in by carrying a `data-command-input` attribute, so
 * you can still walk while the command line has focus.
 *
 * A direction key pressed with a walk mode's modifier (see walkModeRegistry)
 * walks that step in the mode instead: Alt+numpad 8 as `przemknij n`, say. A
 * direction bound exactly to that combo wins over the walk mode.
 */

interface RawDirectionBind {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
}

interface DirectionBinding {
    code: string;
    direction: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
}

const DEFAULT_DIRECTION_BINDS: Record<string, RawDirectionBind> = {
    n: { key: 'Numpad8' },
    s: { key: 'Numpad2' },
    w: { key: 'Numpad4' },
    e: { key: 'Numpad6' },
    nw: { key: 'Numpad7' },
    ne: { key: 'Numpad9' },
    sw: { key: 'Numpad1' },
    se: { key: 'Numpad3' },
    u: { key: 'NumpadMultiply' },
    d: { key: 'NumpadDivide' },
    zerknij: { key: 'Numpad5' },
    special: { key: 'Numpad0' },
};

function isDirectionMap(value: unknown): value is Record<string, Partial<RawDirectionBind> | undefined> {
    return !!value && typeof value === 'object';
}

function buildDirectionBindings(
    dirs?: Record<string, Partial<RawDirectionBind> | undefined>,
): DirectionBinding[] {
    return Object.entries(DEFAULT_DIRECTION_BINDS).map(([direction, fallback]) => {
        const override = dirs?.[direction];
        const source = override && override.key ? override : fallback;
        return {
            direction,
            code: source.key as string,
            ctrl: !!source.ctrl,
            alt: !!source.alt,
            shift: !!source.shift,
        };
    });
}

function matchesDirectionBinding(event: KeyboardEvent, binding: DirectionBinding): boolean {
    return event.code === binding.code &&
        event.ctrlKey === !!binding.ctrl &&
        event.altKey === !!binding.alt &&
        event.shiftKey === !!binding.shift;
}

/**
 * What the "zerknij" slot does right now: mid-ride it halts the carriage - looking around is not
 * what you reach for while rolling. The stop command is published by the carriage script and is
 * null whenever nothing is rolling, so off a ride this is a plain `zerknij`.
 *
 * Shared with the `zerknij` button macro so the button and the key behave identically.
 */
export function lookCommand(client: Client): string {
    return client.carriageStopCommand ?? 'zerknij';
}

/**
 * Whether a keystroke on `binding`'s key selects the walk mode: the event
 * carries the binding's own modifiers plus exactly the mode's. `mods` must
 * already be free of the modifiers the direction keys hold (see
 * effectiveWalkModifiers), or the two could not be told apart.
 */
function matchesWalkMode(event: KeyboardEvent, binding: DirectionBinding, mods: WalkModifiers): boolean {
    if (event.code !== binding.code) return false;
    return event.ctrlKey === (!!binding.ctrl || !!mods.ctrl) &&
        event.altKey === (!!binding.alt || !!mods.alt) &&
        event.shiftKey === (!!binding.shift || !!mods.shift);
}

function sendDirection(client: Client, direction: string, mode?: WalkMode): void {
    if (direction === 'zerknij') {
        // Looking around is not a step: a walk mode has nothing to add to it.
        client.sendCommand(lookCommand(client));
        return;
    }
    let step = direction;
    if (direction === 'special') {
        const exits = client.Map.currentRoom?.specialExits ?? {};
        const first = Object.keys(exits)[0];
        if (!first) return;
        step = first;
    }
    if (mode?.onMove) {
        mode.onMove(step);
    } else if (mode?.prefix && isDrivableExit(step)) {
        // A special exit that is not a plain passage ("wespnij sie") takes no prefix, as with the ` mode.
        client.sendCommand(mode.prefix + step);
    } else {
        client.sendCommand(step);
    }
}

export default function initDirectionBinds(client: Client): void {
    type StoredBinds = { directions?: unknown; walkModes?: Record<string, WalkModifiers> } | undefined;
    let stored = globalStorage.get('binds') as StoredBinds;
    let directionBindings = buildDirectionBindings(
        isDirectionMap(stored?.directions) ? stored.directions : undefined,
    );

    // Rebuild whenever the active keymap's binds change (keymap switch / edit).
    globalStorage.onChange('binds', (binds) => {
        stored = binds as StoredBinds;
        const directions = stored?.directions;
        directionBindings = buildDirectionBindings(isDirectionMap(directions) ? directions : undefined);
    });

    const walkStep = (event: KeyboardEvent): { binding: DirectionBinding; mode: WalkMode } | null => {
        if (!event.ctrlKey && !event.altKey && !event.shiftKey) return null;
        // No bind uses ⌘/Win: Cmd+Option+arrow belongs to the browser, not to a walk mode.
        if (event.metaKey) return null;
        const taken = directionModifiers(directionBindings);
        for (const mode of getWalkModes()) {
            const mods = effectiveWalkModifiers(walkModifiersOf(stored, mode), taken);
            if (!hasWalkModifier(mods)) continue;
            const binding = directionBindings.find(b => matchesWalkMode(event, b, mods));
            if (binding) return { binding, mode };
        }
        return null;
    };

    window.addEventListener('keydown', (event) => {
        if (shouldIgnoreGlobalKeybind()) return;
        const binding = directionBindings.find(b => matchesDirectionBinding(event, b));
        if (binding) {
            event.preventDefault();
            sendDirection(client, binding.direction);
            return;
        }
        const walk = walkStep(event);
        if (!walk) return;
        event.preventDefault();
        sendDirection(client, walk.binding.direction, walk.mode);
    });

    // Native helper hotkeys route dir_* bind ids here too.
    client.on('helperBind', (bindName) => {
        const match = bindName.match(/^dir_(.+)$/);
        if (match) sendDirection(client, match[1]);
    });
}
