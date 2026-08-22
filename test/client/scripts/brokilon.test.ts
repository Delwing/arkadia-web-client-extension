import { describe, test, expect, beforeEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initBrokilon from '@client/scripts/brokilon';

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

const ORANGE_RED = '#ff4500';
const SNARED = 'Nagle czujesz, ze cos oplata twa noge... ziemia w zawrotnym tempie zamienia sie miejscami z niebem. Zwisasz teraz, przywiazany za noge rzemieniem, dyndajac jak kukielka.';

describe('brokilon', () => {
    let client: Client;
    let printed: string[];
    let setBind: ReturnType<typeof vi.spyOn>;
    let moveBack: ReturnType<typeof vi.spyOn>;

    function output() {
        client.sendEvent('output-sent', 1);
        return printed.join('');
    }

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        client = createClient(printed);
        setBind = vi.spyOn(client.FunctionalBind, 'set').mockImplementation(() => {});
        moveBack = vi.spyOn(client.Map, 'moveBack').mockImplementation(() => {});
        initBrokilon(client);
    });

    describe('traps', () => {
        test('being snared offers the cutting bind and steps the map back', () => {
            const [out] = client.onLine(SNARED, 'text');

            expect(out.text).toBe(`[ PULAPKA ]  ${SNARED}`);
            expect(out.toHtml()).toContain(ORANGE_RED);
            expect(setBind).toHaveBeenCalledWith('przetnij rzemien');
            expect(moveBack).toHaveBeenCalled();
        });

        test('seeing somebody else snared does not move the map', () => {
            const line = 'Nagle Ala podlatuje w gore, robi pol salta i zawisa bezwladnie, przywiazana do drzewa, by dyndac jak kukielka.';

            const [out] = client.onLine(line, 'text');

            expect(out.text).toBe(`[ PULAPKA ]  ${line}`);
            expect(setBind).toHaveBeenCalledWith('przetnij rzemien');
            expect(moveBack).not.toHaveBeenCalled();
        });

        test('a mention of the snare strap is flagged too', () => {
            const [out] = client.onLine('Widzisz rzemienna petla na ziemi.', 'text');

            expect(out.text).toContain('[ PULAPKA ]');
        });
    });

    describe('arrows', () => {
        test.each([
            'Nadlatujaca ze swistem strzala wbija ci sie w korpus.',
            'Nagle jakas strzala wbija ci sie w korpus.',
            'W ziemie wbila sie z niesamowita predkoscia dluga strzala.',
        ])('flags: %s', (line) => {
            const [out] = client.onLine(line, 'text');

            expect(out.text).toBe(`[ STRZALY ]  ${line}`);
            expect(setBind).not.toHaveBeenCalled();
        });
    });

    describe('the rusalka charm', () => {
        test('being charmed warns loudly and offers the counter', () => {
            const line = 'Mimowolnie twoj wzrok krzyzuje sie ze wzrokiem zielonowlosej drobnej rusalki. Jej piekno wprost oszalamia cie...';

            const [out] = client.onLine(line, 'text');

            expect(out.text).toBe(`[ UROK ]  ${line}`);
            expect(output()).toContain('UROK RUSALKI');
            expect(setBind).toHaveBeenCalledWith('/zz rusalke');
        });

        test('being unable to strike her offers the counter as well', () => {
            const line = 'Nie jestes w stanie skrzywdzic tak pieknej istoty!';

            const [out] = client.onLine(line, 'text');

            expect(out.text).toBe(`[ UROK ]  ${line}`);
            expect(setBind).toHaveBeenCalledWith('/zz rusalke');
        });
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
        expect(setBind).not.toHaveBeenCalled();
    });
});
