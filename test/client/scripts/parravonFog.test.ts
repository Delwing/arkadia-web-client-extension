import initParravonFog, {
    FOG_STREETS,
    FogLocator,
    FogMode,
    FogOutcome,
    MAYBE_EXITS,
    SHELTERS,
    WINDOW,
} from '@client/scripts/parravonFog';
import Triggers from '@client/Triggers';
import {AnsiAwareBuffer} from '@client/ansi/FormatState';
import eventBus from '@modules/core/eventBus';
import {globalStorage} from '@modules/core/storage';

const OUTCOME: Record<string, FogOutcome> = {S: 'moved', F: 'noExit', B: 'grabbed'};

// Odpowiedzi gry z logu gracza, ktory zginal w mgle: kierunek + S (przeszedl),
// F (brak wyjscia), B (ktos go zlapal).
const DEATH_LOG = (
    'neS wF wF eS wS wF nF neF eS eF swF wS nwF nF neF dF sF seF eS swF sF seF eF uF nF nwF wS wF dF eS wS wF ' +
    'nwF nF uF nwF wF dF sF dF uF eS eF nF neS neF nF nwB neF nwS swF nF seB seB seS swS wS dF swS wS eS eF uS ' +
    'eS eF eF wS wF nwF dS wS wF swB nwF nF nF nwF nwF wF swS swF wF nwF wF nwF nF uF eF sS swF wF nwF eF sS sF ' +
    'sF swF wF nwF wF nwF swF sF eF neF neF neF nS nwF nB nwF neS nF nwS nF nwF neS nF nwF neF nF'
).split(' ').map(step => ({dir: step.slice(0, -1), outcome: OUTCOME[step.slice(-1)]}));

const ROOMS = Object.keys(FOG_STREETS).map(Number);

/** Prawdziwy swiat: gdzie prowadzi krok; przejscia "bywa otwarte" wedlug `maybeOpen`. */
function realExit(room: number, action: string, maybeOpen: boolean): number | undefined {
    if (action === WINDOW.command) return room === WINDOW.room ? WINDOW.target : undefined;
    return FOG_STREETS[room]?.[action] ?? (maybeOpen ? MAYBE_EXITS[room]?.[action] : undefined);
}

/** Idzie za podpowiedziami z lokacji `start`, az dotrze do schronienia. */
function walk(start: number, mode: FogMode, maybeOpen = false, limit = 60): number {
    const locator = new FogLocator();
    let room = start;
    for (let steps = 1; steps <= limit; steps++) {
        const action = locator.advise(mode).next!;
        const target = realExit(room, action, maybeOpen);
        if (target !== undefined && SHELTERS.has(target)) return steps;
        locator.observe(action, target === undefined ? 'noExit' : 'moved');
        if (target !== undefined) room = target;
    }
    return Infinity;
}

