import { beforeEach, describe, expect, test } from 'vitest';
import { globalStorage } from '@modules/core/storage';
import {
    getFooterButtonState,
    getFooterButtonStates,
    getFooterButtons,
    registerFooterButton,
    resetFooterButtons,
    setFooterButtonState,
    subscribeFooterButtons,
    unregisterFooterButton,
} from '@modules/core/footerButtonRegistry';

/**
 * The buttons beside the command line: the player's own come from uiSettings,
 * a plugin's from the API, and either can light up from a named state that a
 * trigger, a script or a plugin flips.
 */

function store(buttons: unknown[]): void {
    globalStorage.set('uiSettings', { footerButtons: buttons } as never);
}

beforeEach(() => {
    resetFooterButtons();
    store([]);
});

describe('footerButtonRegistry', () => {
    test('reads the player buttons in order, defaulting the tone', () => {
        store([
            { id: 'a', label: 'zabij cel', command: 'zabij cel', tone: 'danger', order: 1 },
            { id: 'b', label: 'kondycja', command: 'kondycja', order: 0 },
        ]);
        expect(getFooterButtons().map(b => [b.id, b.tone, b.source]))
            .toEqual([['b', 'neutral', 'user'], ['a', 'danger', 'user']]);
    });

    test('skips a button with nothing to show or send, and one switched off', () => {
        store([
            { id: 'a', label: '', command: 'kondycja' },
            { id: 'b', label: 'kondycja', command: '   ' },
            { id: 'c', label: 'ukryty', command: 'kondycja', hidden: true },
            { id: 'd', label: 'kondycja', command: 'kondycja' },
        ]);
        expect(getFooterButtons().map(b => b.id)).toEqual(['d']);
    });

    test('a plugin button sits among the player ones, by order', () => {
        store([{ id: 'a', label: 'kondycja', command: 'kondycja', order: 0 }]);
        registerFooterButton({ id: 'p', label: 'Towarzysz', command: 'towarzysz', tone: 'accent', order: -1 });
        expect(getFooterButtons().map(b => [b.id, b.source])).toEqual([['p', 'plugin'], ['a', 'user']]);

        unregisterFooterButton('p');
        expect(getFooterButtons().map(b => b.id)).toEqual(['a']);
    });

    test('a named state lights up every button carrying it', () => {
        store([
            { id: 'a', label: 'Tryb: podroz', command: 'tryb podroz', state: 'podroz' },
            { id: 'b', label: 'kondycja', command: 'kondycja' },
        ]);
        expect(getFooterButtons().map(b => b.on)).toEqual([false, false]);

        setFooterButtonState('podroz', true);
        expect(getFooterButtons().map(b => b.on)).toEqual([true, false]);
        expect(getFooterButtonState('podroz')).toBe(true);
        expect(getFooterButtonStates()).toEqual(['podroz']);

        setFooterButtonState('podroz', false);
        expect(getFooterButtons().map(b => b.on)).toEqual([false, false]);
        expect(getFooterButtonStates()).toEqual([]);
    });

    test('notifies subscribers when buttons or a state change, and not otherwise', () => {
        let calls = 0;
        const off = subscribeFooterButtons(() => { calls++; });

        store([{ id: 'a', label: 'Tryb', command: 'tryb', state: 'podroz' }]);
        expect(calls).toBeGreaterThan(0);

        const afterStore = calls;
        setFooterButtonState('podroz', true);
        expect(calls).toBe(afterStore + 1);
        setFooterButtonState('podroz', true);
        expect(calls, 'setting the same state again changes nothing').toBe(afterStore + 1);

        off();
        setFooterButtonState('podroz', false);
        expect(calls).toBe(afterStore + 1);
    });

    test('an empty state name is ignored rather than stored', () => {
        setFooterButtonState('   ', true);
        expect(getFooterButtonStates()).toEqual([]);
        expect(getFooterButtonState(undefined)).toBe(false);
    });
});
