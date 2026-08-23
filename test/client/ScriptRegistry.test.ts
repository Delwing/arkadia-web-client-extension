import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import Client from '@client/Client';
import eventBus from '@modules/core/eventBus';
import { ScriptRegistry, type ScriptStart, type ScriptMeta } from '@client/ScriptRegistry';
import initLamp from '@client/scripts/lamp';
import initMoveMode from '@client/scripts/moveMode';
import initEnemyBinds from '@client/scripts/enemyBinds';
import initSelfEvaluation from '@client/scripts/selfEvaluation';
import { characterStorage, globalStorage } from '@modules/core/storage';
import { initKillCounter, getKillData, getLifetimeKillData } from '@client/scripts/kill';
import { initImproveCounter, getImproveData, getLifetimeData } from '@client/scripts/improveCounter';
import initLootParser, { getRoomContents, getBodyExtras, getBodyStertyMap } from '@client/scripts/lootParser';
import initShortcuts, { getShortcut } from '@client/scripts/shortcuts';
import initContainers, { getItemCssColor } from '@client/scripts/prettyContainers';
import initBagManager, { getContainer } from '@client/scripts/bagManager';
import initZlom, { mergeZlomData, getZlomFormatting } from '@client/scripts/zlom';
import { __resetZlomStoreForTests } from '@modules/data/zlomStore';
import { scriptCatalog } from '@client/scriptCatalog';

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

