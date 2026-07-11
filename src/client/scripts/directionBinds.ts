import type Client from "../Client";
import { globalStorage } from "@modules/core/storage";
import { getUiPort } from "../ports";

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

function isTextField(el: Element | null): boolean {
    if (!el) return false;
    const html = el as HTMLElement;
    return (typeof html.matches === 'function' && html.matches('input, textarea')) ||
        html.isContentEditable === true;
}

function isCommandInput(el: Element | null): boolean {
    const html = el as HTMLElement | null;
    return !!html && typeof html.matches === 'function' && html.matches('[data-command-input]');
}

function sendDirection(client: Client, direction: string): void {
    if (direction === 'special') {
        const exits = client.Map.currentRoom?.specialExits ?? {};
        const first = Object.keys(exits)[0];
        if (first) client.sendCommand(first);
        return;
    }
    client.sendCommand(direction);
}

export default function initDirectionBinds(client: Client): void {
    const stored = globalStorage.get('binds') as { directions?: unknown } | undefined;
    let directionBindings = buildDirectionBindings(
        isDirectionMap(stored?.directions) ? stored.directions : undefined,
    );

    // Rebuild whenever the active keymap's binds change (keymap switch / edit).
    globalStorage.onChange('binds', (binds) => {
        const directions = (binds as { directions?: unknown } | undefined)?.directions;
        directionBindings = buildDirectionBindings(isDirectionMap(directions) ? directions : undefined);
    });

    window.addEventListener('keydown', (event) => {
        const active = document.activeElement;
        // The command input opts back in; otherwise suppress while typing in a
        // text field or when the UI reports it should (e.g. an open modal).
        if (!isCommandInput(active)) {
            if (isTextField(active)) return;
            if (getUiPort().shouldSuppressKeys?.()) return;
        }
        const binding = directionBindings.find(b => matchesDirectionBinding(event, b));
        if (!binding) return;
        event.preventDefault();
        sendDirection(client, binding.direction);
    });

    // Native helper hotkeys route dir_* bind ids here too.
    client.on('helperBind', (bindName) => {
        const match = bindName.match(/^dir_(.+)$/);
        if (match) sendDirection(client, match[1]);
    });
}
