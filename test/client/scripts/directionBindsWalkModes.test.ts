import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { globalStorage } from '@modules/core/storage';
import { defaultBinds } from '@modules/core/keymapStorage';
import type { BindSettings } from '@modules/core/keymapTypes';
import { registerWalkMode, resetWalkModes } from '@modules/core/walkModeRegistry';
import initDirectionBinds from '@client/scripts/directionBinds';

/**
 * Walk modes ride on the direction keys: the player gives each mode a modifier,
 * and that modifier held with any direction key walks the step in the mode.
 */

const client: any = {
    sendCommand: vi.fn(),
    on: vi.fn(),
    carriageStopCommand: null,
    Map: { currentRoom: { specialExits: {} as Record<string, number> } },
};

function store(patch: Partial<BindSettings> = {}): void {
    globalStorage.set('binds', { ...structuredClone(defaultBinds), ...patch });
}

function press(code: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
        code, ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift, metaKey: !!mods.meta, cancelable: true,
    });
    window.dispatchEvent(event);
    return event;
}

beforeAll(() => {
    store();
    initDirectionBinds(client);
});

beforeEach(() => {
    resetWalkModes();
    store();
    client.sendCommand.mockClear();
    client.Map.currentRoom.specialExits = {};
});

describe('walk modes on direction keys', () => {
    test('a direction key walks plainly when no walk mode has a modifier', () => {
        press('Numpad8');
        expect(client.sendCommand).toHaveBeenCalledWith('n');
        const event = press('Numpad8', { alt: true });
        expect(event.defaultPrevented).toBe(false);
        expect(client.sendCommand).toHaveBeenCalledTimes(1);
    });

    test('the sneak modifier sneaks the step', () => {
        store({ walkModes: { sneak: { alt: true } } });
        const event = press('Numpad9', { alt: true });
        expect(event.defaultPrevented).toBe(true);
        expect(client.sendCommand).toHaveBeenCalledWith('przemknij ne');
    });

    test('a plugin mode gets the step and walks it itself', () => {
        const onMove = vi.fn();
        registerWalkMode({ id: 'mc.walk', label: 'MC', defaultModifiers: { ctrl: true }, onMove });
        store({ walkModes: { sneak: { alt: true } } });
        press('Numpad4', { ctrl: true });
        press('Numpad4', { alt: true });
        expect(onMove).toHaveBeenCalledWith('w');
        expect(client.sendCommand).toHaveBeenCalledWith('przemknij w');
        expect(client.sendCommand).toHaveBeenCalledTimes(1);
    });

    test('the player can switch a plugin default off', () => {
        const onMove = vi.fn();
        registerWalkMode({ id: 'mc.walk', label: 'MC', defaultModifiers: { ctrl: true }, onMove });
        store({ walkModes: { 'mc.walk': { ctrl: false, alt: false, shift: false } } });
        press('Numpad4', { ctrl: true });
        expect(onMove).not.toHaveBeenCalled();
    });

    test('follows directions moved to other keys', () => {
        store({
            directions: { ...defaultBinds.directions, n: { key: 'ArrowUp' } },
            walkModes: { sneakTeam: { shift: true } },
        });
        press('ArrowUp', { shift: true });
        expect(client.sendCommand).toHaveBeenCalledWith('przemknij z druzyna n');
    });

    test('a direction bound exactly to the combo wins over the walk mode', () => {
        store({
            directions: { ...defaultBinds.directions, u: { key: 'Numpad8', alt: true } },
            walkModes: { sneak: { alt: true } },
        });
        press('Numpad8', { alt: true });
        expect(client.sendCommand).toHaveBeenCalledWith('u');
        expect(client.sendCommand).toHaveBeenCalledTimes(1);
    });

    test('extra modifiers beyond the mode do not match', () => {
        store({ walkModes: { sneak: { alt: true } } });
        press('Numpad8', { alt: true, shift: true });
        expect(client.sendCommand).not.toHaveBeenCalled();
    });

    test('the special exit is resolved before it is walked', () => {
        store({ walkModes: { sneak: { alt: true } } });
        client.Map.currentRoom.specialExits = { wschod: 1 };
        press('Numpad0', { alt: true });
        expect(client.sendCommand).toHaveBeenCalledWith('przemknij wschod');
    });

    test('a special exit that is an action is not sneaked', () => {
        store({ walkModes: { sneak: { alt: true } } });
        client.Map.currentRoom.specialExits = { 'wespnij sie na drzewo': 1 };
        press('Numpad0', { alt: true });
        expect(client.sendCommand).toHaveBeenCalledWith('wespnij sie na drzewo');
    });

    test('looking around stays a look', () => {
        store({ walkModes: { sneak: { alt: true } } });
        press('Numpad5', { alt: true });
        expect(client.sendCommand).toHaveBeenCalledWith('zerknij');
    });

    test('a modifier the direction keys already hold is dropped from the mode', () => {
        const shifted = Object.fromEntries(Object.entries(defaultBinds.directions).map(([d, b]) => [d, { ...b, shift: true }]));
        store({ directions: shifted as BindSettings['directions'], walkModes: { sneak: { shift: true }, sneakTeam: { ctrl: true, shift: true } } });
        // Sneak asked only for Shift, which the directions hold: it is off.
        press('Numpad8', { shift: true });
        expect(client.sendCommand).toHaveBeenLastCalledWith('n');
        // Ctrl+Shift leaves Ctrl: held on top of Shift+Num8 it sneaks with the team.
        press('Numpad8', { ctrl: true, shift: true });
        expect(client.sendCommand).toHaveBeenLastCalledWith('przemknij z druzyna n');
        expect(client.sendCommand).toHaveBeenCalledTimes(2);
    });

    test('Cmd held with the modifier is not a walk step', () => {
        store({ walkModes: { sneak: { alt: true } } });
        const event = press('Numpad8', { alt: true, meta: true });
        expect(event.defaultPrevented).toBe(false);
        expect(client.sendCommand).not.toHaveBeenCalled();
    });

    test('a built-in id cannot be taken by a plugin', () => {
        expect(registerWalkMode({ id: 'sneak', label: 'x', onMove: vi.fn() })).toBe(false);
    });
});
