import {createRaonHarness, RaonHarness} from './raonHarness';

const ROOM_A = 'Osnutymi zwiewna pajeczyna mroku korytarzami wedruje ciezka cisza.';
const ROOM_B = 'Ograniczona scianami z bialego marmuru, zamglona przestrzen wypelniona jest chlodem.';
const ROOM_C = 'Sale i korytarze, puste i ciche, zdaja sie ciagnac w nieskonczonosc.';
const GRIFFINS = 'Pograzone w ciszy pomieszczenie strzezone jest przez cztery kamienne gryfy.';
const CHAPEL = 'Dlugie rzedy law ciagna sie od poteznych drzwi, w strone zniszczonego posagu.';

describe('raon labyrinth mapper', () => {
    let h: RaonHarness;
    const last = () => h.statusLines().at(-1);

    beforeEach(async () => {
        vi.resetModules();
        h = await createRaonHarness();
        h.enterEntry();
        h.command('s');
        h.room(ROOM_A, ['n', 's', 'e']);
    });

    test('maps a step taken with the s! bypass', () => {
        h.command('s!');
        h.room(GRIFFINS, ['n', 'se', 'w']);

        expect(last()).toBe('[Raon] Pokoj 2/2 [GRYFY] | polnoc [1], poludniowy-wschod, zachod');
    });

    test('ignores a bang on something that is not a direction', () => {
        h.command('kup!');
        h.room(GRIFFINS, ['n', 'se', 'w']);

        expect(h.statusLines()).toHaveLength(1);
    });

    test('an unseen step back into the source room does not link the room to itself', () => {
        // The mapper believes we are still in A (the move away went unseen) and we walk back in.
        h.command('n');
        h.room(ROOM_A, ['n', 's', 'e']);

        expect(last()).toBe('[Raon] Pokoj 1/1 | polnoc [wyjscie], poludnie, wschod');
    });

    test('the chapel keeps the number its placeholder had', () => {
        h.command('e');
        h.room(ROOM_B, ['w', 'n', 's'], ['Zamkniete masywne drzwi prowadzace na poludnie.']);
        expect(last()).toBe('[Raon] Pokoj 2/3 | zachod [1], polnoc, poludnie [3]');

        h.command('n');
        h.room(ROOM_C, ['s']);
        h.command('s');
        h.room(ROOM_B, ['w', 'n', 's']);
        h.command('s');
        h.room(CHAPEL, ['n'], ['Otwarte masywne drzwi prowadzace na polnoc.']);
        expect(last()).toBe('[Raon] Pokoj 3/4 [CEREMONIALNA] | polnoc [2]');

        h.command('n');
        h.room(ROOM_B, ['w', 'n', 's']);
        expect(last()).toBe('[Raon] Pokoj 2/4 | zachod [1], polnoc [4], poludnie [3]');
    });
});
