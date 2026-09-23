import { globalStorage } from '@modules/core/storage';
import { getAutomationGroups } from '@modules/core/automation';
import type { UserAlias } from '@client/scripts/userAliases';
import type { UserTrigger } from '@client/scripts/userTriggers';
import {
    buildPack,
    deleteGroup,
    draftError,
    draftFromItem,
    ensureStoredIds,
    importPack,
    itemFromDraft,
    itemSummary,
    itemTitle,
    loadItems,
    newDraft,
    parsePack,
    sameDraft,
    setItemEnabled,
    writeItem,
    type AutomationItem,
} from '@web/automation/automationModel';

const aliases = () => globalStorage.get('aliases') as UserAlias[];
const triggers = () => globalStorage.get('triggers') as UserTrigger[];

describe('automationModel', () => {
    afterEach(() => {
        localStorage.clear();
    });

    it('gives stored elements ids once, and only when missing', () => {
        globalStorage.set('aliases', [{ pattern: 'a', command: 'x' }, { id: 'keep', pattern: 'b', command: 'y' }]);
        ensureStoredIds();
        const first = aliases();
        expect(first[0].id).toBeTruthy();
        expect(first[1].id).toBe('keep');

        const set = vi.spyOn(globalStorage, 'set');
        ensureStoredIds();
        expect(set).not.toHaveBeenCalled();
        set.mockRestore();
    });

    it('lists aliases and triggers together', () => {
        globalStorage.set('aliases', [{ id: 'a', pattern: 'zab (.+)', command: 'zabij $1' }]);
        globalStorage.set('triggers', [{ id: 't', pattern: 'foo', macros: [] }]);
        expect(loadItems().map(i => `${i.kind}:${i.id}`)).toEqual(['alias:a', 'trigger:t']);
    });

    describe('drafts', () => {
        it('round-trips a plain alias without changing how it is stored', () => {
            const item: AutomationItem = { kind: 'alias', id: 'a', data: { id: 'a', pattern: 'zab (.+)', command: 'zabij $1' } };
            const draft = draftFromItem(item, []);
            expect(sameDraft(draft, draftFromItem(item, []))).toBe(true);
            expect(itemFromDraft(draft).data).toEqual(item.data);
        });

        it('stores an alias with more actions as actions plus the command mirror', () => {
            const draft = newDraft('alias');
            draft.data = {
                ...draft.data,
                pattern: ' zab (.+) ',
                macros: [
                    { type: 'command', command: 'zabij $1' },
                    { type: 'notify', message: '' },
                    { type: 'command', command: 'zapal pochodnie' },
                ],
            } as UserAlias;
            const { data } = itemFromDraft(draft) as { data: UserAlias };
            expect(data.pattern).toBe('zab (.+)');
            expect(data.command).toBe('zabij $1;zapal pochodnie');
            // The empty notify would do nothing and is dropped.
            expect(data.macros?.map(m => m.type)).toEqual(['command', 'command']);
        });

        it('turns the typed group name into a group, created once', () => {
            const draft = newDraft('trigger', 'Walka');
            draft.data = { ...draft.data, pattern: 'foo' } as UserTrigger;
            const first = itemFromDraft(draft);
            const second = itemFromDraft({ ...draft, id: 'other' });
            expect(getAutomationGroups()).toHaveLength(1);
            expect(first.data.group).toBe(getAutomationGroups()[0].id);
            expect(second.data.group).toBe(first.data.group);
        });

        it('keeps only the fields of the trigger type being saved', () => {
            const draft = newDraft('trigger');
            draft.data = {
                ...draft.data,
                type: 'event',
                event: 'kill',
                pattern: 'left over',
                flags: 'i',
                conditions: [],
            } as UserTrigger;
            const { data } = itemFromDraft(draft) as { data: UserTrigger };
            expect(data).toEqual({ id: draft.id, type: 'event', event: 'kill', macros: [] });
        });

        it('stores a script with its command without the slash', () => {
            const draft = newDraft('script');
            draft.data = { ...draft.data, name: ' leczenie ', command: '/lecz' } as never;
            expect(itemFromDraft(draft).data).toMatchObject({ name: 'leczenie', command: 'lecz' });
        });

        it('checks a script name and command', () => {
            const items: AutomationItem[] = [{ kind: 'script', id: 'x', data: { id: 'x', name: 'a', code: 'c', command: 'lecz' } }];
            const draft = newDraft('script');
            expect(draftError(draft, items)).toBe('Nadaj skryptowi nazwe.');
            draft.data = { ...draft.data, name: 'b', command: 'zly znak' } as never;
            expect(draftError(draft, items)).toMatch(/litery, cyfry/);
            draft.data = { ...draft.data, command: '/lecz' } as never;
            expect(draftError(draft, items)).toBe('Inny skrypt ma juz te komende.');
            draft.data = { ...draft.data, command: 'inna' } as never;
            expect(draftError(draft, items)).toBeNull();
        });

        it('explains what stops a save', () => {
            const items: AutomationItem[] = [{ kind: 'alias', id: 'x', data: { id: 'x', pattern: 'zab', command: 'zabij' } }];
            const alias = newDraft('alias');
            expect(draftError(alias, items)).toBe('Wpisz wzorzec.');
            alias.data = { ...alias.data, pattern: 'zab' } as UserAlias;
            expect(draftError(alias, items)).toBe('Alias o takim wzorcu juz istnieje.');
            alias.data = { ...alias.data, pattern: '(' } as UserAlias;
            expect(draftError(alias, items)).toMatch(/wyrazeniem/);
            alias.data = { ...alias.data, pattern: 'nowy' } as UserAlias;
            expect(draftError(alias, items)).toBe('Dodaj co najmniej jedna akcje.');

            const trigger = newDraft('trigger');
            trigger.data = { ...trigger.data, type: 'event' } as UserTrigger;
            expect(draftError(trigger, items)).toBe('Wybierz zdarzenie.');
        });
    });

    it('switches an element on and off in storage', () => {
        const item: AutomationItem = { kind: 'trigger', id: 't', data: { id: 't', pattern: 'foo', macros: [] } };
        writeItem(item);
        setItemEnabled(item, false);
        expect(triggers()[0].enabled).toBe(false);
        setItemEnabled({ ...item, data: triggers()[0] }, true);
        expect('enabled' in triggers()[0]).toBe(false);
    });

    it('deleting a group keeps its elements, ungrouped', () => {
        globalStorage.set('automationGroups', [{ id: 'g', name: 'Walka' }]);
        globalStorage.set('aliases', [{ id: 'a', pattern: 'x', command: 'y', group: 'g' }]);
        deleteGroup('g');
        expect(getAutomationGroups()).toEqual([]);
        expect(aliases()[0]).toEqual({ id: 'a', pattern: 'x', command: 'y' });
    });

    describe('row text', () => {
        it('names an unnamed element by its pattern or event', () => {
            expect(itemTitle({ kind: 'alias', id: 'a', data: { pattern: 'zab (.+)', command: '' } })).toEqual({ text: 'zab (.+)', mono: true });
            expect(itemTitle({ kind: 'trigger', id: 't', data: { type: 'event', event: 'kill', macros: [] } }).prefix).toBe('Zdarzenie:');
        });

        it('summarises the actions, and the conditions of an event', () => {
            expect(itemSummary({
                kind: 'trigger',
                id: 't',
                data: { pattern: 'foo', macros: [{ type: 'color', color: '#f00' }, { type: 'command', command: 'zabij $1' }] },
            })).toBe('→ koloruj, zabij $1');
            expect(itemSummary({
                kind: 'trigger',
                id: 't',
                data: { type: 'event', event: 'gmcp.char.state', conditions: [{ arg: 'hp', op: 'lte', value: '2' }], macros: [] },
            })).toBe('gdy hp <= 2 brak akcji');
        });
    });

    describe('packs', () => {
        beforeEach(() => {
            globalStorage.set('automationGroups', [{ id: 'g', name: 'Walka' }, { id: 'h', name: 'Handel' }]);
            globalStorage.set('aliases', [
                { id: 'a', pattern: 'zab (.+)', command: 'zabij $1', group: 'g' },
                { id: 'b', pattern: 'sp', command: 'sprzedaj', group: 'h' },
            ]);
            globalStorage.set('triggers', [{ id: 't', pattern: 'foo', macros: [], group: 'g' }]);
        });

        it('exports one group with its record', () => {
            const pack = buildPack('g');
            expect(pack.groups).toEqual([{ id: 'g', name: 'Walka' }]);
            expect(pack.aliases.map(a => a.id)).toEqual(['a']);
            expect(pack.triggers.map(t => t.id)).toEqual(['t']);
        });

        it('imports into a clean profile, mapping groups by name', () => {
            const pack = parsePack(JSON.stringify(buildPack('g')));
            localStorage.clear();
            globalStorage.set('automationGroups', [{ id: 'mine', name: 'walka' }]);

            expect(importPack(pack)).toEqual({ aliases: 1, triggers: 1, scripts: 0, skipped: 0 });
            expect(getAutomationGroups()).toEqual([{ id: 'mine', name: 'walka' }]);
            expect(aliases()[0].group).toBe('mine');
            expect(aliases()[0].id).not.toBe('a');
        });

        it('skips what is already there', () => {
            expect(importPack(buildPack())).toEqual({ aliases: 0, triggers: 0, scripts: 0, skipped: 3 });
        });

        it('imports scripts switched off and points actions at their new ids', () => {
            globalStorage.set('automationScripts', [{ id: 's', name: 'leczenie', code: 'x', group: 'g' }]);
            globalStorage.set('aliases', [{
                id: 'a', pattern: 'lecz', command: '', group: 'g',
                macros: [{ type: 'script', scriptId: 's' }, { type: 'group', groupId: 'g', groupState: 'toggle' }],
            }]);
            const pack = buildPack('g');
            localStorage.clear();

            expect(importPack(pack)).toMatchObject({ aliases: 1, scripts: 1 });
            const script = (globalStorage.get('automationScripts') as { id: string; enabled?: boolean }[])[0];
            expect(script.enabled).toBe(false);
            expect(script.id).not.toBe('s');
            const [run, group] = aliases()[0].macros!;
            expect(run.scriptId).toBe(script.id);
            expect(group.groupId).toBe(getAutomationGroups()[0].id);
        });

        it('refuses a file that is not a pack', () => {
            expect(() => parsePack('{"aliases": []}')).toThrow(/automatyzacji/);
        });
    });
});
