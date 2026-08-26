/**
 * Each proposal kind must land in the storage key its runtime consumer reads,
 * through the accessor that fires listeners — not raw localStorage.
 */
import { applyProposal } from '@web/assistant/applyProposal';
import { characterStorage, globalStorage } from '@modules/core/storage';
import { validateProposal } from '@modules/core/assistant/proposalValidator';
import type {
    AliasProposal,
    BindProposal,
    SettingChangeProposal,
    TriggerProposal,
} from '@modules/core/assistant/proposalValidator';

describe('applyProposal', () => {
    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
    });

    afterEach(() => {
        localStorage.clear();
    });

    describe('settingChange', () => {
        it('patches the character settings blob without dropping siblings', () => {
            characterStorage.set('settings', { shortenExits: true } as never);

            const result = applyProposal({
                kind: 'settingChange',
                key: 'lowHpAlert',
                value: 3,
            } as SettingChangeProposal);

            expect(result.ok).toBe(true);
            const stored = characterStorage.get('settings') as Record<string, unknown>;
            expect(stored.lowHpAlert).toBe(3);
            expect(stored.shortenExits).toBe(true);
        });

        it('notifies character settings subscribers', () => {
            const listener = jest.fn();
            const off = characterStorage.onChange('settings', listener);

            applyProposal({ kind: 'settingChange', key: 'lowHpAlert', value: 5 } as SettingChangeProposal);

            expect(listener).toHaveBeenCalled();
            off?.();
        });

        it('writes a UI-slice setting through the uiSettings fan-out', () => {
            const result = applyProposal({
                kind: 'settingChange',
                key: 'renderSettings.fontFamily',
                value: 'fira-code',
            } as SettingChangeProposal);

            expect(result.ok).toBe(true);
            const render = globalStorage.get('renderSettings') as Record<string, unknown>;
            expect(render.fontFamily).toBe('fira-code');
        });

        it('refuses a key that no longer exists', () => {
            const result = applyProposal({
                kind: 'settingChange',
                key: 'nieIstniejaceUstawienie',
                value: 1,
            } as SettingChangeProposal);

            expect(result.ok).toBe(false);
        });
    });

    describe('alias', () => {
        it('appends to the aliases key', () => {
            const result = applyProposal({
                kind: 'alias',
                pattern: 'zz',
                command: 'zabij wszystko',
            } as AliasProposal);

            expect(result.ok).toBe(true);
            expect(globalStorage.get('aliases')).toEqual([{ pattern: 'zz', command: 'zabij wszystko' }]);
        });

        it('replaces an alias with the same pattern instead of duplicating it', () => {
            globalStorage.set('aliases', [{ pattern: 'zz', command: 'stara' }]);

            applyProposal({ kind: 'alias', pattern: 'zz', command: 'nowa' } as AliasProposal);

            expect(globalStorage.get('aliases')).toEqual([{ pattern: 'zz', command: 'nowa' }]);
        });
    });

    describe('trigger', () => {
        it('appends to the triggers key and normalises macros', () => {
            const validated = validateProposal({
                kind: 'trigger',
                type: 'event',
                event: 'kill',
                macros: [{ type: 'beep' }],
            });
            expect(validated.ok).toBe(true);

            const result = applyProposal(validated.proposal as TriggerProposal);

            expect(result.ok).toBe(true);
            const stored = globalStorage.get('triggers') as { event?: string; macros: { soundKey?: string }[] }[];
            expect(stored).toHaveLength(1);
            expect(stored[0].event).toBe('kill');
            // normalizeMacro fills the missing soundKey a bare `beep` needs
            expect(stored[0].macros[0].soundKey).toBe('beep');
        });

        it('keeps triggers that were already stored', () => {
            globalStorage.set('triggers', [{ type: 'pattern', pattern: 'abc', macros: [] }]);

            applyProposal({
                kind: 'trigger',
                type: 'pattern',
                pattern: 'xyz',
                macros: [{ type: 'command', command: 'polerz miecz' }],
            } as TriggerProposal);

            expect(globalStorage.get('triggers')).toHaveLength(2);
        });
    });

    describe('bind', () => {
        it('writes the active binds key, not just the keymap store', () => {
            const result = applyProposal({
                kind: 'bind',
                key: 'KeyQ',
                ctrl: true,
                command: 'zabij smoka',
            } as BindProposal);

            expect(result.ok).toBe(true);
            // `binds` is what KeyBindingManager, directionBinds, enemyBinds and
            // multibinds actually subscribe to; writing `keymaps` alone leaves the
            // bind dead until a keymap switch.
            const binds = globalStorage.get('binds') as { custom: { key: string; command: string; ctrl?: boolean }[] };
            expect(binds.custom).toContainEqual(expect.objectContaining({
                key: 'KeyQ',
                ctrl: true,
                command: 'zabij smoka',
            }));
            expect(globalStorage.get('keymaps')).toBeTruthy();
        });

        it('drops incomplete custom rows while merging', () => {
            globalStorage.set('binds', {
                custom: [{ key: '', command: '' }],
            } as never);

            applyProposal({ kind: 'bind', key: 'KeyW', command: 'idz' } as BindProposal);

            const binds = globalStorage.get('binds') as { custom: { key: string }[] };
            expect(binds.custom.every(row => row.key !== '')).toBe(true);
        });
    });
});
