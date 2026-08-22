import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import Client from '@client/Client';
import { ScriptRegistry } from '@client/ScriptRegistry';
import initLamp from '@client/scripts/lamp';
import initMoveMode from '@client/scripts/moveMode';
import initEnemyBinds from '@client/scripts/enemyBinds';
import initSelfEvaluation from '@client/scripts/selfEvaluation';

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => true,
    });
}

const scriptsDir = resolve(process.cwd(), 'src/client/scripts');
const mainPath = resolve(process.cwd(), 'src/client/main.ts');

describe('ScriptRegistry', () => {
    let host: Client;
    let registry: ScriptRegistry;

    beforeEach(() => {
        localStorage.clear();
        host = createClient();
        registry = new ScriptRegistry(host);
    });

    test('a started script gets a client and the alias list', () => {
        const start = vi.fn();

        registry.start('demo', start);

        expect(start).toHaveBeenCalledTimes(1);
        const [client, aliases] = start.mock.calls[0];
        expect(client).toBeInstanceOf(Client);
        expect(aliases).toBe(client.aliases);
    });

    test('it tracks what is running, in start order', () => {
        registry.start('a', () => {});
        registry.start('b', () => {});

        expect(registry.running).toEqual(['a', 'b']);
        expect(registry.isRunning('a')).toBe(true);
        expect(registry.isRunning('c')).toBe(false);
    });

    test('stopping undoes what the script registered', () => {
        const before = host.Triggers.triggers.size;
        registry.start('demo', (client, aliases) => {
            client.Triggers.registerTrigger(/hello/, line => line);
            aliases.push({ pattern: /^\/demo$/, callback: () => {} });
        });

        expect(registry.stop('demo')).toBe(true);

        expect(registry.isRunning('demo')).toBe(false);
        expect(host.Triggers.triggers.size).toBe(before);
        expect(host.aliases).toHaveLength(0);
    });

    test('stopping something that never ran says so', () => {
        expect(registry.stop('nope')).toBe(false);
    });

    test('a script can be restarted after being stopped', () => {
        const start = vi.fn();
        registry.start('demo', start);
        registry.stop('demo');

        registry.start('demo', start);

        expect(start).toHaveBeenCalledTimes(2);
        expect(registry.isRunning('demo')).toBe(true);
    });

    test('starting the same id twice is a mistake, not a no-op', () => {
        registry.start('demo', () => {});

        expect(() => registry.start('demo', () => {})).toThrow(/already running/);
    });

    test('a script that throws leaves nothing behind', () => {
        const before = host.Triggers.triggers.size;

        expect(() => registry.start('demo', (client) => {
            client.Triggers.registerTrigger(/hello/, line => line);
            throw new Error('boom');
        })).toThrow('boom');

        expect(registry.isRunning('demo')).toBe(false);
        expect(host.Triggers.triggers.size).toBe(before);
    });

    test('a script that throws leaves no declaration behind either', () => {
        expect(() => registry.start('demo', () => {
            throw new Error('boom');
        }, {optional: ['other']})).toThrow('boom');

        expect(registry.metaFor('demo')).toBeUndefined();
        expect(() => registry.verifyDependencies()).not.toThrow();
    });

    test('stopAll unwinds newest first', () => {
        const order: string[] = [];
        registry.start('a', client => client.scope.onDispose(() => order.push('a')));
        registry.start('b', client => client.scope.onDispose(() => order.push('b')));

        registry.stopAll();

        expect(order).toEqual(['b', 'a']);
        expect(registry.running).toEqual([]);
    });
});

describe('registerScripts covers exactly the scripts directory', () => {
    // The one rule from AGENTS.md that keeps the set of scripts enumerable:
    // everything directly under scripts/ is registered, and nothing else is.
    // Read statically — starting all 148 for real would be a slow way to count.
    const source = readFileSync(mainPath, 'utf8');
    const registered = Array.from(source.matchAll(/^\s*registry\.start\('([^']+)'/gm), m => m[1]);
    const modules = readdirSync(scriptsDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
        .map(entry => entry.name.replace(/\.ts$/, ''));

    test('every module under scripts/ is registered', () => {
        expect([...modules].sort().filter(m => !registered.includes(m))).toEqual([]);
    });

    test('every registered id is a module under scripts/', () => {
        expect([...registered].sort().filter(id => !modules.includes(id))).toEqual([]);
    });

    test('no module is registered twice', () => {
        const seen = new Set<string>();
        const twice = registered.filter(id => seen.size === seen.add(id).size);
        expect(twice).toEqual([]);
    });

    test('the count is what the docs claim', () => {
        expect(registered).toHaveLength(modules.length);
        expect(modules.length).toBeGreaterThan(140);
    });
});

describe('stopping a real script takes its timers and listeners with it', () => {
    let host: Client;
    let registry: ScriptRegistry;

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        host = createClient();
        registry = new ScriptRegistry(host);
    });

    afterEach(() => vi.useRealTimers());

    test('lamp stops counting down', () => {
        const ticks: unknown[] = [];
        host.on('lampTimer', seconds => ticks.push(seconds));
        registry.start('lamp', initLamp);
        host.onLine('Zapalasz lampe.', 'text');

        vi.advanceTimersByTime(3000);
        const counted = ticks.length;
        expect(counted, 'the countdown is running').toBeGreaterThan(1);

        registry.stop('lamp');
        vi.advanceTimersByTime(5000);

        expect(ticks).toHaveLength(counted);
    });

    test('moveMode stops answering the keyboard', () => {
        registry.start('moveMode', initMoveMode);
        host.moveMode = 0;

        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
        expect(host.moveMode, 'the bind cycles the mode').not.toBe(0);

        const settled = host.moveMode;
        registry.stop('moveMode');
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));

        expect(host.moveMode).toBe(settled);
    });
});

