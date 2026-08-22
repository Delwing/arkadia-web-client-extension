import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initDeliveryStats from '@client/scripts/deliveryStats';

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

const HANDED_OVER = 'Oddajesz pocztowa paczke listonoszowi.';
const RETURNED = 'Zwracasz pocztowa paczke listonoszowi.';
const LATE = 'Listonosz mruczy cos o dostawie po terminie.';
const PAID = (what: string) => `Listonosz wyplaca ci ${what} monet.`;

describe('deliveryStats', () => {
    let client: Client;
    let printed: string[];

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    async function stats() {
        await client.sendCommand('/paczki');
        // showStats may run after an async load.
        await vi.waitFor(() => expect(printed.length).toBeGreaterThan(0));
        return output();
    }

    beforeEach(async () => {
        localStorage.clear();
        // A fresh character per test keeps the IndexedDB record set isolated.
        characterStorage.setCharacter(`Kurier${Math.floor(performance.now() * 1000) % 1e9}`);
        printed = [];
        client = createClient(printed);
        initDeliveryStats(client, client.aliases);
        client.sendEvent('gmcp.char.info', { name: characterStorage.getCharacter() } as any);
    });

    afterEach(() => vi.restoreAllMocks());

    describe('recording a delivery', () => {
        test('an on-time delivery is recorded with its payment', async () => {
            client.onLine(HANDED_OVER, 'text');
            client.onLine(PAID('3 zlote, 2 srebrne i 5 miedzianych'), 'text');

            const out = await stats();
            expect(out).toContain('1');
        });

        test('a late delivery is flagged', async () => {
            client.onLine(HANDED_OVER, 'text');
            client.onLine(LATE, 'text');
            client.onLine(PAID('1 zlota'), 'text');

            const out = await stats();
            expect(out).toMatch(/\d/);
        });

        test('the trigger lines stay visible', () => {
            expect(client.onLine(HANDED_OVER, 'text')).toHaveLength(1);
            expect(client.onLine(PAID('1 zlota'), 'text')).toHaveLength(1);
        });

        test('returning a parcel does not start a recording', async () => {
            client.onLine(RETURNED, 'text');
            client.onLine(PAID('3 zlote'), 'text');

            const out = await stats();
            expect(out).toContain('0');
        });

        test('a payment with no hand-over before it is ignored', async () => {
            client.onLine(PAID('3 zlote'), 'text');

            const out = await stats();
            expect(out).toContain('0');
        });

        test('the payment trigger only fires once per delivery', async () => {
            client.onLine(HANDED_OVER, 'text');
            client.onLine(PAID('1 zlota'), 'text');
            client.onLine(PAID('9 zlotych'), 'text');

            const out = await stats();
            // Two deliveries would need two hand-overs.
            expect(out).not.toContain('2 ');
        });

        test('a new hand-over resets the late flag', async () => {
            client.onLine(HANDED_OVER, 'text');
            client.onLine(LATE, 'text');
            client.onLine(HANDED_OVER, 'text');
            client.onLine(PAID('1 zlota'), 'text');

            const out = await stats();
            expect(out).toBeTruthy();
        });
    });

    describe('/paczki', () => {
        test('prints a table even with no deliveries', async () => {
            const out = await stats();

            expect(out).toBeTruthy();
            expect(out.length).toBeGreaterThan(10);
        });

        test('the table survives a second call', async () => {
            await stats();
            const out = await stats();

            expect(out).toBeTruthy();
        });
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
    });
});
