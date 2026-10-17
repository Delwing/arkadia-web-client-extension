import { globalStorage } from '@modules/core/storage';
import { getAutomationGroups } from '@modules/core/automation';
import { evaluateCondition, SUPPORTED_EVENTS, type UserTrigger } from '@client/scripts/userTriggers';
import { expandAliasCommand } from '@client/scripts/userAliases';
import { importPack, loadItems, writeItem } from '@web/automation/automationModel';
import { LIBRARY, recipeItems, recipePack } from '@web/automation/automationLibrary';

const triggers = () => globalStorage.get('triggers') as UserTrigger[];

describe('automationLibrary', () => {
    afterEach(() => {
        localStorage.clear();
    });

    it('has unique ids and only events the editor offers', () => {
        expect(new Set(LIBRARY.map(r => r.id)).size).toBe(LIBRARY.length);
        const events = new Set(SUPPORTED_EVENTS.map(e => e.id));
        for (const recipe of LIBRARY) {
            for (const t of recipe.triggers ?? []) {
                if (t.type === 'event') expect(events.has(t.event!), `${recipe.id}: ${t.event}`).toBe(true);
            }
        }
    });

    it('adds a recipe into its named group, once', () => {
        const recipe = LIBRARY.find(r => r.id === 'attack-sound')!;
        expect(recipeItems(recipe)).toEqual([]);

        expect(importPack(recipePack(recipe)).triggers).toBe(1);
        const group = getAutomationGroups().find(g => g.name === recipe.group)!;
        expect(group).toBeTruthy();
        expect(triggers()[0]).toMatchObject({ event: 'attack', group: group.id });
        expect(recipeItems(recipe)).toHaveLength(1);

        const again = importPack(recipePack(recipe));
        expect(again).toMatchObject({ triggers: 0, skipped: 1 });
        expect(getAutomationGroups()).toHaveLength(1);
    });

    it('still finds a renamed recipe, but not a changed one', () => {
        const recipe = LIBRARY.find(r => r.id === 'attack-sound')!;
        importPack(recipePack(recipe));
        const [item] = loadItems();
        if (item.kind !== 'trigger') throw new Error('expected a trigger');

        writeItem({ ...item, data: { ...item.data, name: 'Mój atak' } });
        expect(recipeItems(recipe)).toHaveLength(1);

        writeItem({ ...item, data: { ...item.data, macros: [{ type: 'beep', soundKey: 'user:dzwonek' }] } });
        expect(recipeItems(recipe)).toEqual([]);
    });

    it('tells triggers apart by their conditions', () => {
        const mail = LIBRARY.find(r => r.id === 'mail-unreceived-sound')!;
        const [trigger] = mail.triggers!;
        globalStorage.set('triggers', [{ ...trigger, id: 'x', conditions: [{ arg: 'unread', op: 'eq', value: 'true' }] }]);
        expect(recipeItems(mail)).toEqual([]);
        expect(importPack(recipePack(mail)).triggers).toBe(1);
    });

    it('beeps on mail only while a letter waits to be picked up', () => {
        const [condition] = LIBRARY.find(r => r.id === 'mail-unreceived-sound')!.triggers![0].conditions!;
        expect(evaluateCondition(condition, { unreceived: true, unread: false })).toBe(true);
        expect(evaluateCondition(condition, { unreceived: false, unread: true })).toBe(false);
    });
});

describe('cocoons alias', () => {
    const [alias] = LIBRARY.find(r => r.id === 'cocoons-alias')!.aliases!;
    const send = (typed: string) => {
        const m = typed.match(new RegExp(`^${alias.pattern}$`));
        return m ? expandAliasCommand(alias.command, m) : null;
    };

    it('tears open every cocoon in the range, or just the one', () => {
        expect(send('kok 1-3')).toEqual(['rozerwij 1. kokon', 'rozerwij 2. kokon', 'rozerwij 3. kokon']);
        expect(send('kok 2')).toEqual(['rozerwij 2. kokon']);
        expect(send('kok')).toBeNull();
    });
});
