import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';
import initCombatStats, {
    recordCombatStat,
    getCombatStats,
} from '@client/scripts/combatStats';

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

describe('combatStats', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initCombatStats(client, { push: () => {} });
        // `stats` is a module-level singleton — clear it between tests.
        client.sendEvent('reset');
    });

    test('starts empty', () => {
        const s = getCombatStats();

        expect(s.total).toBe(0);
        expect(s.otrzymane.count).toBe(0);
        expect(s.wyparowane.count).toBe(0);
        expect(s.unikniete).toBe(0);
    });

    describe('hits taken', () => {
        test('counts the hit and attributes the body part', () => {
            recordCombatStat('3/6', 'innych_ciosy_we_mnie', 'Wielki szczur rani cie w korpus.');

            const s = getCombatStats();
            expect(s.otrzymane.count).toBe(1);
            expect(s.otrzymane.parts.korpus).toBe(1);
        });

        test.each([
            ['Trafia cie w glowe.', 'glowa'],
            ['Trafia cie w prawe ramie.', 'ramiona'],
            ['Trafia cie w lewe ramie.', 'ramiona'],
            ['Trafia cie w korpus.', 'korpus'],
            ['Trafia cie w nogi.', 'nogi'],
        ])('%s maps to %s', (text, part) => {
            recordCombatStat('1/6', 'innych_ciosy_we_mnie', text);

            expect(getCombatStats().otrzymane.parts[part as 'korpus']).toBe(1);
        });

        test('a hit with no recognisable body part still counts', () => {
            recordCombatStat('1/6', 'innych_ciosy_we_mnie', 'Cos cie trafia.');

            const s = getCombatStats();
            expect(s.otrzymane.count).toBe(1);
            expect(s.otrzymane.parts).toEqual({ glowa: 0, ramiona: 0, korpus: 0, nogi: 0 });
        });
    });

    describe('parries', () => {
        test('an unknown prefix counts as a weapon parry', () => {
            recordCombatStat('', 'moje_parowanie', 'Parujesz cios.');

            const s = getCombatStats();
            expect(s.wyparowane.count).toBe(1);
            expect(s.wyparowane.bron).toBe(1);
        });

        test('a "zbr" prefix counts as armour, with the body part', () => {
            recordCombatStat('zbr', 'moje_parowanie', 'Cios trafia w twoj korpus.');

            const s = getCombatStats();
            expect(s.wyparowane.count).toBe(1);
            expect(s.wyparowane.zbroje.count).toBe(1);
            expect(s.wyparowane.zbroje.parts.korpus).toBe(1);
            expect(s.wyparowane.bron).toBe(0);
        });

        test('a "tar" prefix counts as a shield', () => {
            recordCombatStat('tar', 'moje_parowanie', 'Zaslaniasz sie tarcza.');

            const s = getCombatStats();
            expect(s.wyparowane.count).toBe(1);
            expect(s.wyparowane.tarcze).toBe(1);
        });
    });

    test('dodges are counted', () => {
        recordCombatStat('', 'moje_uniki', 'Unikasz ciosu.');
        recordCombatStat('', 'moje_uniki', 'Unikasz ciosu.');

        expect(getCombatStats().unikniete).toBe(2);
    });

    test('total is the sum of hits taken, parries and dodges', () => {
        recordCombatStat('1/6', 'innych_ciosy_we_mnie', 'Trafia cie w glowe.');
        recordCombatStat('', 'moje_parowanie', 'Parujesz cios.');
        recordCombatStat('tar', 'moje_parowanie', 'Zaslaniasz sie tarcza.');
        recordCombatStat('', 'moje_uniki', 'Unikasz ciosu.');

        expect(getCombatStats().total).toBe(4);
    });

    test('unrelated gag types are ignored', () => {
        recordCombatStat('3/6', 'moje_ciosy', 'Ranisz wielkiego szczura.');
        recordCombatStat('3/6', 'innych_ciosy', 'Ktos rani szczura.');

        expect(getCombatStats().total).toBe(0);
    });

    test('the snapshot is a copy — callers cannot mutate the store', () => {
        recordCombatStat('', 'moje_uniki', 'Unikasz ciosu.');

        const s = getCombatStats();
        s.unikniete = 99;

        expect(getCombatStats().unikniete).toBe(1);
    });

    test('a recorded stat emits stat.updated with the new snapshot', () => {
        let seen: { unikniete: number } | null = null;
        const off = eventBus.on('stat.updated', (s: any) => { seen = s; });

        recordCombatStat('', 'moje_uniki', 'Unikasz ciosu.');
        off();

        expect(seen).not.toBeNull();
        expect(seen!.unikniete).toBe(1);
    });

    test('reset clears everything and announces it', () => {
        recordCombatStat('1/6', 'innych_ciosy_we_mnie', 'Trafia cie w glowe.');
        let cleared = false;
        const off = eventBus.on('stat.cleared', () => { cleared = true; });

        client.sendEvent('reset');
        off();

        expect(getCombatStats().total).toBe(0);
        expect(getCombatStats().otrzymane.parts.glowa).toBe(0);
        expect(cleared).toBe(true);
    });
});
