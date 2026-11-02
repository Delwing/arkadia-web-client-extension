import { globalStorage } from '@modules/core/storage';
import { getAutomationGroups } from '@modules/core/automation';
import type { UserAlias } from '@client/scripts/userAliases';
import type { UserTrigger } from '@client/scripts/userTriggers';
import {
    buildItemPack,
    buildPack,
    createGroup,
    deleteGroup,
    effectiveGroup,
    moveGroup,
    moveItem,
    placeDraft,
    sortItems,
    draftError,
    draftFromItem,
    ensureStoredIds,
    importPack,
    itemFromDraft,
    itemSearchText,
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

/** The window's items for these stored aliases. */
function loadItemsWith(list: UserAlias[]): AutomationItem[] {
    globalStorage.set('aliases', list);
    return loadItems();
}
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
            const draft = draftFromItem(item);
            expect(sameDraft(draft, draftFromItem(item))).toBe(true);
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

        it('does not count a move as an edit', () => {
            const item: AutomationItem = { kind: 'alias', id: 'a', data: { id: 'a', pattern: 'x', command: 'y' } };
            const moved: AutomationItem = { ...item, data: { ...item.data, group: 'g', order: 3 } };
            expect(sameDraft(draftFromItem(item), draftFromItem(moved))).toBe(true);
        });

        it('saves an edited element where it is now, not where it was when opened', () => {
            globalStorage.set('automationGroups', [{ id: 'g', name: 'Walka' }]);
            const draft = draftFromItem({ kind: 'alias', id: 'a', data: { id: 'a', pattern: 'x', command: 'y' } });
            const stored = loadItemsWith([{ id: 'a', pattern: 'x', command: 'y', group: 'g', order: 2 }]);
            expect(placeDraft(draft, stored).data).toMatchObject({ group: 'g', order: 2 });
        });

        it('puts a new element at the end of its group', () => {
            globalStorage.set('automationGroups', [{ id: 'g', name: 'Walka' }]);
            const stored = loadItemsWith([
                { id: 'a', pattern: 'a', command: 'a', group: 'g', order: 0 },
                { id: 'b', pattern: 'b', command: 'b', group: 'g', order: 4 },
                { id: 'c', pattern: 'c', command: 'c', order: 9 },
            ]);
            expect(placeDraft(newDraft('trigger', 'g'), stored).data).toMatchObject({ group: 'g', order: 5 });
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

        it('stores one message type as a string, several as a list, none as nothing', () => {
            const save = (gmcpMsgType: string[]) => {
                const draft = newDraft('trigger');
                draft.data = { ...draft.data, pattern: 'tarcze', gmcpMsgType } as UserTrigger;
                return (itemFromDraft(draft) as { data: UserTrigger }).data.gmcpMsgType;
            };
            expect(save(['living.long'])).toBe('living.long');
            expect(save(['living.long', 'object.long'])).toEqual(['living.long', 'object.long']);
            expect(save([])).toBeUndefined();
        });

        it('stores a script with its command without the slash', () => {
            const draft = newDraft('script');
            draft.data = { ...draft.data, name: ' leczenie ', command: '/lecz' } as never;
            expect(itemFromDraft(draft).data).toMatchObject({ name: 'leczenie', command: 'lecz' });
        });

        it('checks a script name and command', () => {
            const items: AutomationItem[] = [{ kind: 'script', id: 'x', data: { id: 'x', name: 'a', code: 'c', command: 'lecz' } }];
            const draft = newDraft('script');
            expect(draftError(draft, items)).toBe('Nadaj skryptowi nazwę.');
            draft.data = { ...draft.data, name: 'b', command: 'zly znak' } as never;
            expect(draftError(draft, items)).toMatch(/litery, cyfry/);
            draft.data = { ...draft.data, command: '/lecz' } as never;
            expect(draftError(draft, items)).toBe('Inny skrypt ma już tę komendę.');
            draft.data = { ...draft.data, command: 'inna' } as never;
            expect(draftError(draft, items)).toBeNull();
        });

        it('explains what stops a save', () => {
            const items: AutomationItem[] = [{ kind: 'alias', id: 'x', data: { id: 'x', pattern: 'zab', command: 'zabij' } }];
            const alias = newDraft('alias');
            expect(draftError(alias, items)).toBe('Wpisz wzorzec.');
            alias.data = { ...alias.data, pattern: 'zab' } as UserAlias;
            expect(draftError(alias, items)).toBe('Alias o takim wzorcu już istnieje.');
            alias.data = { ...alias.data, pattern: '(' } as UserAlias;
            expect(draftError(alias, items)).toContain('wyrażeniem');
            alias.data = { ...alias.data, pattern: 'nowy' } as UserAlias;
            expect(draftError(alias, items)).toBe('Dodaj co najmniej jedną akcję.');

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

    it('deleting a group deletes its elements too', () => {
        globalStorage.set('automationGroups', [{ id: 'g', name: 'Walka' }, { id: 'h', name: 'Handel' }]);
        globalStorage.set('aliases', [
            { id: 'a', pattern: 'x', command: 'y', group: 'g' },
            { id: 'b', pattern: 'z', command: 'y' },
        ]);
        globalStorage.set('triggers', [{ id: 't', pattern: 'foo', macros: [], group: 'g' }, { id: 'u', pattern: 'bar', macros: [], group: 'h' }]);
        globalStorage.set('automationScripts', [{ id: 's', name: 'x', code: 'log(1)', group: 'g' }]);
        deleteGroup('g');
        expect(getAutomationGroups().map(g => g.id)).toEqual(['h']);
        expect(aliases().map(a => a.id)).toEqual(['b']);
        expect(triggers().map(t => t.id)).toEqual(['u']);
        expect(globalStorage.get('automationScripts')).toEqual([]);
    });

    describe('groups and order', () => {
        const order = () => sortItems(loadItems()).map(i => `${i.id}:${i.data.group ?? '-'}`);

        beforeEach(() => {
            globalStorage.set('automationGroups', [{ id: 'g', name: 'Walka' }, { id: 'h', name: 'Handel' }]);
            globalStorage.set('aliases', [
                { id: 'a', pattern: 'a', command: 'a', group: 'g' },
                { id: 'b', pattern: 'b', command: 'b', group: 'g' },
            ]);
            globalStorage.set('triggers', [{ id: 't', pattern: 't', macros: [], group: 'g' }]);
        });

        it('keeps the stored order until something is moved', () => {
            expect(order()).toEqual(['a:g', 'b:g', 't:g']);
        });

        it('reorders across kinds within a group', () => {
            moveItem('trigger', 't', 'g', 'a');
            expect(order()).toEqual(['t:g', 'a:g', 'b:g']);
        });

        it('moves into another group and out of any', () => {
            moveItem('alias', 'b', 'h');
            expect(order().filter(x => x.endsWith(':h'))).toEqual(['b:h']);
            moveItem('alias', 'b', undefined);
            expect(aliases().find(a => a.id === 'b')).not.toHaveProperty('group');
        });

        it('treats a group that is gone as none', () => {
            globalStorage.set('aliases', [{ id: 'a', pattern: 'a', command: 'a', group: 'gone' }]);
            expect(effectiveGroup(loadItems()[0], getAutomationGroups())).toBeUndefined();
        });

        it('creates numbered new groups and reorders groups', () => {
            const id = createGroup();
            const second = createGroup();
            expect(getAutomationGroups().map(g => g.name)).toEqual(['Walka', 'Handel', 'Nowa grupa', 'Nowa grupa 2']);
            moveGroup(second, 'g');
            expect(getAutomationGroups().map(g => g.id)[0]).toBe(second);
            moveGroup('g');
            expect(getAutomationGroups().map(g => g.id)).toEqual([second, 'h', id, 'g']);
        });
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

        it('says what starts a script, and only "nieużywany" when nothing does', () => {
            const script = (data: object) => itemSummary({ kind: 'script', id: 's', data: { name: 'x', code: '', ...data } });
            expect(script({})).toBe('nieużywany');
            expect(script({ onLogin: true })).toBe('przy zalogowaniu');
            expect(script({ command: 'start', onLogin: true })).toBe('/start · przy zalogowaniu');
        });
    });

    describe('timers', () => {
        it('saves a new timer with its empty actions dropped, and lists it', () => {
            const draft = newDraft('timer');
            expect(draftError(draft, [])).toBe('Dodaj co najmniej jedną akcję.');

            const data = { ...draft.data, seconds: 90, once: false, macros: [{ type: 'command' as const, command: 'pij' }, { type: 'command' as const, command: ' ' }] };
            const ready = { ...draft, data };
            expect(draftError(ready, [])).toBeNull();
            writeItem(itemFromDraft(placeDraft(ready, [])));

            const [item] = loadItems();
            expect(item.kind).toBe('timer');
            expect(item.data).toMatchObject({ seconds: 90, macros: [{ type: 'command', command: 'pij' }] });
            expect('once' in item.data).toBe(false);
            expect(itemTitle(item)).toEqual({ text: 'co 1 min 30 s', mono: false, prefix: 'Timer:' });
            expect(itemSummary(item)).toBe('→ pij');
            expect(itemSearchText(item, [])).toContain('timer co 1 min 30 s');
        });

        it('refuses an interval out of range', () => {
            const draft = newDraft('timer');
            const withSeconds = (seconds: number) => ({ ...draft, data: { ...draft.data, seconds, macros: [{ type: 'command' as const, command: 'x' }] } });
            expect(draftError(withSeconds(0), [])).toMatch(/od 1 s do 24 h/);
            expect(draftError(withSeconds(90_000), [])).toMatch(/od 1 s do 24 h/);
            expect(draftError(withSeconds(1), [])).toBeNull();
        });

        it('is started by a trigger action, which travels with the trigger and points at the new timer on import', () => {
            globalStorage.set('automationTimers', [
                { id: 'tm', name: 'woda', seconds: 30, once: true, start: 'action', macros: [{ type: 'command', command: 'pij' }] },
            ]);
            globalStorage.set('triggers', [{ id: 'tr', pattern: 'Pragniesz', macros: [{ type: 'timer', timerId: 'tm' }] }]);
            const items = loadItems();
            const timerItem = items.find(i => i.id === 'tm')!;
            const triggerItem = items.find(i => i.id === 'tr')!;
            expect(itemSummary(triggerItem)).toBe('→ uruchom timer woda');
            expect(itemSummary(timerItem, undefined, items)).toBe('raz po 30 s → pij · uruchamiany przez 1 element');

            const pack = buildItemPack(triggerItem);
            expect(pack.timers!.map(t => t.id)).toEqual(['tm']);
            localStorage.clear();
            expect(importPack(parsePack(JSON.stringify(pack)))).toMatchObject({ triggers: 1, timers: 1 });
            const [imported] = globalStorage.get('automationTimers') as { id: string }[];
            expect(triggers()[0].macros[0].timerId).toBe(imported.id);
            expect(imported.id).not.toBe('tm');
        });

        it('keeps the start mode only when it is not the default', () => {
            const draft = newDraft('timer');
            const save = (start?: 'auto' | 'action') => itemFromDraft({ ...draft, data: { ...draft.data, start, macros: [{ type: 'command', command: 'x' }] } }).data;
            expect(save('action')).toMatchObject({ start: 'action' });
            expect('start' in save('auto')).toBe(false);
            expect(draftError({ ...draft, data: { ...draft.data, macros: [{ type: 'timer' }] } }, [])).toBe('Dodaj co najmniej jedną akcję.');
        });

        it('goes with its group', () => {
            globalStorage.set('automationGroups', [{ id: 'g', name: 'Walka' }]);
            globalStorage.set('automationTimers', [{ id: 'tm', seconds: 5, macros: [], group: 'g' }, { id: 'keep', seconds: 5, macros: [] }]);
            deleteGroup('g');
            expect(loadItems().map(i => i.id)).toEqual(['keep']);
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

            expect(importPack(pack)).toEqual({ aliases: 1, triggers: 1, scripts: 0, timers: 0, skipped: 0 });
            expect(getAutomationGroups()).toEqual([{ id: 'mine', name: 'walka' }]);
            expect(aliases()[0].group).toBe('mine');
            expect(aliases()[0].id).not.toBe('a');
        });

        it('skips what is already there', () => {
            expect(importPack(buildPack())).toEqual({ aliases: 0, triggers: 0, scripts: 0, timers: 0, skipped: 3 });
        });

        it('imports scripts as they were and points actions at their new ids', () => {
            globalStorage.set('automationScripts', [
                { id: 's', name: 'leczenie', code: 'x', group: 'g' },
                { id: 'off', name: 'stary', code: 'y', group: 'g', enabled: false },
            ]);
            globalStorage.set('aliases', [{
                id: 'a', pattern: 'lecz', command: '', group: 'g',
                macros: [{ type: 'script', scriptId: 's' }, { type: 'group', groupId: 'g', groupState: 'toggle' }],
            }]);
            const pack = buildPack('g');
            localStorage.clear();

            expect(importPack(pack)).toMatchObject({ aliases: 1, scripts: 2 });
            const [script, off] = globalStorage.get('automationScripts') as { id: string; enabled?: boolean }[];
            expect(script.enabled).toBeUndefined();
            expect(off.enabled).toBe(false);
            expect(script.id).not.toBe('s');
            const [run, group] = aliases()[0].macros!;
            expect(run.scriptId).toBe(script.id);
            expect(group.groupId).toBe(getAutomationGroups()[0].id);
        });

        it('exports one item with the scripts it runs', () => {
            globalStorage.set('automationScripts', [
                { id: 's', name: 'leczenie', code: 'x', group: 'h' },
                { id: 'other', name: 'inny', code: 'y' },
            ]);
            globalStorage.set('aliases', [{ id: 'a', pattern: 'lecz', command: '', group: 'g', macros: [{ type: 'script', scriptId: 's' }] }]);
            const alias = loadItems().find(i => i.id === 'a')!;
            const pack = buildItemPack(alias);
            expect(pack.aliases.map(a => a.id)).toEqual(['a']);
            expect(pack.triggers).toEqual([]);
            expect(pack.scripts!.map(s => s.id)).toEqual(['s']);
            expect(pack.groups.map(g => g.name)).toEqual(['Walka', 'Handel']);

            const script = loadItems().find(i => i.id === 'other')!;
            expect(buildItemPack(script)).toMatchObject({ aliases: [], triggers: [], groups: [], scripts: [{ id: 'other' }] });
        });

        it('exports and imports timers, pointing their actions at new ids and skipping duplicates', () => {
            globalStorage.set('automationScripts', [{ id: 's', name: 'leczenie', code: 'x', group: 'g' }]);
            globalStorage.set('automationTimers', [{
                id: 'tm', seconds: 30, group: 'g',
                macros: [{ type: 'script', scriptId: 's' }, { type: 'group', groupId: 'g', groupState: 'off' }],
            }]);
            const pack = parsePack(JSON.stringify(buildPack('g')));
            expect(pack.timers!.map(t => t.id)).toEqual(['tm']);
            localStorage.clear();

            expect(importPack(pack)).toMatchObject({ timers: 1, scripts: 1 });
            const [timer] = globalStorage.get('automationTimers') as { id: string; group: string; macros: { scriptId?: string; groupId?: string }[] }[];
            const [script] = globalStorage.get('automationScripts') as { id: string }[];
            const group = getAutomationGroups()[0].id;
            expect(timer.id).not.toBe('tm');
            expect(timer.group).toBe(group);
            expect(timer.macros[0].scriptId).toBe(script.id);
            expect(timer.macros[1].groupId).toBe(group);

            expect(importPack(pack)).toMatchObject({ timers: 0 });
        });

        it('reads a pack from before timers', () => {
            const { timers: _t, ...old } = buildPack();
            expect(parsePack(JSON.stringify(old)).timers).toEqual([]);
        });

        it('refuses a file that is not a pack', () => {
            expect(() => parsePack('{"aliases": []}')).toThrow(/okna Skrypty/);
        });
    });
});

describe("itemSearchText", () => {
    it("folds diacritics so a plain query finds them", () => {
        const item: AutomationItem = { kind: 'alias', id: 'a', data: { id: 'a', name: 'Zasłoń Łucję', pattern: 'zz', command: 'zaslon lucje' } };
        expect(itemSearchText(item, [])).toContain('zaslon lucje');
    });
});