/** An in-memory DisabledScriptStore, so a test can start from a given set. */
function memoryStore(initial: string[] = []) {
    let ids = [...initial];
    return {read: () => ids, write: (next: string[]) => { ids = next; }};
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

    /** Declare a plan and run it, for the tests that are about one script's mechanics. */
    function launch(...scripts: Array<[string, ScriptStart] | [string, ScriptStart, ScriptMeta]>) {
        for (const [id, run, meta] of scripts) registry.declare(id, run, meta);
        registry.launch();
    }

    test('a launched script gets a client and the alias list', () => {
        const start = vi.fn();

        launch(['demo', start]);

        expect(start).toHaveBeenCalledTimes(1);
        const [client, aliases] = start.mock.calls[0];
        expect(client).toBeInstanceOf(Client);
        expect(aliases).toBe(client.aliases);
    });

    test('it tracks what is running, in declared order', () => {
        launch(['a', () => {}], ['b', () => {}]);

        expect(registry.running).toEqual(['a', 'b']);
        expect(registry.isRunning('a')).toBe(true);
        expect(registry.isRunning('c')).toBe(false);
    });

    test('declaring does not start anything on its own', () => {
        const start = vi.fn();
        registry.declare('demo', start);

        expect(start).not.toHaveBeenCalled();
        expect(registry.running).toEqual([]);
        // Declared but not running is exactly the state a disabled script is in.
        expect(registry.declared).toEqual(['demo']);
    });

    test('stopping undoes what the script registered', () => {
        const before = host.Triggers.triggers.size;
        launch(['demo', (client, aliases) => {
            client.Triggers.registerTrigger(/hello/, line => line);
            aliases.push({ pattern: /^\/demo$/, callback: () => {} });
        }]);

        expect(registry.stop('demo')).toBe(true);

        expect(registry.isRunning('demo')).toBe(false);
        expect(host.Triggers.triggers.size).toBe(before);
        expect(host.aliases).toHaveLength(0);
    });

    test('stopping something that never ran says so', () => {
        expect(registry.stop('nope')).toBe(false);
    });

    test('a stopped script keeps its place in the plan', () => {
        // This is what makes a toggle possible: the registry still knows how to
        // start it again, and what it declared.
        launch(['demo', () => {}, {optional: ['demo']}]);
        registry.stop('demo');

        expect(registry.declared).toEqual(['demo']);
        expect(registry.metaFor('demo')).toEqual({optional: ['demo']});
    });

    test('declaring the same id twice is a mistake, not a no-op', () => {
        registry.declare('demo', () => {});

        expect(() => registry.declare('demo', () => {})).toThrow(/already declared/);
    });

    test('launching twice is refused', () => {
        launch(['demo', () => {}]);

        expect(() => registry.launch()).toThrow(/already been launched/);
    });

    test('a script that throws leaves nothing behind', () => {
        const before = host.Triggers.triggers.size;

        expect(() => launch(['demo', (client) => {
            client.Triggers.registerTrigger(/hello/, line => line);
            throw new Error('boom');
        }])).toThrow('boom');

        expect(registry.isRunning('demo')).toBe(false);
        expect(host.Triggers.triggers.size).toBe(before);
    });

    test('stopAll unwinds newest first', () => {
        const order: string[] = [];
        launch(
            ['a', client => client.scope.onDispose(() => order.push('a'))],
            ['b', client => client.scope.onDispose(() => order.push('b'))],
        );

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
    const registered = Array.from(source.matchAll(/^\s*registry\.declare\('([^']+)'/gm), m => m[1]);
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
        registry.declare('lamp', initLamp);
        registry.launch();
        host.onLine('Zapalasz lampe.', 'text');

        vi.advanceTimersByTime(3000);
        const counted = ticks.length;
        expect(counted, 'the countdown is running').toBeGreaterThan(1);

        registry.stop('lamp');
        vi.advanceTimersByTime(5000);

        expect(ticks).toHaveLength(counted);
    });

    test('moveMode stops answering the keyboard', () => {
        registry.declare('moveMode', initMoveMode);
        registry.launch();
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

    test('an after edge whose target is declared later is refused', () => {
        registry.declare('combatWindow', () => {}, { after: ['gags'] });
        registry.declare('gags', () => {});

        expect(() => registry.launch()).toThrow(/declares after: "gags"/);
    });

    test('an after edge whose target is declared earlier is fine', () => {
        registry.declare('gags', () => {});
        registry.declare('combatWindow', () => {}, { after: ['gags'] });

        expect(() => registry.launch()).not.toThrow();
        expect(registry.running).toEqual(['gags', 'combatWindow']);
    });

    test('an after edge on a script the user turned off is not a violation', () => {
        // `after` is about sequence, and a script that is not running has no
        // sequence to be in. Refusing here would make turning off `gags` take
        // `combatWindow` with it, which is what `requires` is for.
        const registry = new ScriptRegistry(host, memoryStore(['gags']));
        registry.declare('gags', () => {});
        registry.declare('combatWindow', () => {}, { after: ['gags'] });

        expect(() => registry.launch()).not.toThrow();
        expect(registry.running).toEqual(['combatWindow']);
    });

    test('requires may name a script declared later', () => {
        // Four of the real edges run consumer-first — itemCollector before
        // lootParser, idz before shortcuts — and work because the read happens in a
        // runtime callback. requires is about enablement, not order.
        registry.declare('itemCollector', () => {}, { requires: ['lootParser'] });
        registry.declare('lootParser', () => {});

        expect(() => registry.launch()).not.toThrow();
    });

    test('a dependency on a script that does not exist is caught', () => {
        registry.declare('pipe', () => {}, { requires: ['herbCouner'] });

        expect(() => registry.launch()).toThrow(/pipe -> herbCouner/);
    });

    test('an optional dependency is checked for existence too', () => {
        registry.declare('deposits', () => {}, { optional: ['nosuchscript'] });

        expect(() => registry.launch()).toThrow(/deposits -> nosuchscript/);
    });

    test('a dependency that is merely turned off is not an error', () => {
        // Checked against the plan, not against what is running: turned off is a
        // legitimate state, never-declared is a typo.
        const registry = new ScriptRegistry(host, memoryStore(['bagManager']));
        registry.declare('lamp', () => {}, { optional: ['bagManager'] });
        registry.declare('bagManager', () => {});

        expect(() => registry.launch()).not.toThrow();
    });
});

describe('turning scripts off and on', () => {
    let host: Client;
    let registry: ScriptRegistry;
    let store: ReturnType<typeof memoryStore>;

    beforeEach(() => {
        localStorage.clear();
        host = createClient();
        store = memoryStore();
        registry = new ScriptRegistry(host, store);
    });

    test('a script the user turned off never starts', () => {
        const start = vi.fn();
        const registry = new ScriptRegistry(host, memoryStore(['demo']));
        registry.declare('demo', start);

        registry.launch();

        expect(start).not.toHaveBeenCalled();
        expect(registry.running).toEqual([]);
        expect(registry.stateOf('demo')).toEqual({status: 'off'});
    });

    test('disabling stops it and undoes what it registered', () => {
        const before = host.Triggers.triggers.size;
        registry.declare('demo', client => client.Triggers.registerTrigger(/hi/, line => line));
        registry.launch();

        expect(registry.disable('demo')).toEqual(['demo']);

        expect(registry.isRunning('demo')).toBe(false);
        expect(host.Triggers.triggers.size).toBe(before);
    });

    test('enabling starts it again', () => {
        const start = vi.fn();
        registry.declare('demo', start);
        registry.launch();
        registry.disable('demo');

        expect(registry.enable('demo')).toEqual(['demo']);

        expect(start).toHaveBeenCalledTimes(2);
        expect(registry.stateOf('demo')).toEqual({status: 'running'});
    });

    test('the choice is persisted, and honoured on the next launch', () => {
        registry.declare('demo', () => {});
        registry.launch();
        registry.disable('demo');

        expect(store.read()).toEqual(['demo']);

        const next = new ScriptRegistry(host, store);
        const start = vi.fn();
        next.declare('demo', start);
        next.launch();

        expect(start).not.toHaveBeenCalled();
    });

    test('disabling twice changes nothing the second time', () => {
        registry.declare('demo', () => {});
        registry.launch();
        registry.disable('demo');

        expect(registry.disable('demo')).toEqual([]);
    });

    test('toggling something that was never declared is a mistake', () => {
        expect(() => registry.disable('nope')).toThrow(/not declared/);
        expect(() => registry.enable('nope')).toThrow(/not declared/);
    });
});

describe('the requires cascade', () => {
    let host: Client;
    let registry: ScriptRegistry;

    beforeEach(() => {
        localStorage.clear();
        host = createClient();
        registry = new ScriptRegistry(host);
        // The real shape: idz and mapAliases cannot work without shortcuts.
        registry.declare('shortcuts', () => {});
        registry.declare('idz', () => {}, { requires: ['shortcuts'] });
        registry.declare('mapAliases', () => {}, { requires: ['shortcuts'] });
        registry.declare('deep', () => {}, { requires: ['idz'] });
        registry.launch();
    });

    test('turning off a dependency takes its dependants with it', () => {
        const stopped = registry.disable('shortcuts');

        expect(stopped.sort()).toEqual(['deep', 'idz', 'mapAliases', 'shortcuts']);
        expect(registry.running).toEqual([]);
    });

    test('the cascade is reported as blocked, not as a choice the user made', () => {
        registry.disable('shortcuts');

        expect(registry.stateOf('shortcuts')).toEqual({status: 'off'});
        expect(registry.stateOf('idz')).toEqual({status: 'blocked', by: 'shortcuts'});
        // Two hops from the script that was actually turned off.
        expect(registry.stateOf('deep')).toEqual({status: 'blocked', by: 'shortcuts'});
    });

    test('only the user’s own choice is stored, never the cascade', () => {
        const store = memoryStore();
        const registry = new ScriptRegistry(host, store);
        registry.declare('shortcuts', () => {});
        registry.declare('idz', () => {}, { requires: ['shortcuts'] });
        registry.launch();

        registry.disable('shortcuts');

        // Storing `idz` too would make it indistinguishable from a deliberate
        // choice, and re-enabling shortcuts would leave it off for good.
        expect(store.read()).toEqual(['shortcuts']);
    });

    test('re-enabling the dependency brings the dependants back', () => {
        registry.disable('shortcuts');

        const started = registry.enable('shortcuts');

        expect(started).toEqual(['shortcuts', 'idz', 'mapAliases', 'deep']);
        expect(registry.running).toEqual(['shortcuts', 'idz', 'mapAliases', 'deep']);
    });

    test('a dependant turned off by hand stays off when the dependency returns', () => {
        registry.disable('idz');
        registry.disable('shortcuts');

        registry.enable('shortcuts');

        expect(registry.isRunning('shortcuts')).toBe(true);
        expect(registry.isRunning('mapAliases')).toBe(true);
        expect(registry.stateOf('idz')).toEqual({status: 'off'});
        // deep requires idz, which the user turned off, so it stays blocked.
        expect(registry.stateOf('deep')).toEqual({status: 'blocked', by: 'idz'});
    });

    test('a cycle in requires does not hang the check', () => {
        // Nothing stops someone writing one; `requires` is a declaration.
        const registry = new ScriptRegistry(host, memoryStore());
        registry.declare('a', () => {}, { requires: ['b'] });
        registry.declare('b', () => {}, { requires: ['a'] });

        expect(() => registry.launch()).not.toThrow();
        expect(registry.running).toEqual(['a', 'b']);
    });
});

describe('the running set is published to the UI', () => {
    let host: Client;
    let registry: ScriptRegistry;
    let seen: Array<{ running: string[]; disabled: string[] }>;

    beforeEach(() => {
        localStorage.clear();
        host = createClient();
        registry = new ScriptRegistry(host);
        seen = [];
        eventBus.on('scripts.stateChanged', payload => seen.push(payload));
    });

    afterEach(() => {
        eventBus.removeAllListeners?.('scripts.stateChanged');
    });

    test('launching announces what is running', () => {
        registry.declare('a', () => {});
        registry.declare('b', () => {});

        registry.launch();

        expect(seen.at(-1)).toEqual({ running: ['a', 'b'], disabled: [] });
    });

    test('a toggle announces the new state', () => {
        registry.declare('a', () => {});
        registry.declare('b', () => {}, { requires: ['a'] });
        registry.launch();

        registry.disable('a');

        // The UI needs both halves: `running` to hide what is gone, `disabled` to
        // show a switch as off rather than as blocked.
        expect(seen.at(-1)).toEqual({ running: [], disabled: ['a'] });
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
        registry.declare('enemyBinds', initEnemyBinds);
        registry.launch();
        expect(host.attackEnemySlot).not.toBe(stub);

        registry.stop('enemyBinds');

        // Left installed, the mobile buttons would keep firing attacks through a
        // script that is no longer running.
        expect(host.attackEnemySlot).toBe(stub);
        expect(Object.hasOwn(host, "attackEnemySlot")).toBe(false);
    });

    test('selfEvaluation unmutes the item evaluations', () => {
        const aliases: { pattern: RegExp; callback: Function }[] = [];
        registry.declare('selfEvaluation', (client) => initSelfEvaluation(client, aliases));
        registry.launch();
        aliases.find(alias => alias.pattern.test("/ocen"))!.callback();
        expect(host.suppressItemEvaluation, 'the bulk read-out mutes them').toBe(true);

        registry.stop('selfEvaluation');

        // The mute is a latch. Stopping mid-read-out would leave weaponEvaluation,
        // armorEvaluation and parryShieldEvaluation silent for good.
        expect(host.suppressItemEvaluation).toBe(false);
    });
});

describe('scripts do not subscribe to storage behind the scope', () => {
    // A storage listener that outlives its script is worse than a leak: the next
    // settings change refills the very state `stop` just cleared, so a stopped
    // script starts answering again. The unsubscribe onChange hands back has to go
    // somewhere — a `scope.onDispose(...)` wrap, or a list the script returns.
    const dirs = [scriptsDir, resolve(scriptsDir, 'lib')];
    const sources = dirs.flatMap(dir =>
        readdirSync(dir, { withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
            .map(entry => [entry.name, readFileSync(resolve(dir, entry.name), 'utf8')] as const),
    );

    const CALL = /(?:characterStorage\.onChange|globalStorage\.onChange|\.onAnyChange)\s*\(/g;

    /** A call whose value nobody takes is a statement of its own. */
    function droppedSubscriptions(source: string): number[] {
        const dropped: number[] = [];
        CALL.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = CALL.exec(source)) !== null) {
            let i = match.index - 1;
            while (i >= 0 && /\s/.test(source[i])) i--;
            // `(` from a wrap, `[` or `,` from a collected list, `=` from a binding.
            if (i < 0 || ';{}'.includes(source[i])) {
                dropped.push(source.slice(0, match.index).split('\n').length);
            }
        }
        return dropped;
    }

    test('every storage subscription is kept somewhere it can be undone', () => {
        const offenders = sources
            .filter(([, source]) => droppedSubscriptions(source).length > 0)
            .map(([name, source]) => `${name}:${droppedSubscriptions(source).join(',')}`);

        expect(offenders).toEqual([]);
    });

    test('the check can tell a dropped subscription from a kept one', () => {
        expect(droppedSubscriptions('characterStorage.onChange("settings", fn);')).toEqual([1]);
        expect(droppedSubscriptions('client.scope.onDispose(characterStorage.onChange("s", fn));')).toEqual([]);
        expect(droppedSubscriptions('const off = globalStorage.onChange("binds", fn);')).toEqual([]);
        expect(droppedSubscriptions('const all = [\n  characterStorage.onChange("s", fn),\n];')).toEqual([]);
    });
});

describe('a stopped script stops answering for its data', () => {
    // Stage 4. Each of these reads from module state that outlives the script, so
    // without a reset the owner keeps serving numbers nobody is maintaining. The
    // answer has to be *absent*, not empty: an empty history and a stopped counter
    // are different facts, and only one of them is worth showing a user.
    //
    // These are runtime assertions on purpose. The repo compiles with
    // `strict: false`, so a `| null` return type does not make callers handle it —
    // the guarantee lives here, not in tsc.
    let host: Client;
    let registry: ScriptRegistry;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        host = createClient();
        registry = new ScriptRegistry(host);
    });

    test('kill stops reporting a session', () => {
        registry.declare('kill', (client, aliases) => initKillCounter(client, aliases));
        registry.launch();
        expect(getKillData()).not.toBeNull();

        registry.stop('kill');

        expect(getKillData()).toBeNull();
        expect(getLifetimeKillData()).toBeNull();
    });

    test('improveCounter stops reporting progress', () => {
        registry.declare('improveCounter', (client, aliases) => initImproveCounter(client, aliases));
        registry.launch();
        expect(getImproveData()).not.toBeNull();

        registry.stop('improveCounter');

        expect(getImproveData()).toBeNull();
        // Not `[]` — a fresh character has an empty history and is still counting.
        expect(getLifetimeData()).toBeNull();
    });

    test('lootParser stops reporting what is on the ground', () => {
        registry.declare('lootParser', initLootParser);
        registry.launch();
        expect(getRoomContents()).not.toBeNull();

        registry.stop('lootParser');

        expect(getRoomContents()).toBeNull();
        expect(getBodyExtras()).toBeNull();
        expect(getBodyStertyMap()).toBeNull();
    });

    test('shortcuts stops resolving names', () => {
        globalStorage.set('shortcuts', [{ key: 'bank', id: 123, label: 'Bank' }] as never);
        registry.declare('shortcuts', (client, aliases) => initShortcuts(client, aliases));
        registry.launch();
        expect(getShortcut('bank')).toBe(123);

        registry.stop('shortcuts');

        expect(getShortcut('bank')).toBeUndefined();
    });

    test('a stopped shortcuts is not refilled by an edit in the options', () => {
        registry.declare('shortcuts', (client, aliases) => initShortcuts(client, aliases));
        registry.launch();
        registry.stop('shortcuts');

        globalStorage.set('shortcuts', [{ key: 'bank', id: 123, label: 'Bank' }] as never);

        expect(getShortcut('bank')).toBeUndefined();
    });

    test('prettyContainers stops colouring items', () => {
        registry.declare('prettyContainers', initContainers);
        registry.launch();
        expect(getItemCssColor('zlota moneta')).toBe('#ffd700');

        registry.stop('prettyContainers');

        expect(getItemCssColor('zlota moneta')).toBeUndefined();
    });

    test('bagManager falls back to the default bag', () => {
        characterStorage.set('containers', { money: 'sakiewka', gems: 'sakiewka', food: 'sakiewka', other: 'sakiewka' } as never);
        registry.declare('bagManager', (client, aliases) => initBagManager(client, aliases));
        registry.launch();
        expect(getContainer('money')).toBe('sakiewka');

        registry.stop('bagManager');

        // Not null: getContainer is public plugin API and its shape is decision 1
        // in docs/SCRIPT_DEPENDENCIES.md. The character's choice still goes.
        expect(getContainer('money')).toBe('plecak');
    });

    test('zlom stops formatting items', async () => {
        await __resetZlomStoreForTests();
        await mergeZlomData({
            bronie: [{
                short: 'zardzewialy nozyk', typ: 'noz', rodzaj: '', klute: 0, obuch: 0, ciete: 0,
                chwyt: '', magik: 0, srebro: 1, opis: 'Nozyk.', waga: 0, obj: 0, cena: 10,
                wywazenie: 0, parowanie: 0, roomId: null,
            }],
            tarcze: [],
            zbroje: [],
        }, 'replace');

        registry.declare('zlom', (client, aliases) => initZlom(client, aliases));
        registry.launch();
        expect(getZlomFormatting('zardzewialy nozyk')).toBeDefined();

        registry.stop('zlom');

        // The entries live in IndexedDB and outlive the script, so "is there
        // anything to say" is the wrong question — "is anyone saying it" is.
        expect(getZlomFormatting('zardzewialy nozyk')).toBeUndefined();
    });
});

describe('the script catalog covers exactly the registered scripts', () => {
    // The toggle list is only as good as its labels, and a script with no label
    // would either vanish from the list or show up as a bare module name. Both
    // directions are checked so neither side can drift.
    const registered = [...readFileSync(mainPath, 'utf8').matchAll(/^\s*registry\.declare\('([^']+)'/gm)]
        .map(match => match[1]);

    test('every registered script has a label', () => {
        expect(registered.filter(id => !scriptCatalog[id])).toEqual([]);
    });

    test('the catalog names nothing that is not registered', () => {
        expect(Object.keys(scriptCatalog).filter(id => !registered.includes(id))).toEqual([]);
    });

    test('every entry has a title and a description', () => {
        const incomplete = Object.entries(scriptCatalog)
            .filter(([, entry]) => !entry.title?.trim() || !entry.description?.trim())
            .map(([id]) => id);

        expect(incomplete).toEqual([]);
    });

    test('no two scripts share a title', () => {
        // A settings list with two rows reading the same thing is unusable.
        const seen = new Map<string, string>();
        const clashes: string[] = [];
        for (const [id, entry] of Object.entries(scriptCatalog)) {
            const first = seen.get(entry.title);
            if (first) clashes.push(`${first} / ${id}: ${entry.title}`);
            else seen.set(entry.title, id);
        }

        expect(clashes).toEqual([]);
    });
});
