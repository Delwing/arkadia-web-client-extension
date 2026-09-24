import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installAltCodeGuard } from '@shared/dom/altCodeGuard.ts';

function key(type: 'keydown' | 'keyup', init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
    document.body.dispatchEvent(event);
    return event;
}

function typeChar(data: string): { keypress: KeyboardEvent; beforeinput: InputEvent } {
    const keypress = new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: data });
    document.body.dispatchEvent(keypress);
    const beforeinput = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data });
    document.body.dispatchEvent(beforeinput);
    return { keypress, beforeinput };
}

/**
 * Alt held, one numpad digit pressed, Alt released - as Chrome on Windows
 * delivers it: the Alt keyup already carries the composed character as `key`.
 */
function altNumpad(bound: boolean): void {
    key('keydown', { key: 'Alt', code: 'AltLeft', altKey: true });
    const digit = key('keydown', { key: '4', code: 'Numpad4', altKey: true });
    if (bound) digit.preventDefault();
    key('keyup', { key: '4', code: 'Numpad4', altKey: true });
    key('keyup', { key: '♦', code: 'AltLeft' });
}

describe('altCodeGuard', () => {
    let uninstall: () => void;
    beforeEach(() => { uninstall = installAltCodeGuard(); });
    afterEach(() => uninstall());

    it('drops the Alt-code character after a bound Alt+numpad key', () => {
        altNumpad(true);
        const { keypress, beforeinput } = typeChar('♦');
        expect(keypress.defaultPrevented).toBe(true);
        expect(beforeinput.defaultPrevented).toBe(true);
    });

    it('lets the character through when no bind took the numpad key', () => {
        altNumpad(false);
        const { beforeinput } = typeChar('♦');
        expect(beforeinput.defaultPrevented).toBe(false);
    });

    it('only drops one character', () => {
        altNumpad(true);
        typeChar('♦');
        expect(typeChar('a').beforeinput.defaultPrevented).toBe(false);
    });

    it('stops suppressing once another key goes down', () => {
        altNumpad(true);
        key('keydown', { key: 'a', code: 'KeyA' });
        expect(typeChar('a').beforeinput.defaultPrevented).toBe(false);
    });
});
