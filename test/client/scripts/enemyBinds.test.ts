import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage, globalStorage } from '@modules/core/storage';
import type { PersonListEntry } from '@client/types/people';

// enemyBinds reads its enemy list from the merged people store; drive it directly.
let peopleListeners: ((s: PersonListEntry[]) => void)[] = [];
vi.mock('@modules/data/peopleLoader', () => ({
    subscribeMerged: (listener: (s: PersonListEntry[]) => void) => {
        peopleListeners.push(listener);
        return () => {};
    },
    refresh: () => Promise.resolve(),
}));

const initEnemyBinds = (await import('@client/scripts/enemyBinds')).default;

function createClient(printed: string[]): Client {
    return new Client({
        send: () => {},
        output: (out?: string | AnsiAwareBuffer) => {
            printed.push(typeof out === 'string' ? out : (out?.text ?? ''));
        },
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

const person = (description: string, extra: Partial<PersonListEntry> = {}): PersonListEntry => ({
    name: description,
    description,
    guild: '',
    isEnemy: true,
    ...extra,
} as PersonListEntry);

function press(key: string, mods: { ctrlKey?: boolean } = {}) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: key, key, bubbles: true, ...mods }));
}

describe('enemyBinds', () => {
    let client: Client;
    let printed: string[];
    let commands: string[];
    let offCommand: () => void;

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    function setPeople(list: PersonListEntry[]) {
        peopleListeners.forEach(l => l(list));
    }

    function seeObjects(objs: { num: number; desc: string }[]) {
        client.ObjectManager.getObjectsOnLocation = () => objs as any;
        const data: Record<string, { desc: string }> = {};
        objs.forEach(o => { data[String(o.num)] = { desc: o.desc }; });
        client.sendEvent('gmcp.objects.data', data as any);
    }

    function setup(settings: Record<string, unknown> = {}) {
        characterStorage.set('settings', {
            enemyGuilds: [],
            enemyBindsKeepUnchanged: false,
            enemyBindsShowMode: 'always',
            enemyBindsEnabledSlots: [true, true, true],
            ...settings,
        } as any);
        printed = [];
        commands = [];
        client = createClient(printed);
        const sink = commands;
        offCommand = client.on('command', (c: string) => { sink.push(c); });
        client.TeamManager.isLeader = () => false;
        initEnemyBinds(client, client.aliases);
    }

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        peopleListeners = [];
        offCommand = () => {};
    });

    afterEach(() => {
        offCommand();
        document.body.innerHTML = '';
    });

    describe('assigning slots', () => {
        test('enemies on the location fill the three slots in order', () => {
            setup();
            setPeople([person('wielki szczur'), person('goblin')]);

            seeObjects([{ num: 11, desc: 'wielki szczur' }, { num: 22, desc: 'goblin' }]);
            const out = output();

            expect(out).toContain('ATK: wielki szczur');
            expect(out).toContain('ATK: goblin');
        });

        test('non-enemies are ignored', () => {
            setup();
            setPeople([person('kupiec', { isEnemy: false })]);

            seeObjects([{ num: 11, desc: 'kupiec' }]);

            expect(output()).not.toContain('ATK:');
        });

        test('a hostile guild counts as an enemy', () => {
            setup({ enemyGuilds: ['zbojcy'] });
            setPeople([person('zbir', { isEnemy: false, guild: 'zbojcy' })]);

            seeObjects([{ num: 11, desc: 'zbir' }]);

            expect(output()).toContain('ATK: zbir');
        });

        test('a disabled slot is skipped', () => {
            setup({ enemyBindsEnabledSlots: [false, true, true] });
            setPeople([person('wielki szczur')]);

            seeObjects([{ num: 11, desc: 'wielki szczur' }]);

            expect(output()).toContain('F2');
            expect(output()).not.toContain('F1');
        });
    });

    describe('attacking', () => {
        beforeEach(() => {
            setup();
            setPeople([person('wielki szczur')]);
            seeObjects([{ num: 11, desc: 'wielki szczur' }]);
            output();
        });

        test('the bound key attacks the enemy in that slot', () => {
            press('F1');

            expect(commands).toContain(`${client.attackCommand} ob_11`);
        });

        test('the block key blocks it', () => {
            press('F1', { ctrlKey: true });

            expect(commands).toContain('zablokuj ob_11');
        });

        test('an empty slot does nothing', () => {
            press('F3');

            expect(commands).toEqual([]);
        });

        test('attackEnemySlot exposes the same action for mobile buttons', () => {
            client.attackEnemySlot(0);

            expect(commands).toContain(`${client.attackCommand} ob_11`);
        });

        test('blockEnemySlot does too', () => {
            client.blockEnemySlot(0);

            expect(commands).toContain('zablokuj ob_11');
        });

        test('an out-of-range slot is ignored', () => {
            client.attackEnemySlot(9);
            client.blockEnemySlot(-1);

            expect(commands).toEqual([]);
        });

        test('a helper hotkey attacks too', () => {
            client.sendEvent('helperBind', 'enemy1');

            expect(commands).toContain(`${client.attackCommand} ob_11`);
        });

        test('a helper block hotkey blocks', () => {
            client.sendEvent('helperBind', 'enemyBlock1');

            expect(commands).toContain('zablokuj ob_11');
        });
    });

    describe('/nabindach', () => {
        test('re-prints the current bindings', async () => {
            setup();
            setPeople([person('wielki szczur')]);
            seeObjects([{ num: 11, desc: 'wielki szczur' }]);
            output();

            await client.sendCommand('/nabindach');

            expect(output()).toContain('ATK: wielki szczur');
        });

        test('/nabindach-- clears and disables them', async () => {
            setup();
            setPeople([person('wielki szczur')]);
            seeObjects([{ num: 11, desc: 'wielki szczur' }]);
            output();

            await client.sendCommand('/nabindach--');
            expect(output()).toContain('cleared and disabled');

            // Assert through this client's own output: initEnemyBinds leaks a
            // window keydown listener per call, so earlier tests' clients still
            // react to F1 and the shared command bus cannot isolate this one.
            await client.sendCommand('/nabindach');
            const out = output();
            expect(out).toContain('Enemy binds are disabled');
            expect(out).not.toContain('ATK:');
        });

        test('a room change re-enables them', async () => {
            setup();
            setPeople([person('wielki szczur')]);
            seeObjects([{ num: 11, desc: 'wielki szczur' }]);
            await client.sendCommand('/nabindach--');
            output();

            client.sendEvent('gmcp.room.info', {} as any);
            seeObjects([{ num: 11, desc: 'wielki szczur' }]);

            expect(output()).toContain('ATK: wielki szczur');
        });
    });

    describe('keeping bindings stable', () => {
        test('with the setting on, an existing enemy keeps its slot', () => {
            setup({ enemyBindsKeepUnchanged: true });
            setPeople([person('wielki szczur'), person('goblin')]);

            seeObjects([{ num: 11, desc: 'wielki szczur' }]);
            output();
            // The rat is still here, and a goblin joins.
            seeObjects([{ num: 22, desc: 'goblin' }, { num: 11, desc: 'wielki szczur' }]);
            const out = output();

            const ratSlot = out.indexOf('wielki szczur');
            const goblinSlot = out.indexOf('goblin');
            expect(ratSlot).toBeLessThan(goblinSlot);
        });
    });

    test('a custom keymap replaces the default keys', () => {
        // All three slots must be supplied or the override is ignored.
        globalStorage.set('binds', {
            enemy: [{ key: 'KeyZ' }, { key: 'F2' }, { key: 'F3' }],
            enemyBlock: [{ key: 'KeyX' }, { key: 'F2', ctrl: true }, { key: 'F3', ctrl: true }],
        } as any);
        setup();
        setPeople([person('wielki szczur')]);
        seeObjects([{ num: 4712, desc: 'wielki szczur' }]);

        press('KeyZ');

        expect(commands).toContain(`${client.attackCommand} ob_4712`);
    });
});
