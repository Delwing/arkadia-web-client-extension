import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import type { PersonListEntry } from '@client/types/people';

// allyProtection reads its ally list from the merged people store; drive it directly.
let peopleListeners: ((s: PersonListEntry[]) => void)[] = [];
vi.mock('@modules/data/peopleLoader', () => ({
    subscribeMerged: (listener: (s: PersonListEntry[]) => void) => {
        peopleListeners.push(listener);
        return () => {};
    },
    refresh: () => Promise.resolve(),
}));

const initAllyProtection = (await import('@client/scripts/allyProtection')).default;

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

const person = (name: string, extra: Partial<PersonListEntry> = {}): PersonListEntry => ({
    name,
    description: name,
    guild: '',
    ignored: false,
    isEnemy: false,
    isAlly: false,
    source: 'remote',
    ...extra,
} as PersonListEntry);

describe('allyProtection', () => {
    let client: Client;
    let printed: string[];
    let ally: ReturnType<typeof initAllyProtection>;

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    /** Publish the people list to every instance's subscription. */
    function setPeople(list: PersonListEntry[]) {
        peopleListeners.forEach(l => l(list));
    }

    /** What the game says is on the location, and the GMCP push that caches it. */
    function seeObjects(objs: { num: number; desc: string }[]) {
        client.ObjectManager.getObjectsOnLocation = () => objs as any;
        const data: Record<string, { desc: string }> = {};
        objs.forEach(o => { data[String(o.num)] = { desc: o.desc }; });
        client.sendEvent('gmcp.objects.data', data as any);
    }

    function setup(settings: Record<string, unknown> = {}) {
        characterStorage.set('settings', settings as any);
        printed = [];
        client = createClient(printed);
        ally = initAllyProtection(client);
    }

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        peopleListeners = [];
    });

    afterEach(() => vi.useRealTimers());

    describe('who counts as an ally', () => {
        test('nobody, when no allies are configured', () => {
            setup();
            setPeople([person('Ala')]);
            seeObjects([{ num: 1, desc: 'Ala' }]);

            expect(ally.isAlly(1)).toBe(false);
        });

        test('somebody marked as an ally individually', () => {
            setup();
            setPeople([person('Ala', { isAlly: true })]);
            seeObjects([{ num: 1, desc: 'Ala' }]);

            expect(ally.isAlly(1)).toBe(true);
        });

        test('somebody in an ally guild', () => {
            setup({ allyGuilds: ['zakon'] });
            setPeople([person('Ala', { guild: 'zakon' })]);
            seeObjects([{ num: 1, desc: 'Ala' }]);

            expect(ally.isAlly(1)).toBe(true);
        });

        test('somebody in another guild is not', () => {
            setup({ allyGuilds: ['zakon'] });
            setPeople([person('Ala', { guild: 'zbojcy' })]);
            seeObjects([{ num: 1, desc: 'Ala' }]);

            expect(ally.isAlly(1)).toBe(false);
        });

        test('an ignored person never counts', () => {
            setup();
            setPeople([person('Ala', { isAlly: true, ignored: true })]);
            seeObjects([{ num: 1, desc: 'Ala' }]);

            expect(ally.isAlly(1)).toBe(false);
        });

        test.each([
            ['wielki szczur', 'a multi-word description'],
            ['ala', 'a lowercase name'],
        ])('%s is not a proper player name, so it never counts (%s)', (name) => {
            setup();
            setPeople([person(name, { isAlly: true })]);
            seeObjects([{ num: 1, desc: name }]);

            expect(ally.isAlly(1)).toBe(false);
        });

        test('matching is case-insensitive', () => {
            setup();
            setPeople([person('Ala', { isAlly: true })]);
            seeObjects([{ num: 1, desc: 'ALA' }]);

            expect(ally.isAlly(1)).toBe(true);
        });

        test('an unknown object is not an ally', () => {
            setup();
            setPeople([person('Ala', { isAlly: true })]);
            seeObjects([{ num: 1, desc: 'Ala' }]);

            expect(ally.isAlly(99)).toBe(false);
        });
    });

    describe('resolving without a GMCP push', () => {
        test('it falls back to the objects on the location', () => {
            setup();
            setPeople([person('Ala', { isAlly: true })]);
            // No gmcp.objects.data — only the object list is available.
            client.ObjectManager.getObjectsOnLocation = () => [{ num: 5, desc: 'Ala' }] as any;

            expect(ally.isAlly(5)).toBe(true);
        });

        test('with no allies configured it does not even look', () => {
            setup();
            setPeople([]);
            const spy = vi.fn(() => [{ num: 5, desc: 'Ala' }] as any);
            client.ObjectManager.getObjectsOnLocation = spy;

            expect(ally.isAlly(5)).toBe(false);
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('ally info', () => {
        test('carries the name and guild for the warning', () => {
            setup({ allyGuilds: ['zakon'] });
            setPeople([person('Ala', { guild: 'zakon' })]);
            seeObjects([{ num: 1, desc: 'Ala' }]);

            expect(ally.getAllyInfo(1)).toEqual({ name: 'Ala', guild: 'zakon' });
        });

        test('is undefined for a non-ally', () => {
            setup();
            setPeople([person('Ala')]);
            seeObjects([{ num: 1, desc: 'Ala' }]);

            expect(ally.getAllyInfo(1)).toBeUndefined();
        });
    });

    // The gate itself. Ally protection is a command hook, so every test here goes
    // through sendCommand — the same path the attack bind, the enemy binds, an
    // alias, a plugin and a hand-typed command all funnel into.
    describe('gating an attack command', () => {
        let commands: string[];
        let offCommand: () => void;

        function allyOnLocation() {
            setup();
            setPeople([person('Ala', { isAlly: true, guild: 'zakon' })]);
            seeObjects([{ num: 1, desc: 'Ala', shortcut: 'a' }]);
            commands = [];
            const sink = commands;
            offCommand = client.on('command', (c: string) => { sink.push(c); });
        }

        beforeEach(() => { offCommand = () => {}; });
        afterEach(() => offCommand());

        test('the first attempt is blocked and warns', async () => {
            allyOnLocation();

            await client.sendCommand('zabij ob_1');

            expect(commands, 'nothing should reach the game').toEqual([]);
            const out = output();
            expect(out).toContain('[UWAGA]');
            expect(out).toContain('Ala');
            expect(out).toContain('zakon');
            expect(out).toContain('Powtorz komende aby potwierdzic.');
        });

        test('repeating it within five seconds confirms', async () => {
            allyOnLocation();

            await client.sendCommand('zabij ob_1');
            await client.sendCommand('zabij ob_1');

            expect(commands).toEqual(['zabij ob_1']);
        });

        test('a third attempt starts over', async () => {
            allyOnLocation();
            await client.sendCommand('zabij ob_1');
            await client.sendCommand('zabij ob_1');
            commands.length = 0;
            output();

            await client.sendCommand('zabij ob_1');

            expect(commands).toEqual([]);
            expect(output()).toContain('[UWAGA]');
        });

        test('the confirmation expires after five seconds', async () => {
            allyOnLocation();
            await client.sendCommand('zabij ob_1');

            vi.advanceTimersByTime(5001);
            await client.sendCommand('zabij ob_1');

            expect(commands).toEqual([]);
        });

        test('it still counts just under five seconds', async () => {
            allyOnLocation();
            await client.sendCommand('zabij ob_1');

            vi.advanceTimersByTime(4999);
            await client.sendCommand('zabij ob_1');

            expect(commands).toEqual(['zabij ob_1']);
        });

        test('confirming one ally does not confirm another', async () => {
            setup();
            setPeople([person('Ala', { isAlly: true }), person('Bela', { isAlly: true })]);
            seeObjects([{ num: 1, desc: 'Ala' }, { num: 2, desc: 'Bela' }]);
            commands = [];
            const sink = commands;
            offCommand = client.on('command', (c: string) => { sink.push(c); });

            await client.sendCommand('zabij ob_1');
            await client.sendCommand('zabij ob_2');

            expect(commands).toEqual([]);
        });

        test('changing room drops the pending confirmation', async () => {
            allyOnLocation();
            await client.sendCommand('zabij ob_1');

            client.sendEvent('gmcp.room.info', {} as any);
            await client.sendCommand('zabij ob_1');

            expect(commands).toEqual([]);
        });

        test('attacking a non-ally goes straight through', async () => {
            setup();
            setPeople([person('Ala', { isAlly: true })]);
            seeObjects([{ num: 1, desc: 'Ala' }, { num: 2, desc: 'Bela' }]);
            commands = [];
            const sink = commands;
            offCommand = client.on('command', (c: string) => { sink.push(c); });

            await client.sendCommand('zabij ob_2');

            expect(commands).toEqual(['zabij ob_2']);
            expect(output()).not.toContain('[UWAGA]');
        });

        test('an object shortcut is resolved, since hooks run before expansion', async () => {
            allyOnLocation();

            await client.sendCommand('zabij @a');

            expect(commands).toEqual([]);
            expect(output()).toContain('[UWAGA]');
        });

        test('a bulk attack skips the ally silently', async () => {
            allyOnLocation();

            await client.sendCommand('zabij ob_1', true, { suppressPrompts: true });

            expect(commands).toEqual([]);
            expect(output(), 'no prompt during attack-all').not.toContain('[UWAGA]');
        });

        test('the configured attack command is what gates', async () => {
            setup({ attackCommand: 'atakuj' });
            setPeople([person('Ala', { isAlly: true })]);
            seeObjects([{ num: 1, desc: 'Ala' }]);
            commands = [];
            const sink = commands;
            offCommand = client.on('command', (c: string) => { sink.push(c); });

            await client.sendCommand('atakuj ob_1');
            expect(commands, 'the configured command is gated').toEqual([]);

            await client.sendCommand('zabij ob_1');
            expect(commands, 'the default is not, once reconfigured').toEqual(['zabij ob_1']);
        });

        test('unrelated commands are never touched', async () => {
            allyOnLocation();

            await client.sendCommand('rozejrzyj sie');
            await client.sendCommand('zabij');
            await client.sendCommand('ob_1');

            expect(commands).toEqual(['rozejrzyj sie', 'zabij', 'ob_1']);
            expect(output()).not.toContain('[UWAGA]');
        });

        test('with no allies configured nothing is gated', async () => {
            setup();
            setPeople([person('Ala')]);
            seeObjects([{ num: 1, desc: 'Ala' }]);
            commands = [];
            const sink = commands;
            offCommand = client.on('command', (c: string) => { sink.push(c); });

            await client.sendCommand('zabij ob_1');

            expect(commands).toEqual(['zabij ob_1']);
        });
    });

    describe('reacting to changes', () => {
        test('changing room clears the cached lookups', () => {
            setup();
            setPeople([person('Ala', { isAlly: true })]);
            seeObjects([{ num: 1, desc: 'Ala' }]);
            expect(ally.isAlly(1)).toBe(true);

            client.sendEvent('gmcp.room.info', {} as any);
            // Same number, different person now standing there.
            client.ObjectManager.getObjectsOnLocation = () => [{ num: 1, desc: 'Bela' }] as any;

            expect(ally.isAlly(1)).toBe(false);
        });

        test('a new people list is picked up', () => {
            setup();
            setPeople([person('Ala')]);
            seeObjects([{ num: 1, desc: 'Ala' }]);
            expect(ally.isAlly(1)).toBe(false);

            setPeople([person('Ala', { isAlly: true })]);

            expect(ally.isAlly(1)).toBe(true);
        });

        test('changing the ally guilds setting is picked up', () => {
            setup();
            setPeople([person('Ala', { guild: 'zakon' })]);
            seeObjects([{ num: 1, desc: 'Ala' }]);
            expect(ally.isAlly(1)).toBe(false);

            characterStorage.set('settings', { allyGuilds: ['zakon'] } as any);

            expect(ally.isAlly(1)).toBe(true);
        });
    });
});
