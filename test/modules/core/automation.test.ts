import {
    automationGroupName,
    ensureAutomationGroup,
    getAutomationGroups,
    isAutomationActive,
    onAutomationScopeChange,
    saveAutomationGroups,
    withAutomationId,
} from '@modules/core/automation';
import { characterStorage } from '@modules/core/storage';

describe('automation', () => {
    afterEach(() => {
        localStorage.clear();
    });

    describe('isAutomationActive', () => {
        const groups = [
            { id: 'on', name: 'Walka' },
            { id: 'off', name: 'Handel', enabled: false },
        ];

        it('treats an element without any meta as active', () => {
            expect(isAutomationActive({}, groups, null)).toBe(true);
        });

        it('is off when switched off itself', () => {
            expect(isAutomationActive({ enabled: false }, groups, 'Arel')).toBe(false);
        });

        it('follows its group', () => {
            expect(isAutomationActive({ group: 'on' }, groups, 'Arel')).toBe(true);
            expect(isAutomationActive({ group: 'off' }, groups, 'Arel')).toBe(false);
        });

        it('stays on when its group is missing', () => {
            expect(isAutomationActive({ group: 'gone' }, groups, 'Arel')).toBe(true);
        });

        it('applies only to the listed characters, ignoring case', () => {
            const item = { characters: ['Arel', 'Morwen'] };
            expect(isAutomationActive(item, groups, 'arel')).toBe(true);
            expect(isAutomationActive(item, groups, 'Tharn')).toBe(false);
            expect(isAutomationActive(item, groups, null)).toBe(false);
        });

        it('treats an empty character list as all characters', () => {
            expect(isAutomationActive({ characters: [] }, groups, null)).toBe(true);
        });
    });

    describe('groups', () => {
        it('creates a group once and finds it again by name', () => {
            const id = ensureAutomationGroup('Walka');
            expect(id).toBeTruthy();
            expect(ensureAutomationGroup(' walka ')).toBe(id);
            expect(getAutomationGroups()).toEqual([{ id, name: 'Walka' }]);
            expect(automationGroupName(id)).toBe('Walka');
        });

        it('means no group for an empty name', () => {
            expect(ensureAutomationGroup('  ')).toBeUndefined();
            expect(getAutomationGroups()).toEqual([]);
        });
    });

    it('keeps an existing id and assigns a missing one', () => {
        expect(withAutomationId({ id: 'x' }).id).toBe('x');
        const a = withAutomationId({});
        const b = withAutomationId({});
        expect(a.id).toBeTruthy();
        expect(a.id).not.toBe(b.id);
    });

    it('reports group and character changes', () => {
        const listener = vi.fn();
        const off = onAutomationScopeChange(listener);
        saveAutomationGroups([{ id: 'g', name: 'Walka', enabled: false }]);
        expect(listener).toHaveBeenCalledTimes(1);
        characterStorage.setCharacter(`Scope${Date.now()}`);
        expect(listener).toHaveBeenCalledTimes(2);
        off();
        saveAutomationGroups([]);
        expect(listener).toHaveBeenCalledTimes(2);
    });
});
