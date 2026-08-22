import { describe, test, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initSunTracker, {
    getEventsForDomain,
    clearEventsForDomain,
} from '@client/scripts/sunTracker';

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

const DOMAIN = 'Empire' as const;

describe('sunTracker', () => {
    let client: Client;
    let printed: string[];

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    // initSunTracker subscribes to the global bus and never unsubscribes, so
    // init once and reset state between tests.
    beforeAll(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        client = createClient(printed);
        initSunTracker(client);
    });

    beforeEach(async () => {
        characterStorage.setCharacter('TestChar');
        characterStorage.set('settings', { sunTracker: true } as any);
        printed.length = 0;
        client.sendEvent('reset');
        await clearEventsForDomain(DOMAIN);
    });

    afterEach(() => {
        client.sendEvent('reset');
    });

    describe('announcing', () => {
        test('a sunrise is drawn as a banner', () => {
            client.sendEvent('clock.sunrise', { domain: DOMAIN, dayOfYear: 10, observedHour: 6 } as any);

            const out = output();
            expect(out).toContain('WSCHOD');
            expect(out).toContain('[czas]');
        });

        test('a sunset is drawn as a banner', () => {
            client.sendEvent('clock.sunset', { domain: DOMAIN, dayOfYear: 10, observedHour: 20 } as any);

            expect(output()).toContain('ZACHOD');
        });

        test('nothing is drawn while the setting is off', () => {
            characterStorage.set('settings', { sunTracker: false } as any);

            client.sendEvent('clock.sunrise', { domain: DOMAIN, dayOfYear: 10, observedHour: 6 } as any);

            expect(output()).not.toContain('WSCHOD');
        });

        test('/testbox draws both banners', async () => {
            await client.sendCommand('/testbox');

            const out = output();
            expect(out).toContain('WSCHOD');
            expect(out).toContain('ZACHOD');
        });

        test('/slonce opens the popup', async () => {
            let opened = false;
            const off = client.on('sunTracker.popup.open', () => { opened = true; });

            await client.sendCommand('/slonce');
            off();

            expect(opened).toBe(true);
        });
    });

    describe('confirming an observation', () => {
        test('a following clock reading confirms and stores the event', async () => {
            client.sendEvent('clock.sunrise', { domain: DOMAIN, dayOfYear: 10, observedHour: 6 } as any);

            client.sendEvent('clock.parsedTime', { domain: DOMAIN, hour: 6, dayOfYear: 10 } as any);
            await vi.waitFor(async () => {
                expect(await getEventsForDomain(DOMAIN)).toHaveLength(1);
            });

            const [stored] = await getEventsForDomain(DOMAIN);
            expect(stored.type).toBe('sunrise');
            expect(stored.dayOfYear).toBe(10);
            expect(stored.observedHour).toBe(6);
        });

        test('the clock reading overrides the announced hour', async () => {
            client.sendEvent('clock.sunset', { domain: DOMAIN, dayOfYear: 10, observedHour: 20 } as any);

            client.sendEvent('clock.parsedTime', { domain: DOMAIN, hour: 21, dayOfYear: 11 } as any);
            await vi.waitFor(async () => {
                expect(await getEventsForDomain(DOMAIN)).toHaveLength(1);
            });

            const [stored] = await getEventsForDomain(DOMAIN);
            expect(stored.observedHour).toBe(21);
            expect(stored.dayOfYear).toBe(11);
        });

        test('a clock reading with nothing pending stores nothing', async () => {
            client.sendEvent('clock.parsedTime', { domain: DOMAIN, hour: 6, dayOfYear: 10 } as any);

            expect(await getEventsForDomain(DOMAIN)).toEqual([]);
        });

        test('a confirmation announces the update', async () => {
            let updated: any = null;
            const off = client.on('sunTracker.updated', (p: any) => { updated = p; });

            client.sendEvent('clock.sunrise', { domain: DOMAIN, dayOfYear: 10, observedHour: 6 } as any);
            client.sendEvent('clock.parsedTime', { domain: DOMAIN, hour: 6, dayOfYear: 10 } as any);
            await vi.waitFor(() => expect(updated).not.toBeNull());
            off();

            expect(updated.domain).toBe(DOMAIN);
        });

        test('a reset drops the pending observation', async () => {
            client.sendEvent('clock.sunrise', { domain: DOMAIN, dayOfYear: 10, observedHour: 6 } as any);

            client.sendEvent('reset');
            client.sendEvent('clock.parsedTime', { domain: DOMAIN, hour: 6, dayOfYear: 10 } as any);

            expect(await getEventsForDomain(DOMAIN)).toEqual([]);
        });

        test('disconnecting drops it too', async () => {
            client.sendEvent('clock.sunrise', { domain: DOMAIN, dayOfYear: 10, observedHour: 6 } as any);

            client.sendEvent('client.disconnect');
            client.sendEvent('clock.parsedTime', { domain: DOMAIN, hour: 6, dayOfYear: 10 } as any);

            expect(await getEventsForDomain(DOMAIN)).toEqual([]);
        });

        test('only the most recent observation is pending', async () => {
            client.sendEvent('clock.sunrise', { domain: DOMAIN, dayOfYear: 10, observedHour: 6 } as any);
            client.sendEvent('clock.sunset', { domain: DOMAIN, dayOfYear: 10, observedHour: 20 } as any);

            client.sendEvent('clock.parsedTime', { domain: DOMAIN, hour: 20, dayOfYear: 10 } as any);
            await vi.waitFor(async () => {
                expect(await getEventsForDomain(DOMAIN)).toHaveLength(1);
            });

            const [stored] = await getEventsForDomain(DOMAIN);
            expect(stored.type).toBe('sunset');
        });
    });
});