describe('parravon fog - lokator', () => {
    test('mapa ulic jest spojna: kazde przejscie miedzy ulicami ma powrot', () => {
        const back: Record<string, string> = {n: 's', s: 'n', e: 'w', w: 'e', ne: 'sw', sw: 'ne', nw: 'se', se: 'nw', u: 'd', d: 'u'};
        for (const [room, exits] of Object.entries(FOG_STREETS)) {
            for (const [dir, target] of Object.entries(exits)) {
                if (SHELTERS.has(target)) continue;
                expect(FOG_STREETS[target][back[dir]]).toBe(Number(room));
            }
        }
    });

    test('log z mgly prowadzi do jednej lokacji - tam, gdzie gracz zginal', () => {
        const locator = new FogLocator();
        DEATH_LOG.forEach((step, index) => {
            expect(locator.observe(step.dir, step.outcome)).toBe(true);
            if (index === 23) expect(locator.getCandidates()).toEqual([26616]);
        });
        expect(locator.getCandidates()).toEqual([26620]);
        // Z 26620 najblizej jest okno w 26613.
        expect(locator.advise().route).toEqual(['e', 'ne', 'e', 'ne', 'e', WINDOW.command]);
        expect(locator.advise().shelter).toBe(WINDOW.target);
    });

    test('zachodnie drzwi 26645 prowadza do schronienia', () => {
        expect(new FogLocator().route(26645)).toEqual({steps: ['w'], shelter: 26808});
    });

    test('zlapanie potwierdza wyjscie, ale nie przesuwa', () => {
        const locator = new FogLocator();
        locator.observe('u', 'grabbed');
        expect(locator.getCandidates()).toEqual([26619]);
    });

    test('sprzeczne odpowiedzi zaczynaja szukanie od nowa', () => {
        const locator = new FogLocator();
        locator.observe('u', 'grabbed');
        expect(locator.observe('u', 'noExit')).toBe(false);
        expect(locator.getCandidates()).toHaveLength(ROOMS.length);
    });

    test('przejscie, ktore bywa zamkniete: proba tylko na miejscu i tylko raz', () => {
        const locator = new FogLocator();
        // Brak wyjscia na sw nie wyklucza 26634 - to przejscie bywa zamkniete.
        locator.observe('sw', 'noExit');
        expect(locator.getCandidates()).toContain(26634);

        const here = new FogLocator();
        // Zlapany przy wejsciu w gore stoi w 26619; stamtad u, se, s, e prowadzi do 26634.
        here.observe('u', 'grabbed');
        ['u', 'se', 's', 'e'].forEach(dir => here.observe(dir, 'moved'));
        expect(here.getCandidates()).toEqual([26634]);
        expect(here.advise()).toMatchObject({next: 'sw', gamble: true});
        here.observe('sw', 'noExit');
        expect(here.advise().gamble).toBeUndefined();
        expect(here.advise().next).not.toBe('sw');
    });

    test.each([
        ['average', false], ['safe', false], ['average', true], ['safe', true],
    ] as [FogMode, boolean][])('tryb %s (przejscie przy 26634 otwarte: %s) dochodzi do schronienia z kazdej ulicy', (mode, open) => {
        const steps = ROOMS.map(start => walk(start, mode, open));
        expect(Math.max(...steps)).toBeLessThan(20);
    });

    test('tryb bezpieczny ma krotszy najgorszy przypadek, sredni krotsza srednia', () => {
        const average = ROOMS.map(start => walk(start, 'average'));
        const safe = ROOMS.map(start => walk(start, 'safe'));
        const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
        expect(Math.max(...safe)).toBeLessThanOrEqual(Math.max(...average));
        expect(mean(average)).toBeLessThanOrEqual(mean(safe));
    });
});

class FakeClient {
    Triggers = new Triggers({} as any);
    listeners: Record<string, Function[]> = {};
    sent: string[] = [];
    printed: string[] = [];
    highlighted: number[] = [];
    bind: string | null = null;

    Map = {
        paused: false,
        currentRoom: undefined as { id: number } | undefined,
        setPaused: (paused: boolean) => { this.Map.paused = paused; },
        setMapRoomById: (id: number) => { this.Map.currentRoom = {id}; },
        createHighlighter: () => ({
            clear: () => { this.highlighted = []; },
            add: (ids: number[]) => { this.highlighted = [...ids]; },
        }),
    };

    FunctionalBind = {
        set: (printable: string) => {
            this.bind = printable;
            this.printed.push(`bind: ${printable}`);
        },
        clear: () => { this.bind = null; },
        getCategory: () => ({getPrintable: () => this.bind}),
    };

    on = (event: string, listener: Function) => {
        (this.listeners[event] ??= []).push(listener);
        return () => {};
    };
    emit(event: string, detail?: unknown) {
        this.listeners[event]?.forEach(listener => listener(detail));
    }
    println = (line: AnsiAwareBuffer | string) => { this.printed.push(typeof line === 'string' ? line : line.text); };
    sendCommand = (command: string) => {
        this.sent.push(command);
        this.emit('command', command);
    };
    line(text: string, type = '') {
        Triggers.prototype.parseLine.call(this.Triggers, new AnsiAwareBuffer(text), type);
    }
}

