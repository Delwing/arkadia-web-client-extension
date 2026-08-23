import { describe, test, expect, beforeAll } from 'vitest';
import Client from '@client/Client';
import { registerScripts } from '@client/main';
import { scriptCatalog } from '@client/scriptCatalog';
import type { ScriptRegistry } from '@client/ScriptRegistry';
import { characterStorage } from '@modules/core/storage';

/**
 * The settings list tells a user what a feature gives them. A description that
 * names a command the script does not have is worse than one that names none —
 * it sends them to type something that will come back "Nieznany alias".
 *
 * Checked against the running client, so it fails when a script's aliases move
 * and the label is left behind.
 */
describe('the catalog does not promise commands that do not exist', () => {
    let registry: ScriptRegistry;

    beforeAll(async () => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        const client = new Client({
            send: () => {}, output: () => {}, sendGmcp: () => {},
            flushMessageBuffer: () => {}, emit: () => {}, shouldEchoCommand: () => true,
        });
        registry = registerScripts(client);
        // Five scripts have an async init and register only after a data load.
        await new Promise(resolve => setTimeout(resolve, 50));
    });

    test('every /command a description names is one the script registers', () => {
        // Not preceded by a digit, so "[3/15]" in a description is not read as a
        // command called "/15".
        const claimed = /(?<![0-9])\/[a-zA-Z_][a-zA-Z_0-9]*/g;
        const wrong: string[] = [];

        for (const id of registry.declared) {
            const real = new Set(registry.surfaceOf(id).commands.map(c => c.replace(' …', '')));
            // A script with no commands at all is either not running or loads
            // asynchronously; there is nothing to check it against.
            if (real.size === 0) continue;

            const bogus = [...new Set(scriptCatalog[id].description.match(claimed) ?? [])]
                .filter(command => !real.has(command));
            if (bogus.length) {
                wrong.push(`${id}: names ${bogus.join(' ')}, but has ${[...real].join(' ')}`);
            }
        }

        expect(wrong).toEqual([]);
    });

    test('no description carries a leftover draft marker', () => {
        // These were drafting notes to a reviewer. They render in the settings
        // list, so a stray one is a user-visible artefact, not a TODO.
        const marked = Object.entries(scriptCatalog)
            .filter(([, entry]) => /REVIEW:|TODO|FIXME/.test(entry.description))
            .map(([id]) => id);

        expect(marked).toEqual([]);
    });
});
