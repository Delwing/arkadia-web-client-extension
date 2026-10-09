import initCytadela from '@client/scripts/cytadela';
import Triggers from '@client/Triggers';
import {AnsiAwareBuffer} from '@client/ansi/FormatState';

class FakeClient {
    Triggers = new Triggers({} as any);
    highlighted: number[] = [];
    inTeam = false;
    leader = false;
    TeamManager = {
        isInAnyTeam: () => this.inTeam,
        isLeader: () => this.leader,
    };
    FunctionalBind = {set: jest.fn()};
    Map = {
        isLost: false,
        currentRoom: {
            id: 1,
            exits: {north: 2, southeast: 3, west: 4} as Record<string, number>,
            specialExits: {} as Record<string, number>,
        } as any,
        createHighlighter: jest.fn(() => ({add: (ids: number[]) => this.highlighted.push(...ids)})),
    };

    feed(text: string) {
        return this.Triggers.parseLine(new AnsiAwareBuffer(text), 'text');
    }
}

function setup() {
    const client = new FakeClient();
    initCytadela(client as any);
    return client;
}

describe('cytadela - niebezpieczne wyjscia', () => {
    test('zaznacza lokacje za oboma wyjsciami na czerwono', () => {
        const client = setup();
        client.feed('Masz nieodparte wrazenie, ze na polnoc i na poludniowy-wschod stad czai sie niebezpieczenstwo.');

        expect(client.Map.createHighlighter).toHaveBeenCalledWith({color: '#ff3030'});
        expect(client.highlighted).toEqual([2, 3]);
    });

    test('koloruje tylko wyjscia, nie cala linie', () => {
        const client = setup();
        const text = 'Masz nieodparte wrazenie, ze na polnoc i na poludniowy-wschod stad czai sie niebezpieczenstwo.';
        const line = client.feed(text)!;
        const isRed = (index: number) => JSON.stringify(line.getStateAt(index)?.foreground ?? null).includes('ff3030');

        const shown = line.text;
        expect(shown).toBe(`[ PULAPKA ] ${text}`);
        expect(isRed(0)).toBe(true);
        expect(isRed(shown.indexOf('Masz'))).toBe(false);
        expect(isRed(shown.indexOf('polnoc'))).toBe(true);
        expect(isRed(shown.indexOf(' i na '))).toBe(false);
        expect(isRed(shown.indexOf('poludniowy-wschod') + 5)).toBe(true);
        expect(isRed(shown.indexOf(' stad'))).toBe(false);
    });

    test('bez druzyny nie ustawia bindu', () => {
        const client = setup();
        client.feed('Masz nieodparte wrazenie, ze na polnoc stad czai sie niebezpieczenstwo.');

        expect(client.FunctionalBind.set).not.toHaveBeenCalled();
    });

    test('prowadzacy tez dostaje bind', () => {
        const client = setup();
        client.inTeam = true;
        client.leader = true;
        client.feed('Masz nieodparte wrazenie, ze na polnoc stad czai sie niebezpieczenstwo.');

        expect(client.FunctionalBind.set).toHaveBeenCalledWith("'Niebezpieczenstwo na polnoc.");
    });

    test('prowadzony dostaje bind z ostrzezeniem dla druzyny', () => {
        const client = setup();
        client.inTeam = true;
        client.feed('Masz nieodparte wrazenie, ze na polnoc i na poludniowy-wschod stad czai sie niebezpieczenstwo.');

        expect(client.FunctionalBind.set).toHaveBeenCalledWith("'Niebezpieczenstwo na polnoc i na poludniowy-wschod.");
    });

    test('ostrzezenie od kogos z druzyny zaznacza lokacje i koloruje wyjscia', () => {
        const client = setup();
        const line = client.feed('Zorlan mowi: Niebezpieczenstwo na polnoc i na zachod.')!;
        const isRed = (index: number) => JSON.stringify(line.getStateAt(index)?.foreground ?? null).includes('ff3030');
        const shown = line.text;

        expect(shown).toBe('[ PULAPKA ] Zorlan mowi: Niebezpieczenstwo na polnoc i na zachod.');
        expect(isRed(shown.indexOf('Zorlan'))).toBe(false);
        expect(isRed(shown.indexOf('polnoc'))).toBe(true);
        expect(isRed(shown.indexOf('zachod'))).toBe(true);
        expect(client.highlighted).toEqual([2, 4]);
    });

    test('krzyk nie zaznacza lokacji', () => {
        const client = setup();
        client.feed('Zorlan krzyczy: Niebezpieczenstwo na polnoc.');

        expect(client.highlighted).toEqual([]);
    });

    test('pojedyncze wyjscie', () => {
        const client = setup();
        client.feed('Masz nieodparte wrazenie, ze na zachod stad czai sie niebezpieczenstwo.');

        expect(client.highlighted).toEqual([4]);
    });

    test('nie zaznacza nic, gdy mapper sie zgubil', () => {
        const client = setup();
        client.Map.isLost = true;
        client.feed('Masz nieodparte wrazenie, ze na polnoc stad czai sie niebezpieczenstwo.');

        expect(client.Map.createHighlighter).not.toHaveBeenCalled();
        expect(client.highlighted).toEqual([]);
    });
});