describe('parravon fog - skrypt', () => {
    let client: FakeClient;
    let aliases: { pattern: RegExp; callback: Function }[];
    let filled: string[];
    let offFill: () => void;
    const alias = (command: string) => {
        const entry = aliases.find(a => a.pattern.test(command))!;
        entry.callback(command.match(entry.pattern));
    };
    const fog = () => client.line('Wsrod wszechobecnych oparow tracisz zupelnie orientacje i juz po chwili nie masz pojecia gdzie sie znajdujesz.');

    beforeEach(() => {
        localStorage.clear();
        client = new FakeClient();
        aliases = [];
        filled = [];
        offFill = eventBus.on('commandInput.fill', (text: string) => { filled.push(text); });
        initParravonFog(client as any, aliases);
    });
    afterEach(() => offFill());

    test('mgla wstrzymuje mape, zaznacza ulice, ustawia bind raz i podsuwa /mgla', () => {
        fog();
        expect(client.Map.paused).toBe(true);
        expect(client.highlighted).toHaveLength(ROOMS.length);
        expect(client.bind).toBe('/mgla');
        expect(filled.at(-1)).toBe('/mgla');

        client.emit('command', 'n');
        client.line('Nie widzisz zadnego wyjscia prowadzacego na polnoc.');
        expect(client.printed.filter(line => line.startsWith('bind:'))).toHaveLength(1);
        expect(filled.length).toBeGreaterThan(1);
    });

    test('odpowiedzi trafiaja do krokow w kolejnosci, takze wyslanych z wyprzedzeniem', () => {
        fog();
        client.emit('command', 'n');
        client.emit('command', 'u');
        client.line('Nie widzisz zadnego wyjscia prowadzacego na polnoc.');
        expect(client.Map.currentRoom).toBeUndefined();
        // Jedyne wejscie w gore prowadzi z 26619 do 26638.
        client.line('Posrod mgly.', 'room.short');
        expect(client.Map.currentRoom?.id).toBe(26638);
        client.emit('command', 'e');
        client.emit('command', 'e');
        client.line('Na zamglonych ulicach.');
        client.line('Nie widzisz zadnego wyjscia prowadzacego na wschod.');
        expect(client.Map.currentRoom?.id).toBe(26639);
        expect(client.highlighted).toEqual([]);
        expect(client.printed.at(-1)).toContain('Jestes w 26639');
    });

    test('/mgla prowadzi do schronienia, a dotarcie konczy mgle', () => {
        fog();
        client.emit('command', 'u');
        client.line('Posrod mgly.', 'room.short');
        const {steps, shelter} = new FogLocator().route(26638, 'safe');
        let room = 26638;
        for (const action of steps) {
            alias('/mgla');
            expect(client.sent.at(-1)).toBe(action);
            room = realExit(room, action, false)!;
            client.line(room === shelter ? 'Ciche schronienie.' : 'W pograzonym przez mrok miescie.', 'room.short');
        }
        expect(client.Map.paused).toBe(false);
        expect(client.bind).toBeNull();
        expect(client.printed.at(-1)).toContain('Schronienie');
    });

    test('nazwa spoza mgly bez drogi do schronienia to zwykly krok', () => {
        fog();
        client.emit('command', 'ne');
        client.line('Rue Laudethaire.', 'room.short');
        expect(client.Map.paused).toBe(true);
        expect(client.printed.at(-1)).toContain('Mozliwe lokacje');
    });

    test('tryb mozna zmienic i jest zapamietany', () => {
        alias('/mgla tryb srednio');
        expect(globalStorage.get('parravon_fog_mode')).toBe('average');
        expect(client.printed.at(-1)).toContain('srednio');
        alias('/mgla tryb bezpiecznie');
        expect(globalStorage.get('parravon_fog_mode')).toBe('safe');
    });

    test('swit konczy szukanie i oddaje mapie poprzedni stan', () => {
        fog();
        client.emit('clock.sunrise');
        expect(client.Map.paused).toBe(false);
        expect(client.bind).toBeNull();
        expect(client.printed.at(-1)).toContain('Swit');
    });
});
