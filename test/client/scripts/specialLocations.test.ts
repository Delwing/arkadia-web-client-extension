import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import { initSpecialLocations } from '@client/scripts/specialLocations';

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

const GANGWAY = 'Schodzisz z pokladu na lad po szerokim trapie.';
const CAMP = 'Mozesz opuscic oboz, udajac sie do jego wyjscia. W polnocnej, poludniowo-wschodniej i poludniowo-zachodniej czesci placu dostrzegasz wejscia do namiotow.';

describe('specialLocations', () => {
    let client: Client;
    let refreshes: number;
    let off: () => void;

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        refreshes = 0;
        off = client.on('refreshPositionWhenAble', () => { refreshes++; });
        initSpecialLocations(client);
    });

    afterEach(() => {
        off();
        vi.useRealTimers();
    });

    test.each([GANGWAY, CAMP])('asks the mapper to re-locate after: %s', (line) => {
        const [out] = client.onLine(line, 'text');

        expect(out.text).toBe(line);
        expect(refreshes).toBe(0); // deferred

        vi.runAllTimers();

        expect(refreshes).toBe(1);
    });

    test('the line itself is left in the output', () => {
        const parts = client.onLine(GANGWAY, 'text');

        expect(parts).toHaveLength(1);
    });

    test('unrelated output does not trigger a re-locate', () => {
        client.onLine('Jestes lekko zmeczony.', 'text');
        vi.runAllTimers();

        expect(refreshes).toBe(0);
    });
});
