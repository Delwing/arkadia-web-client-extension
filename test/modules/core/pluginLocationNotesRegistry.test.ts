import { afterEach, describe, expect, test } from 'vitest';
import {
    getAllPluginLocationNotes,
    getPluginLocationNotes,
    removeAllPluginNotes,
    setPluginLocationNote,
} from '@modules/core/pluginLocationNotesRegistry';

afterEach(() => {
    removeAllPluginNotes('plugin-a');
    removeAllPluginNotes('__internal__');
});

describe('pluginLocationNotesRegistry', () => {
    test('a plugin note is not marked built-in; the client\'s own source is', () => {
        setPluginLocationNote('plugin-a', 'Wtyczka A', 5, 'od wtyczki');
        setPluginLocationNote('__internal__', 'Wiedza', 5, 'z wiedzy', { builtin: true });
        expect(getPluginLocationNotes(5)).toEqual([
            { pluginId: 'plugin-a', pluginName: 'Wtyczka A', roomId: 5, note: 'od wtyczki' },
            { pluginId: '__internal__', pluginName: 'Wiedza', roomId: 5, note: 'z wiedzy', builtin: true },
        ]);
    });

    test('lists notes across every room', () => {
        setPluginLocationNote('plugin-a', 'Wtyczka A', 1, 'jeden');
        setPluginLocationNote('plugin-a', 'Wtyczka A', 2, 'dwa');
        expect(getAllPluginLocationNotes().map((n) => n.roomId).sort()).toEqual([1, 2]);
    });
});
