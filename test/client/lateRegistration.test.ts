import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { ScriptRegistry } from '@client/ScriptRegistry';

function createClient(): Client {
    return new Client({
        send: () => {}, output: () => {}, sendGmcp: () => {},
        flushMessageBuffer: () => {}, emit: () => {}, shouldEchoCommand: () => true,
    });
}

/**
 * Five scripts have an `async` init — herbCounter, herbDescriptions, magicKeys,
 * magics, odlozMagie — and register only after awaiting a data load. Nothing
 * makes that await finish before the script can be turned off again.
 */
describe('a script that registers after an await', () => {
    let host: Client;
    let registry: ScriptRegistry;

    beforeEach(() => {
        localStorage.clear();
        host = createClient();
        registry = new ScriptRegistry(host);
    });

    test('is torn down even when it registers after being stopped', async () => {
        const baseline = host.Triggers.triggers.size;
        let resolveLoad!: () => void;
        const loaded = new Promise<void>(resolve => { resolveLoad = resolve; });

        registry.declare('slow', (client, aliases) => {
            void loaded.then(() => {
                client.Triggers.registerTrigger(/late/, line => line);
                aliases.push({ pattern: /^\/late$/, callback: () => {} });
            });
        });
        registry.launch();

        // The user turns it off while the data load is still in flight.
        registry.stop('slow');
        resolveLoad();
        await loaded;
        await Promise.resolve();

        expect(host.Triggers.triggers.size, 'no trigger outlives the scope').toBe(baseline);
        expect([...host.aliases], 'no alias outlives the scope').toEqual([]);
    });
});
