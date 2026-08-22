import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { createScriptScope } from '@client/ScriptScope';

const printed: (string | unknown)[] = [];

function createClient(): Client {
    return new Client({
        send: () => {},
        output: (text) => { printed.push(text); },
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => true,
    });
}

describe('ScriptScope', () => {
    let host: Client;
    /** The client registers a handful of triggers of its own; count from there. */
    let base: number;

    beforeEach(() => {
        localStorage.clear();
        printed.length = 0;
        host = createClient();
        base = host.Triggers.triggers.size;
    });

    describe('triggers', () => {
        test('a trigger registered through the scope is owned by it', () => {
            const { client } = createScriptScope(host, 'demo');

            const trigger = client.Triggers.registerTrigger(/hello/, (line) => line);

            expect(trigger.owner).toBe('demo');
        });

        test('disposing removes the script triggers', () => {
            const { client, scope } = createScriptScope(host, 'demo');
            let hits = 0;
            client.Triggers.registerTrigger(/hello/, (line) => {
                hits++;
                return line;
            });

            host.onLine('hello world', 'text');
            expect(hits).toBe(1);

            scope.dispose();
            host.onLine('hello world', 'text');

            expect(hits, 'the trigger is gone, not merely muted').toBe(1);
            expect(host.Triggers.triggers.size).toBe(base);
        });

        test('another script triggers are untouched', () => {
            const a = createScriptScope(host, 'a');
            const b = createScriptScope(host, 'b');
            let bHits = 0;
            a.client.Triggers.registerTrigger(/hello/, (line) => line);
            b.client.Triggers.registerTrigger(/hello/, (line) => {
                bHits++;
                return line;
            });

            a.scope.dispose();
            host.onLine('hello world', 'text');

            expect(bHits).toBe(1);
            expect(host.Triggers.triggers.size).toBe(base + 1);
        });

        test('a trigger registered later, from inside a callback, is still owned', () => {
            // The attribution rides on the client object the script closed over, so
            // it survives past registration time. A "currently loading" global would
            // not: by the time this fires, loading is long over.
            const { client, scope } = createScriptScope(host, 'demo');
            client.Triggers.registerTrigger(/open/, (line) => {
                client.Triggers.registerOneTimeTrigger(/follow-up/, (l) => l);
                return line;
            });

            host.onLine('open', 'text');
            expect(host.Triggers.triggers.size).toBe(base + 2);

            scope.dispose();
            expect(host.Triggers.triggers.size).toBe(base);
        });

        test('child triggers inherit the owner and go with the parent', () => {
            const { client, scope } = createScriptScope(host, 'demo');
            const parent = client.Triggers.registerTrigger(/parent/, (line) => line);
            const child = parent.registerChild(/child/, (line) => line);

            expect(child.owner).toBe('demo');

            scope.dispose();
            expect(host.Triggers.triggers.size).toBe(base);
        });

        test('multiline and token triggers are swept too', () => {
            const { client, scope } = createScriptScope(host, 'demo');
            client.Triggers.registerMultilineTrigger(/multi/, (line) => line);
            client.Triggers.registerTokenTrigger('token line', (line) => line);

            expect(host.Triggers.multilineTriggers.size).toBe(1);

            scope.dispose();

            expect(host.Triggers.multilineTriggers.size).toBe(0);
            let hits = 0;
            host.Triggers.registerTrigger(/token/, (line) => {
                hits++;
                return line;
            });
            host.onLine('token line', 'text');
            expect(hits, 'the plain trigger still runs — only the token one went').toBe(1);
        });

        test('tags and owners are independent', () => {
            // Scripts pick tags themselves and reuse them to clear parts of
            // themselves; an owner is assigned. Clearing one must not clear the other.
            const { client, scope } = createScriptScope(host, 'demo');
            client.Triggers.registerTrigger(/a/, (line) => line, 'transient');
            client.Triggers.registerTrigger(/b/, (line) => line, 'permanent');

            host.Triggers.removeByTag('transient');
            expect(host.Triggers.triggers.size).toBe(base + 1);

            scope.dispose();
            expect(host.Triggers.triggers.size).toBe(base);
        });

        test('an unowned trigger survives every dispose', () => {
            const { scope } = createScriptScope(host, 'demo');
            host.Triggers.registerTrigger(/core/, (line) => line);

            scope.dispose();

            expect(host.Triggers.triggers.size).toBe(base + 1);
        });
    });

    describe('aliases', () => {
        test('an alias pushed through the scope is owned and withdrawn on dispose', async () => {
            const { client, scope } = createScriptScope(host, 'demo');
            const callback = vi.fn();
            client.aliases.push({ pattern: /^\/demo$/, callback });

            expect(host.aliases[0].owner).toBe('demo');
            await host.sendCommand('/demo', false);
            expect(callback).toHaveBeenCalledTimes(1);

            scope.dispose();
            await host.sendCommand('/demo', false);

            expect(callback).toHaveBeenCalledTimes(1);
            expect(host.aliases).toHaveLength(0);
        });

        test('withdrawing keeps the slash bucket in step', () => {
            const a = createScriptScope(host, 'a');
            const b = createScriptScope(host, 'b');
            a.client.aliases.push({ pattern: /^\/gone$/, callback: () => {} });
            b.client.aliases.push({ pattern: /^\/stays$/, callback: () => {} });

            a.scope.dispose();

            const slash = host.aliases.forCommand('/stays');
            expect(slash.map(e => e.pattern.source)).toEqual(['^\\/stays$']);
        });

        test('non-slash aliases are bucketed and withdrawn correctly', () => {
            const { client, scope } = createScriptScope(host, 'demo');
            client.aliases.push({ pattern: /^zabij .*/, callback: () => {} });

            expect(host.aliases.forCommand('zabij szczura')).toHaveLength(1);

            scope.dispose();

            expect(host.aliases.forCommand('zabij szczura')).toHaveLength(0);
        });

        test('the alias list itself cannot be swapped out through a scope', () => {
            const { client } = createScriptScope(host, 'demo');
            const real = host.aliases;

            expect(() => {
                (client as any).aliases = [];
            }).toThrow();
            expect(host.aliases).toBe(real);
        });
    });

    describe('command hooks', () => {
        test('a hook registered through the scope is removed on dispose', async () => {
            const { client, scope } = createScriptScope(host, 'demo');
            const hook = vi.fn(() => null);
            client.registerCommandHook('demo.hook', hook);

            await host.sendCommand('cokolwiek', false);
            expect(hook).toHaveBeenCalledTimes(1);

            scope.dispose();
            await host.sendCommand('cokolwiek', false);

            expect(hook).toHaveBeenCalledTimes(1);
        });

        test('a hook the script removed itself is not double-removed', () => {
            const { client, scope } = createScriptScope(host, 'demo');
            client.registerCommandHook('demo.hook', () => undefined);

            expect(client.unregisterCommandHook('demo.hook')).toBe(true);
            expect(() => scope.dispose()).not.toThrow();
        });
    });

    describe('event subscriptions', () => {
        test('client.on through the scope stops firing after dispose', () => {
            const { client, scope } = createScriptScope(host, 'demo');
            const listener = vi.fn();
            client.on('contentWidth', listener);

            host.setContentWidth(80);
            expect(listener).toHaveBeenCalledTimes(1);

            scope.dispose();
            host.setContentWidth(90);

            expect(listener).toHaveBeenCalledTimes(1);
        });

        test('once still works through the scope', () => {
            const { client } = createScriptScope(host, 'demo');
            const listener = vi.fn();
            client.on('contentWidth', listener, { once: true });

            host.setContentWidth(80);
            host.setContentWidth(90);

            expect(listener).toHaveBeenCalledTimes(1);
        });

        test('a caller supplied signal is honoured', () => {
            const { client } = createScriptScope(host, 'demo');
            const controller = new AbortController();
            const listener = vi.fn();
            client.on('contentWidth', listener, { signal: controller.signal });

            controller.abort();
            host.setContentWidth(80);

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('timers', () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        test('intervals stop on dispose', () => {
            const { client, scope } = createScriptScope(host, 'demo');
            const tick = vi.fn();
            client.scope.interval(tick, 100);

            vi.advanceTimersByTime(250);
            expect(tick).toHaveBeenCalledTimes(2);

            scope.dispose();
            vi.advanceTimersByTime(500);

            expect(tick).toHaveBeenCalledTimes(2);
        });

        test('a pending timeout never fires after dispose', () => {
            const { client, scope } = createScriptScope(host, 'demo');
            const fire = vi.fn();
            client.scope.timeout(fire, 100);

            scope.dispose();
            vi.advanceTimersByTime(500);

            expect(fire).not.toHaveBeenCalled();
        });

        test('registering a timer on a disposed scope is a no-op', () => {
            const { scope } = createScriptScope(host, 'demo');
            const tick = vi.fn();
            scope.dispose();

            scope.interval(tick, 10);
            scope.timeout(tick, 10);
            vi.advanceTimersByTime(500);

            expect(tick).not.toHaveBeenCalled();
        });
    });

    describe('DOM listeners', () => {
        test('listen removes the handler on dispose', () => {
            const { client, scope } = createScriptScope(host, 'demo');
            const handler = vi.fn();
            client.scope.listen(window, 'keydown', handler);

            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
            expect(handler).toHaveBeenCalledTimes(1);

            scope.dispose();
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

            expect(handler).toHaveBeenCalledTimes(1);
        });

        test('listen returns an early unlisten', () => {
            const { client } = createScriptScope(host, 'demo');
            const handler = vi.fn();
            const stop = client.scope.listen(window, 'keydown', handler);

            stop();
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('lifecycle', () => {
        test('onDispose callbacks run in reverse registration order', () => {
            const { scope } = createScriptScope(host, 'demo');
            const order: string[] = [];
            scope.onDispose(() => order.push('first'));
            scope.onDispose(() => order.push('second'));

            scope.dispose();

            expect(order).toEqual(['second', 'first']);
        });

        test('onDispose after dispose runs immediately', () => {
            const { scope } = createScriptScope(host, 'demo');
            scope.dispose();
            const late = vi.fn();

            scope.onDispose(late);

            expect(late).toHaveBeenCalledTimes(1);
        });

        test('dispose is idempotent', () => {
            const { scope } = createScriptScope(host, 'demo');
            const teardown = vi.fn();
            scope.onDispose(teardown);

            scope.dispose();
            scope.dispose();

            expect(teardown).toHaveBeenCalledTimes(1);
            expect(scope.disposed).toBe(true);
        });

        test('the signal is aborted by dispose', () => {
            const { scope } = createScriptScope(host, 'demo');

            expect(scope.signal.aborted).toBe(false);
            scope.dispose();
            expect(scope.signal.aborted).toBe(true);
        });
    });

    describe('the scoped client is otherwise the real client', () => {
        test('methods act on the host', () => {
            const { client } = createScriptScope(host, 'demo');

            client.print('czesc');

            expect(printed).toHaveLength(1);
        });

        test('writes land on the host, not the facade', () => {
            const { client } = createScriptScope(host, 'demo');

            client.suppressItemEvaluation = true;

            expect(host.suppressItemEvaluation).toBe(true);
        });

        test('accessor properties still work through the facade', () => {
            const { client } = createScriptScope(host, 'demo');

            client.moveMode = 2;

            expect(host.moveMode).toBe(2);
            expect(client.moveMode).toBe(2);
        });

        test('it is still a Client', () => {
            const { client } = createScriptScope(host, 'demo');

            expect(client).toBeInstanceOf(Client);
            expect(client.attackCommand).toBe(host.attackCommand);
        });

        test('a function a script installs on the client is not served stale', () => {
            // enemyBinds assigns client.attackEnemySlot at runtime. A bound-method
            // cache keyed on the name alone would keep handing back a wrapper around
            // the stub it replaced.
            const { client } = createScriptScope(host, 'demo');
            const before = client.attackEnemySlot;
            const installed = vi.fn();

            client.attackEnemySlot = installed;
            client.attackEnemySlot(3);

            expect(client.attackEnemySlot).not.toBe(before);
            expect(installed).toHaveBeenCalledWith(3);
        });

        test('the plain client exposes a root scope', () => {
            expect(host.scope.id).toBe('client');
            expect(host.scope.disposed).toBe(false);
        });
    });
});
