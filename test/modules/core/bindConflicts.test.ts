import { describeBind, findBindConflicts, sameBind } from '@modules/core/bindConflicts';
import { defaultBinds } from '@modules/core/keymapStorage';
import type { BindSettings } from '@modules/core/keymapTypes';

function binds(): BindSettings {
    return JSON.parse(JSON.stringify(defaultBinds)) as BindSettings;
}

describe('sameBind', () => {
    it('treats an absent modifier as false', () => {
        expect(sameBind({ key: 'KeyQ' }, { key: 'KeyQ', ctrl: false })).toBe(true);
    });

    it('is case-insensitive on the key name', () => {
        expect(sameBind({ key: 'keyq' }, { key: 'KeyQ' })).toBe(true);
    });

    it('separates binds that differ by a modifier', () => {
        expect(sameBind({ key: 'KeyQ' }, { key: 'KeyQ', ctrl: true })).toBe(false);
    });

    it('never matches an empty key', () => {
        expect(sameBind({ key: '' }, { key: '' })).toBe(false);
    });
});

describe('findBindConflicts', () => {
    it('finds no conflict on a free key', () => {
        expect(findBindConflicts(binds(), { key: 'F13', ctrl: true, alt: true })).toEqual([]);
    });

    it('reports a custom bind sitting on the same keystroke', () => {
        const settings = binds();
        settings.custom = [{ key: 'F13', ctrl: true, command: 'zabij' }];

        const conflicts = findBindConflicts(settings, { key: 'F13', ctrl: true });

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].path).toBe('custom[0]');
        expect(conflicts[0].command).toBe('zabij');
    });

    it('finds the stock bind a naive proposal would silently steal', () => {
        // Ctrl+Q is the default `support` bind — exactly the kind of collision
        // the card has to warn about instead of applying quietly.
        const conflicts = findBindConflicts(binds(), { key: 'KeyQ', ctrl: true });
        expect(conflicts.map(c => c.path)).toContain('support');
    });

    it('reports a fixed slot and names it in Polish', () => {
        const settings = binds();
        settings.lamp = { key: 'KeyL' };

        const conflicts = findBindConflicts(settings, { key: 'KeyL' });

        expect(conflicts.map(c => c.path)).toContain('lamp');
        expect(conflicts.find(c => c.path === 'lamp')?.label).toBe('Lampa');
    });

    it('reports direction binds by their dotted path', () => {
        const settings = binds();
        settings.directions.n = { key: 'Numpad8' };

        const conflicts = findBindConflicts(settings, { key: 'Numpad8' });

        expect(conflicts.map(c => c.path)).toContain('directions.n');
    });

    it('honours the skip path so a slot can be edited in place', () => {
        const settings = binds();
        settings.custom = [{ key: 'KeyQ', command: 'zabij' }];

        expect(findBindConflicts(settings, { key: 'KeyQ' }, 'custom[0]')).toEqual([]);
    });

    it('tolerates missing bind settings', () => {
        expect(findBindConflicts(undefined, { key: 'KeyQ' })).toEqual([]);
    });
});

describe('describeBind', () => {
    it('renders modifiers in a stable order', () => {
        expect(describeBind({ key: 'KeyQ', shift: true, ctrl: true })).toBe('Ctrl + Shift + KeyQ');
    });
});
