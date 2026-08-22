import { describe, test, expect, beforeEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initMagicSupport from '@client/scripts/magic-support';

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

describe('magic-support', () => {
    let client: Client;
    let setBind: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        setBind = vi.spyOn(client.FunctionalBind, 'set').mockImplementation(() => {});
        initMagicSupport(client);
    });

    describe('prefixing', () => {
        test.each([
            'Od twojego amuletu emanuje przyjemne cieplo.',
            'Nagle kamienie na rekojesci miecza zaczynaja swiecic.',
            'Wokol ostrza rozjarzaja sie na moment trzy krwistoczerwone ogniki.',
        ])('a healing proc is tagged [HP+]: %s', (line) => {
            const [out] = client.onLine(line, 'text');

            expect(out.text).toBe(`[HP+] ${line}`);
            expect(out.toHtml()).toContain('#ff6347');
        });

        test.each([
            'Z kazdym kolejnym ciosem nabierasz nowej sily do walki.',
            'Widok slabnacego wroga tylko dodaje ci sil.',
        ])('a cleaver proc is tagged [TASAK]: %s', (line) => {
            const [out] = client.onLine(line, 'text');

            expect(out.text).toBe(`[TASAK] ${line}`);
        });
    });

    describe('offering a follow-up bind', () => {
        test('drawing the axe offers "przekrec stylisko"', () => {
            const line = 'Siegasz do skorzanego temblaka przy boku, dobywajac z niego misternego obosiecznego topora.';

            const [out] = client.onLine(line, 'text');

            expect(out.text).toBe(line);
            expect(setBind).toHaveBeenCalledWith('przekrec stylisko', expect.any(Function));
        });

        test('putting on the cloak offers "zepnij plaszcz brosza"', () => {
            client.onLine('Zakladasz szmaragdowozielony misterny plaszcz.', 'text');

            expect(setBind).toHaveBeenCalledWith('zepnij plaszcz brosza', expect.any(Function));
        });

        test('putting on the belt offers "zacisnij pas"', () => {
            client.onLine('Zakladasz masywny oksydowany pas.', 'text');

            expect(setBind).toHaveBeenCalledWith('zacisnij pas', expect.any(Function));
        });

        test('the offered bind sends the command when fired', () => {
            const sent: string[] = [];
            client.sendCommand = (async (c: string) => { sent.push(c); }) as any;

            client.onLine('Zakladasz masywny oksydowany pas.', 'text');
            const callback = setBind.mock.calls.at(-1)![1] as () => void;
            callback();

            expect(sent).toEqual(['zacisnij pas']);
        });
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
        expect(setBind).not.toHaveBeenCalled();
    });
});