describe('scripts do not register against window behind the scope', () => {
    // Anything registered straight on `window` outlives the script that made it,
    // so a toggle would leave it running. Caught here rather than at review time.
    const sources = readdirSync(scriptsDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
        .map(entry => [entry.name, readFileSync(resolve(scriptsDir, entry.name), 'utf8')] as const);

    test.each([
        ['window.setInterval', /\bwindow\.setInterval\s*\(/],
        ['window.addEventListener', /\bwindow\.addEventListener\s*\(/],
        ['document.addEventListener', /\bdocument\.addEventListener\s*\(/],
    ])('no script calls %s directly', (_name, pattern) => {
        expect(sources.filter(([, source]) => pattern.test(source)).map(([name]) => name)).toEqual([]);
    });
});

describe('declared dependencies', () => {
    let host: Client;
    let registry: ScriptRegistry;

    beforeEach(() => {
        localStorage.clear();
        host = createClient();
        registry = new ScriptRegistry(host);
    });

    test('an after edge whose target is not running yet is refused', () => {
        expect(() => registry.start('combatWindow', () => {}, { after: ['gags'] }))
            .toThrow(/declares after: "gags"/);
    });

    test('the failed start leaves nothing registered', () => {
        expect(() => registry.start('combatWindow', () => {}, { after: ['gags'] })).toThrow();

        expect(registry.isRunning('combatWindow')).toBe(false);
        expect(registry.metaFor('combatWindow')).toBeUndefined();
    });

    test('an after edge whose target is already running is fine', () => {
        registry.start('gags', () => {});

        expect(() => registry.start('combatWindow', () => {}, { after: ['gags'] })).not.toThrow();
    });

    test('requires may name a script that starts later', () => {
        // Four of the real edges run consumer-first — itemCollector before
        // lootParser, idz before shortcuts — and work because the read happens in a
        // runtime callback. requires is about enablement, not order.
        registry.start('itemCollector', () => {}, { requires: ['lootParser'] });
        registry.start('lootParser', () => {});

        expect(() => registry.verifyDependencies()).not.toThrow();
    });

    test('a dependency on a script that does not exist is caught', () => {
        registry.start('pipe', () => {}, { requires: ['herbCouner'] });

        expect(() => registry.verifyDependencies()).toThrow(/pipe -> herbCouner/);
    });

    test('an optional dependency is checked for existence too', () => {
        registry.start('deposits', () => {}, { optional: ['nosuchscript'] });

        expect(() => registry.verifyDependencies()).toThrow(/deposits -> nosuchscript/);
    });

    test('stopping a script leaves its dependents declaring something absent', () => {
        // Startup check only. Once the toggle UI exists this is the signal to
        // cascade or degrade, not to throw — see stage 6.
        registry.start('lamp', () => {}, { optional: ['bagManager'] });
        registry.start('bagManager', () => {});

        registry.stop('bagManager');

        expect(() => registry.verifyDependencies()).toThrow(/lamp -> bagManager/);
    });
});

describe('stopping a script puts back what it changed on the client', () => {
    let host: Client;
    let registry: ScriptRegistry;

    beforeEach(() => {
        localStorage.clear();
        host = createClient();
        registry = new ScriptRegistry(host);
    });

    test('enemyBinds restores the stubs Client declares', () => {
        const stub = host.attackEnemySlot;
        registry.start('enemyBinds', initEnemyBinds);
        expect(host.attackEnemySlot).not.toBe(stub);

        registry.stop('enemyBinds');

        // Left installed, the mobile buttons would keep firing attacks through a
        // script that is no longer running.
        expect(host.attackEnemySlot).toBe(stub);
        expect(Object.hasOwn(host, "attackEnemySlot")).toBe(false);
    });

    test('selfEvaluation unmutes the item evaluations', () => {
        const aliases: { pattern: RegExp; callback: Function }[] = [];
        registry.start('selfEvaluation', (client) => initSelfEvaluation(client, aliases));
        aliases.find(alias => alias.pattern.test("/ocen"))!.callback();
        expect(host.suppressItemEvaluation, 'the bulk read-out mutes them').toBe(true);

        registry.stop('selfEvaluation');

        // The mute is a latch. Stopping mid-read-out would leave weaponEvaluation,
        // armorEvaluation and parryShieldEvaluation silent for good.
        expect(host.suppressItemEvaluation).toBe(false);
    });
});
