import { describe, test, expect, beforeEach } from 'vitest';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import Client from '@client/Client';
import { registerScripts } from '@client/main';
import type { ScriptRegistry } from '@client/ScriptRegistry';
import { getKillData, getLifetimeKillData } from '@client/scripts/kill';
import { getImproveData, getLifetimeData } from '@client/scripts/improveCounter';
import { getRoomContents, getBodyExtras, getBodyStertyMap } from '@client/scripts/lootParser';
import { getShortcut } from '@client/scripts/shortcuts';
import { getItemCssColor } from '@client/scripts/prettyContainers';
import { getContainer } from '@client/scripts/bagManager';
import { getZlomFormatting } from '@client/scripts/zlom';
import { getHerbManager } from '@modules/core/herbManagerProvider';
import { characterStorage } from '@modules/core/storage';

/**
 * The real thing: every script started the way the app starts them.
 *
 * Cheaper checks elsewhere read main.ts as text; this one runs it, so it is what
 * actually proves the declared `after` edges hold in the written order, that every
 * `requires` names a registered script, and that no script throws on init.
 */

const scriptsDir = resolve(process.cwd(), 'src/client/scripts');

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

describe('registerScripts', () => {
    let client: Client;
    let baseline: { triggers: number; multiline: number; aliases: number };
    let registry: ScriptRegistry;

    beforeEach(() => {
        localStorage.clear();
        client = createClient();
        // The client wires up a few triggers of its own before any script runs.
        baseline = {
            triggers: client.Triggers.triggers.size,
            multiline: client.Triggers.multilineTriggers.size,
            aliases: client.aliases.length,
        };
        registry = registerScripts(client);
    });

    test('starts every module under scripts/, and only those', () => {
        const modules = readdirSync(scriptsDir, { withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
            .map(entry => entry.name.replace(/\.ts$/, ''));

        expect([...registry.running].sort()).toEqual([...modules].sort());
    });

    test('the declared after edges hold in the written order', () => {
        // start() throws if they do not, so reaching here already proves it — but
        // name them, so a failure says which edge moved rather than just "threw".
        const order = registry.running;
        const at = (id: string) => order.indexOf(id);

        expect(at('combatWindow')).toBeGreaterThan(at('gags'));
        expect(at('combatWindow')).toBeGreaterThan(at('luaGags'));
        expect(at('messageFlair')).toBeGreaterThan(at('lootParser'));
    });

    test('every declared dependency names a script that exists', () => {
        expect(() => registry.verifyDependencies()).not.toThrow();
    });

    test('a requires edge is recorded where the code actually reads across', () => {
        // pipe reads the herb manager herbCounter registers; without it, it does
        // nothing at all — which is the difference between requires and optional.
        expect(registry.metaFor('pipe')?.requires).toContain('herbCounter');
        expect(registry.metaFor('itemCollector')?.optional).toContain('lootParser');
    });

    describe('stopping everything', () => {
        test('leaves no owned trigger behind', () => {
            expect(client.Triggers.triggers.size).toBeGreaterThan(baseline.triggers);

            registry.stopAll();

            // What survives is what no script owns: the client's own triggers plus
            // the pager ENTER auto-continue registered by registerScripts itself.
            const owned = (map: Map<string, {owner?: string}>) =>
                Array.from(map.values()).filter(trigger => trigger.owner !== undefined);

            expect(owned(client.Triggers.triggers)).toEqual([]);
            expect(owned(client.Triggers.multilineTriggers)).toEqual([]);
            expect(client.Triggers.triggers.size).toBe(baseline.triggers + 1);
            expect(client.Triggers.multilineTriggers.size).toBe(baseline.multiline);
        });

        test('leaves no owned alias behind', () => {
            expect(client.aliases.length).toBeGreaterThan(baseline.aliases);

            registry.stopAll();

            // /blokada and /reload-plugins belong to the client, not to a script.
            // Spread first: AliasList.filter builds another AliasList, whose own
            // bucket fields would make an equality check on it read oddly.
            expect([...client.aliases].filter(alias => alias.owner !== undefined)).toEqual([]);
            expect(client.aliases.length).toBe(baseline.aliases + 2);
        });

        test('leaves nothing running', () => {
            registry.stopAll();

            expect(registry.running).toEqual([]);
        });

test('leaves no module singleton answering', () => {
            // Every getter that reads state one script owns. Started for real, so
            // this is the whole set as the app has it, not a stub of it.
            expect(getKillData()).not.toBeNull();
            expect(getRoomContents()).not.toBeNull();

            registry.stopAll();

            expect(getKillData()).toBeNull();
            expect(getLifetimeKillData()).toBeNull();
            expect(getImproveData()).toBeNull();
            expect(getLifetimeData()).toBeNull();
            expect(getRoomContents()).toBeNull();
            expect(getBodyExtras()).toBeNull();
            expect(getBodyStertyMap()).toBeNull();
            expect(getShortcut('bank')).toBeUndefined();
            expect(getItemCssColor('zlota moneta')).toBeUndefined();
            expect(getZlomFormatting('cokolwiek')).toBeUndefined();
            expect(getHerbManager()).toBeNull();
            // getContainer stays plugin API and keeps its default. Decision 1.
            expect(getContainer('money')).toBe('plecak');
        });

        test('the line pipeline still works afterwards', () => {
            registry.stopAll();

            const parts = client.onLine('Rozgladasz sie dookola.', 'text');

            expect(parts).toHaveLength(1);
            expect(parts[0].text).toBe('Rozgladasz sie dookola.');
        });
    });
});

describe('registerScripts honours what the character turned off', () => {
    // The real path, not a stub of it: registerScripts reads the same
    // characterStorage key the settings UI writes.
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
    });

    test('a disabled script is declared but never started', () => {
        characterStorage.set('disabled_scripts', ['kill'] as never);

        const registry = registerScripts(client);

        expect(registry.declared).toContain('kill');
        expect(registry.isRunning('kill')).toBe(false);
        expect(registry.stateOf('kill')).toEqual({status: 'off'});
        // And it left nothing behind to find, exactly as if it had been stopped.
        expect(getKillData()).toBeNull();
        expect([...client.aliases].some(alias => alias.pattern.toString().includes('zabici'))).toBe(false);
    });

    test('everything else still starts', () => {
        characterStorage.set('disabled_scripts', ['kill'] as never);

        const registry = registerScripts(client);

        expect(registry.running).toHaveLength(registry.declared.length - 1);
        expect(registry.isRunning('improveCounter')).toBe(true);
    });

    test('turning off shortcuts takes idz and mapAliases with it', () => {
        // The real cascade, with the real declarations from main.ts.
        characterStorage.set('disabled_scripts', ['shortcuts'] as never);

        const registry = registerScripts(client);

        expect(registry.stateOf('idz')).toEqual({status: 'blocked', by: 'shortcuts'});
        expect(registry.stateOf('mapAliases')).toEqual({status: 'blocked', by: 'shortcuts'});
        expect(registry.isRunning('idz')).toBe(false);
        expect(getShortcut('bank')).toBeUndefined();
    });

    test('an id that no longer exists is ignored rather than fatal', () => {
        // A script can be renamed or removed while a character still has it in
        // their disabled list. That must not stop the client from starting.
        characterStorage.set('disabled_scripts', ['scriptThatWasDeleted'] as never);

        expect(() => registerScripts(client)).not.toThrow();
    });

    test('a script turned off at runtime can be turned back on', () => {
        const registry = registerScripts(client);
        expect(registry.isRunning('lastSeen')).toBe(true);

        registry.disable('lastSeen');
        expect(registry.isRunning('lastSeen')).toBe(false);
        expect(characterStorage.get('disabled_scripts')).toEqual(['lastSeen']);

        registry.enable('lastSeen');

        expect(registry.isRunning('lastSeen')).toBe(true);
        expect(characterStorage.get('disabled_scripts')).toEqual([]);
    });
});
