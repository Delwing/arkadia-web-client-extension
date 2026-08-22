import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initSmith from '@client/scripts/smith';

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

const REPAIR_CMD = 'naostrz wszystkie bronie;napraw wszystkie zbroje';
const ACCEPTED = 'Kowal mowi do ciebie: Zobacze co da sie zrobic.';

describe('smith', () => {
    let client: Client;
    let setBind: ReturnType<typeof vi.spyOn>;
    let commands: string[];
    let offCommand: () => void;

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        setBind = vi.spyOn(client.FunctionalBind, 'set').mockImplementation(() => {});
        commands = [];
        const sink = commands;
        // Listen rather than stub: stubbing sendCommand would bypass alias dispatch.
        offCommand = client.on('command', (c: string) => { sink.push(c); });
        initSmith(client, client.aliases);
    });

    afterEach(() => {
        offCommand();
        vi.useRealTimers();
    });

    describe('the repair round trip', () => {
        test('finishing the work offers the repair bind again', () => {
            client.onLine(ACCEPTED, 'text');

            client.onLine('Kowal konczy prace.', 'text');

            expect(setBind).toHaveBeenCalledWith(REPAIR_CMD);
        });

        test('being handed the gear back counts as finished', () => {
            client.onLine(ACCEPTED, 'text');

            client.onLine('Kowal daje ci miecz.', 'text');

            expect(setBind).toHaveBeenCalledWith(REPAIR_CMD);
        });

        test('finishing without having started offers nothing', () => {
            client.onLine('Kowal konczy prace.', 'text');

            expect(setBind).not.toHaveBeenCalled();
        });

        test('the lines themselves stay visible', () => {
            expect(client.onLine(ACCEPTED, 'text')).toHaveLength(1);
            expect(client.onLine('Kowal konczy prace.', 'text')).toHaveLength(1);
        });
    });

    describe('nothing to repair', () => {
        test.each([
            'Kowal mowi do ciebie: Twoj miecz nie nadaje sie do ostrzenia.',
            'Kowal mowi do ciebie: Twoja zbroja nie wymaga naprawy.',
        ])('falls back to the re-equip bind: %s', (line) => {
            client.onLine(line, 'text');

            expect(setBind).not.toHaveBeenCalled();

            vi.advanceTimersByTime(1000);

            expect(setBind).toHaveBeenCalledWith(
                `wlm;${client.drawWeaponCommand} wszystkich broni;zaloz wszystkie zbroje`
            );
        });

        test('starting work before the fallback fires cancels it', () => {
            client.onLine('Kowal mowi do ciebie: Twoj miecz nie nadaje sie do ostrzenia.', 'text');
            client.onLine(ACCEPTED, 'text');

            vi.advanceTimersByTime(1000);

            expect(setBind).not.toHaveBeenCalled();
        });
    });

    describe('aliases', () => {
        test('/naprawa asks for weapons and armour to be repaired', async () => {
            await client.sendCommand('/naprawa');

            expect(commands).toContain('naostrz wszystkie bronie');
            expect(commands).toContain('napraw wszystkie zbroje');
        });

        test('/napraw is the same alias', async () => {
            await client.sendCommand('/napraw');

            expect(commands).toContain('naostrz wszystkie bronie');
        });

        test('/napraw_ubrania undresses, repairs and redresses', async () => {
            await client.sendCommand('/napraw_ubrania');

            expect(commands).toContain('zdejmij wszystkie zbroje');
            expect(commands).toContain('napraw wszystkie ubrania');
            expect(commands).toContain('zaloz wszystkie ubrania');
            expect(commands).toContain('zaloz wszystkie zbroje');
        });
    });

    test('unrelated output does nothing', () => {
        client.onLine('Jestes lekko zmeczony.', 'text');
        vi.advanceTimersByTime(2000);

        expect(setBind).not.toHaveBeenCalled();
    });
});
