import Client from "../Client";
import {matchWhen} from "@client/Triggers.ts";
import {getLongDir, getShortDir, isDirection, polishToEnglish} from "@shared/map/directions";
import {colorString, createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "../ansi/FormatState";
import eventBus from "@modules/core/eventBus";
import {globalStorage} from "@modules/core/storage";

/**
 * Parravon noca - mgla.
 *
 * O zmroku mgla rzuca gracza w losowe miejsce ulic Parravonu miedzy 26611,
 * 26658 i 26646. GMCP milknie, a nazwy lokacji sa losowane przy kazdym kroku,
 * wiec niczego nie zdradzaja. Zdradzaja za to wyjscia: ulice dzialaja jak na
 * mapie, budynki i bramy sa zamkniete. Kazda odpowiedz gry zaweza wiec zbior
 * miejsc, w ktorych mozemy byc:
 *
 * - "Nie widzisz zadnego wyjscia prowadzacego na X" - zostaja lokacje bez X,
 * - "Nie mozesz sie tam udac, gdyz ktos lapie cie" - X jest, ale stoimy w miejscu,
 * - nazwa lokacji z mgly - przeszlismy, kazdy kandydat przesuwa sie na X.
 *
 * Do switu przezyc mozna tylko w schronieniu, gdzie mgly nie ma. Podpowiadamy
 * krok, ktory najszybciej do ktoregos prowadzi - planujac dokladnie, po
 * wszystkich zbiorach kandydatow, jakie moga sie zdarzyc.
 */

/** Schronienia - lokacje bez mgly. */
export const SHELTERS = new Set([26657, 26808, 26804, 26810]);

/** Ulice objete mgla; wyjscia prowadza na inne ulice albo do schronienia. */
export const FOG_STREETS: Record<number, Record<string, number>> = {
    26611: {se: 26612},
    26612: {e: 26613, sw: 26616, nw: 26611},
    26613: {e: 26614, w: 26612},
    26614: {w: 26613},
    26616: {ne: 26612, w: 26617},
    26617: {e: 26616, sw: 26619},
    26619: {ne: 26617, w: 26620, u: 26638},
    26620: {e: 26619, sw: 26621},
    26621: {ne: 26620, se: 26623, s: 26622},
    26622: {n: 26621, ne: 26623, s: 26624},
    26623: {ne: 26638, e: 26637, sw: 26622, nw: 26621},
    26624: {n: 26622, se: 26625},
    26625: {e: 26627, nw: 26624},
    26627: {se: 26628, w: 26625},
    26628: {e: 26629, nw: 26627},
    26629: {e: 26631, w: 26628},
    26631: {ne: 26632, w: 26629},
    26632: {e: 26642, sw: 26631, nw: 26633},
    26633: {n: 26634, se: 26632},
    26634: {s: 26633, w: 26635},
    26635: {n: 26636, e: 26634},
    26636: {n: 26639, e: 26640, s: 26635, w: 26637, nw: 26638},
    26637: {n: 26638, ne: 26639, e: 26636, w: 26623},
    26638: {e: 26639, se: 26636, s: 26637, sw: 26623, d: 26619},
    26639: {s: 26636, sw: 26637, w: 26638},
    26640: {e: 26641, w: 26636},
    26641: {ne: 26651, se: 26650, w: 26640},
    26642: {e: 26643, w: 26632},
    26643: {sw: 26645, w: 26642},
    // Noca drzwi na zachod stoja otworem.
    26645: {ne: 26643, s: 26646, w: 26808},
    26646: {n: 26645},
    26650: {ne: 26652, nw: 26641},
    26651: {se: 26652, sw: 26641},
    26652: {se: 26653, sw: 26650, nw: 26651},
    26653: {ne: 26655, se: 26675, nw: 26652},
    26655: {sw: 26653, nw: 26656},
    26656: {ne: 26658, se: 26655, nw: 26657},
    26658: {sw: 26656},
    26675: {se: 26677, nw: 26653},
    26677: {ne: 26680, nw: 26675},
    26680: {sw: 26677},
};

/**
 * Przejscia do schronienia, ktore bywaja zamkniete. Planujemy tak, jakby byly
 * zamkniete, ale gdy i tak stoimy obok, warto sprobowac - kosztuje jeden krok.
 */
export const MAYBE_EXITS: Record<number, Record<string, number>> = {
    26634: {sw: 26810},
};

/** Okno w 26613 - komenda zamiast kierunku, wiec tylko gdy wiemy, ze tam stoimy. */
export const WINDOW = {room: 26613, command: 'wespnij sie do okna', target: 26804};

const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'u', 'd'];

export type FogOutcome = 'moved' | 'noExit' | 'grabbed';
/** `average` - najmniej krokow przecietnie; `safe` - najmniej krokow w najgorszym razie. */
export type FogMode = 'average' | 'safe';

export interface FogAdvice {
    candidates: number[];
    /** Komenda, ktora warto teraz wyslac; brak, gdy nie ma juz dokad isc. */
    next?: string;
    /** Cala droga do schronienia - tylko gdy wiadomo, gdzie jestesmy. */
    route?: string[];
    /** Schronienie na koncu tej drogi. */
    shelter?: number;
    /** Krok jest proba przejscia, ktore bywa zamkniete. */
    gamble?: boolean;
}

const keyOf = (rooms: number[]) => rooms.join(',');

/**
 * Plan dla zbiorow kandydatow, liczony dokladnie: kazdy zbior, do ktorego
 * moga doprowadzic odpowiedzi gry, dostaje oczekiwana (albo najgorsza) liczbe
 * krokow do schronienia. Zbiorow jest ledwie kilka tysiecy, wiec liczymy je
 * przy pierwszej potrzebie i trzymamy - nowe dochodza tylko po nietypowych
 * odpowiedziach (zlapanie, sprzecznosc).
 */
class FogPlanner {
    private static readonly shared = new WeakMap<object, FogPlanner>();

    /** Jeden plan na mape ulic - liczy sie raz, a lokatorow moze byc wiele. */
    static for(streets: Record<number, Record<string, number>>): FogPlanner {
        let planner = FogPlanner.shared.get(streets);
        if (!planner) {
            planner = new FogPlanner(streets);
            FogPlanner.shared.set(streets, planner);
        }
        return planner;
    }

    /** Kazdy znany zbior z gotowymi przejsciami: krok -> [waga, klucz zbioru po kroku]. */
    private readonly states = new Map<string, { action: string; outcomes: [number, string][] }[]>();
    private readonly average = new Map<string, number>();
    private readonly worst = new Map<string, number>();

    private constructor(private readonly streets: Record<number, Record<string, number>>) {}

    exit(room: number, action: string): number | undefined {
        if (action === WINDOW.command) return room === WINDOW.room ? WINDOW.target : undefined;
        return this.streets[room]?.[action];
    }

    actions(rooms: number[]): string[] {
        const useful = DIRS.filter(dir => rooms.some(room => this.exit(room, dir) !== undefined));
        return rooms.length === 1 && rooms[0] === WINDOW.room ? [WINDOW.command, ...useful] : useful;
    }

    /** Mozliwe odpowiedzi na krok: [ilu kandydatow, zbior po kroku]; schronienie konczy. */
    outcomes(rooms: number[], action: string): [number, number[]][] {
        const closed: number[] = [];
        const moved = new Set<number>();
        let movedCount = 0;
        for (const room of rooms) {
            const target = this.exit(room, action);
            if (target === undefined) closed.push(room);
            else if (!SHELTERS.has(target)) {
                moved.add(target);
                movedCount++;
            }
        }
        const result: [number, number[]][] = [];
        if (closed.length) result.push([closed.length, closed]);
        if (movedCount) result.push([movedCount, [...moved].sort((a, b) => a - b)]);
        return result;
    }

    private cost(outcomes: [number, string][], mode: FogMode): number {
        if (mode === 'safe') {
            let worst = 0;
            for (const [, key] of outcomes) worst = Math.max(worst, this.worst.get(key)!);
            return 1 + worst;
        }
        let sum = 0;
        for (const [weight, key] of outcomes) sum += weight * this.average.get(key)!;
        return 1 + sum;
    }

    /** Wszystkie zbiory osiagalne z `rooms`, ktorych jeszcze nie znamy - i ich wartosci. */
    private learn(rooms: number[]) {
        if (this.states.has(keyOf(rooms))) return;
        const fresh: string[] = [];
        const seen = new Set([keyOf(rooms)]);
        const queue = [rooms];
        while (queue.length) {
            const current = queue.shift()!;
            const key = keyOf(current);
            fresh.push(key);
            const transitions = this.actions(current).map(action => ({
                action,
                outcomes: this.outcomes(current, action).map(([count, next]): [number, string] => {
                    const nextKey = keyOf(next);
                    if (!this.states.has(nextKey) && !seen.has(nextKey)) {
                        seen.add(nextKey);
                        queue.push(next);
                    }
                    return [count / current.length, nextKey];
                }),
            }));
            this.states.set(key, transitions);
        }
        // Iteracja wartosci tylko po nowych zbiorach - stare od nowych nie zaleza.
        for (const mode of ['average', 'safe'] as FogMode[]) {
            const values = mode === 'safe' ? this.worst : this.average;
            fresh.forEach(key => values.set(key, 0));
            for (let round = 0; round < 500; round++) {
                let change = 0;
                for (const key of fresh) {
                    let best = Infinity;
                    for (const {outcomes} of this.states.get(key)!) best = Math.min(best, this.cost(outcomes, mode));
                    change = Math.max(change, Math.abs(best - values.get(key)!));
                    values.set(key, best);
                }
                if (change < 1e-9) break;
            }
        }
    }

    /** Najlepszy krok; w trybie `safe` remisy rozstrzyga srednia. */
    choose(rooms: number[], mode: FogMode): string | undefined {
        this.learn(rooms);
        let best: { action: string; cost: number; tie: number } | undefined;
        for (const {action, outcomes} of this.states.get(keyOf(rooms))!) {
            const cost = this.cost(outcomes, mode);
            const tie = mode === 'safe' ? this.cost(outcomes, 'average') : 0;
            if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && tie < best.tie - 1e-9)) {
                best = {action, cost, tie};
            }
        }
        return best?.action;
    }
}

export class FogLocator {
    private candidates: Set<number>;
    private readonly planner: FogPlanner;
    /** Zamkniete dzis przejscia z MAYBE_EXITS, sprawdzone na wlasnej skorze. */
    private readonly triedMaybe = new Set<string>();

    constructor(private readonly streets: Record<number, Record<string, number>> = FOG_STREETS) {
        this.planner = FogPlanner.for(streets);
        this.candidates = new Set(this.all());
    }

    private all(): number[] {
        return Object.keys(this.streets).map(Number);
    }

    reset() {
        this.candidates = new Set(this.all());
        this.triedMaybe.clear();
    }

    getCandidates(): number[] {
        return [...this.candidates].sort((a, b) => a - b);
    }

    private maybe(room: number, dir: string): number | undefined {
        return MAYBE_EXITS[room]?.[dir];
    }

    /**
     * Uwzglednia odpowiedz gry na krok `dir`. Zwraca false, gdy nic nie pasuje -
     * wtedy zaczynamy od wszystkich ulic, bo lepiej szukac dluzej niz utknac.
     */
    observe(dir: string, outcome: FogOutcome): boolean {
        const next = new Set<number>();
        for (const room of this.candidates) {
            const target = this.planner.exit(room, dir);
            const maybe = this.maybe(room, dir) !== undefined;
            if (outcome === 'noExit' && (target === undefined || maybe)) next.add(room);
            if (outcome === 'grabbed' && (target !== undefined || maybe)) next.add(room);
            if (outcome === 'moved' && target !== undefined && !SHELTERS.has(target)) next.add(target);
        }
        if (outcome === 'noExit' && this.candidates.size === 1) {
            const [room] = this.candidates;
            if (this.maybe(room, dir) !== undefined) this.triedMaybe.add(`${room}:${dir}`);
        }
        this.candidates = next;
        if (next.size > 0) return true;
        this.reset();
        return false;
    }

    /** Czy krok `dir` moze z ktoregos kandydata prowadzic do schronienia. */
    mayReachShelter(dir: string): boolean {
        return [...this.candidates].some(room => {
            const target = this.planner.exit(room, dir) ?? this.maybe(room, dir);
            return target !== undefined && SHELTERS.has(target);
        });
    }

    /** Przeszlismy, ale nie wiadomo dokad - kazdy sasiad kazdego kandydata. */
    observeUnknownMove() {
        const next = new Set<number>();
        for (const room of this.candidates) {
            Object.values(this.streets[room]).filter(id => !SHELTERS.has(id)).forEach(id => next.add(id));
        }
        this.candidates = next.size ? next : new Set(this.all());
    }

    /** Droga do schronienia z pewnej lokacji, wedlug planu. */
    route(from: number, mode: FogMode = 'average'): { steps: string[]; shelter?: number } {
        const steps: string[] = [];
        let room = from;
        while (steps.length < 50) {
            const action = this.planner.choose([room], mode);
            if (!action) return {steps};
            steps.push(action);
            const target = this.planner.exit(room, action)!;
            if (SHELTERS.has(target)) return {steps, shelter: target};
            room = target;
        }
        return {steps};
    }

    advise(mode: FogMode = 'average'): FogAdvice {
        const candidates = this.getCandidates();
        if (candidates.length === 1) {
            const [room] = candidates;
            const {steps, shelter} = this.route(room, mode);
            // Przejscie, ktore bywa otwarte, sprawdzamy tylko gdy i tak tu jestesmy.
            const gamble = Object.entries(MAYBE_EXITS[room] ?? {})
                .find(([dir]) => !this.triedMaybe.has(`${room}:${dir}`));
            if (gamble && steps.length > 1) {
                return {candidates, next: gamble[0], route: steps, shelter, gamble: true};
            }
            return {candidates, next: steps[0], route: steps, shelter};
        }
        return {candidates, next: this.planner.choose(candidates, mode)};
    }
}

const FOG_START = /^Wsrod wszechobecnych oparow tracisz zupelnie orientacje/;
/** Nazwy, ktore mgla nadaje lokacjom - na wypadek, gdyby nie przyszly jako room.short. */
const FOG_TITLE = /^[ >]*(?:Wsrod oparow mgly|Posrod nienaturalnych ciemnosci|W pograzonym przez mrok miescie|Na zamglonych ulicach|Posrod mgly)\.$/;
const NO_EXIT = /^[ >]*Nie widzisz zadnego wyjscia prowadzacego na (.+)\.$/;
const GRABBED = /^[ >]*Nie mozesz sie tam udac, gdyz ktos lapie cie/;
const LOOK = /^(?:l|sp|spojrz|zerknij)$/;
/** Odpowiedz starsza niz tyle nie nalezy juz do czekajacego kroku. */
const PENDING_TTL_MS = 10_000;
const ALIAS = '/mgla';

const MODE_LABEL: Record<FogMode, string> = {
    average: 'srednio (najmniej krokow przecietnie)',
    safe: 'bezpiecznie (najmniej krokow w najgorszym razie)',
};
const MODE_ARG: Record<string, FogMode> = {srednio: 'average', bezpiecznie: 'safe'};

const TAG = 'parravon-fog';
const LABEL = createColorFormat('#9fb4ff');
const GOOD = createColorFormat('#3ddc84');
const HINT = createColorFormat('#ffd166');

export default function initParravonFog(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    const locator = new FogLocator();
    let active = false;
    /** Wlaczone recznie (/mgla start) - np. na probe poza mgla, gdzie GMCP nie milknie. */
    let manual = false;
    let pausedBefore = false;
    let pending: { dir: string; at: number }[] = [];
    let lastStatus = '';
    let highlighter: ReturnType<typeof client.Map.createHighlighter> | undefined;

    const mode = (): FogMode => globalStorage.get('parravon_fog_mode') === 'average' ? 'average' : 'safe';

    const say = (...parts: AnsiAwareBuffer[]) => {
        const out = new AnsiAwareBuffer();
        out.appendBuffer(colorString('[mgla] ', LABEL));
        parts.forEach(part => out.appendBuffer(part));
        client.println(out);
    };
    const plain = (text: string) => {
        const buffer = new AnsiAwareBuffer();
        buffer.append(text, {});
        return buffer;
    };

    const showCandidates = (rooms: number[]) => {
        highlighter ??= client.Map.createHighlighter({color: '#b48cff'});
        highlighter.clear();
        if (rooms.length > 1) highlighter.add(rooms);
    };

    const ownsBind = () => client.FunctionalBind.getCategory('default')?.getPrintable() === ALIAS;

    const report = (force = false) => {
        const advice = locator.advise(mode());
        const {candidates} = advice;
        showCandidates(candidates);
        if (candidates.length === 1 && client.Map.currentRoom?.id !== candidates[0]) {
            // Mapa stoi na wstrzymaniu, wiec ustawiamy ja sami - na pewna lokacje.
            client.Map.setMapRoomById(candidates[0], {silent: true});
        }
        // Bind raz na mgle; ponawiamy tylko, gdy ktos inny go przejal.
        if (!ownsBind()) client.FunctionalBind.set(ALIAS);
        eventBus.emit('commandInput.fill', ALIAS);

        const status = `${candidates.join(',')}|${advice.next}|${advice.route?.join(' ')}`;
        if (!force && status === lastStatus) return;
        lastStatus = status;

        if (candidates.length === 1 && advice.route) {
            const intro = advice.gamble
                ? `Jestes w ${candidates[0]}. Sprobuj ${advice.next} - bywa otwarte schronienie. Inaczej do ${advice.shelter} (${advice.route.length}): `
                : `Jestes w ${candidates[0]}. Do schronienia ${advice.shelter} (${advice.route.length}): `;
            say(plain(intro), colorString(advice.route.join(', '), HINT));
            return;
        }
        say(plain(`Mozliwe lokacje: ${candidates.length}. Sprobuj: `), colorString(advice.next ?? '?', HINT));
    };

    const start = (byHand = false) => {
        if (!active) pausedBefore = client.Map.paused;
        manual = byHand;
        active = true;
        pending = [];
        lastStatus = '';
        locator.reset();
        // Bez GMCP mapa i tak by sie rozjechala, a do tego przerabia kierunki
        // na wyjscia lokacji, w ktorej stoi - w mgle wyslalaby nie ten krok.
        client.Map.setPaused(true);
        say(plain(`Mgla! Szukam, gdzie jestesmy - wyjscia zdradza kazdy krok. Tryb: ${MODE_LABEL[mode()]}.`));
        report(true);
    };

    const stop = (message?: string) => {
        if (!active) return;
        active = false;
        pending = [];
        client.Map.setPaused(pausedBefore);
        highlighter?.clear();
        if (ownsBind()) client.FunctionalBind.clear();
        if (message) say(plain(message));
    };

    /** Odpowiedz gry na najstarszy czekajacy krok (albo na konkretny kierunek). */
    const take = (dir?: string): string | undefined => {
        const now = Date.now();
        pending = pending.filter(entry => now - entry.at < PENDING_TTL_MS);
        const index = dir ? pending.findIndex(entry => entry.dir === dir) : 0;
        if (index < 0 || index >= pending.length) return undefined;
        // Starsze kroki dostaly juz jakas inna odpowiedz - nie czekamy na nie.
        const [entry] = pending.splice(0, index + 1).slice(-1);
        return entry.dir;
    };

    const apply = (dir: string | undefined, outcome: FogOutcome) => {
        if (!dir) {
            if (outcome === 'moved') locator.observeUnknownMove();
        } else if (!locator.observe(dir, outcome)) {
            say(plain('Nic nie pasuje - zaczynam szukac od nowa.'));
        }
        report();
    };

    client.on('command', (command = '') => {
        if (!active) return;
        const trimmed = String(command).trim().toLowerCase();
        if (LOOK.test(trimmed)) {
            pending.push({dir: 'look', at: Date.now()});
        } else if (trimmed === WINDOW.command) {
            pending.push({dir: WINDOW.command, at: Date.now()});
        } else if (isDirection(trimmed)) {
            client.Map.setPaused(true);
            pending.push({dir: getShortDir(trimmed), at: Date.now()});
        }
    });

    client.Triggers.registerTrigger(FOG_START, (line) => {
        start();
        return line;
    }, TAG);

    client.Triggers.registerTrigger(NO_EXIT, (line, matches) => {
        if (!active) return line;
        const word = matches[1]?.toLowerCase() ?? '';
        if (!polishToEnglish[word]) return line;
        const dir = getShortDir(getLongDir(word));
        apply(take(dir), 'noExit');
        return line;
    }, TAG);

    client.Triggers.registerTrigger(GRABBED, (line) => {
        if (!active) return line;
        const dir = take();
        if (dir && dir !== 'look') apply(dir, 'grabbed');
        return line;
    }, TAG);

    client.Triggers.registerTrigger(
        matchWhen((type, line) => active && (type === 'room.short' || FOG_TITLE.test(line.text ?? ''))),
        (line) => {
            const dir = take();
            if (dir === 'look') return line;
            // Nazwa spoza mgly po kroku, ktory mogl prowadzic do schronienia -
            // dotarlismy. Sama nazwa spoza mgly to za malo: pierwszy krok po
            // zgubieniu tez potrafi pokazac prawdziwa.
            if (dir && !FOG_TITLE.test(line.text ?? '') && locator.mayReachShelter(dir)) {
                say(colorString('Schronienie!', GOOD));
                stop();
                return line;
            }
            if (dir !== WINDOW.command) apply(dir, 'moved');
            return line;
        },
        TAG
    );

    // GMCP wraca tylko poza mgla - wtedy mapa wie lepiej.
    client.on('gmcp.room.info', () => {
        if (!manual) stop();
    });
    client.on('clock.sunrise', () => stop('Swit - mgla opada.'));
    client.on('player.objectNum', () => stop());

    aliases.push({
        pattern: /^\/mgla(?:\s+(\w+))?(?:\s+(\w+))?$/,
        callback: (matches: RegExpMatchArray) => {
            const arg = matches[1]?.toLowerCase();
            if (arg === 'tryb') {
                const chosen = MODE_ARG[matches[2]?.toLowerCase() ?? ''];
                if (chosen) globalStorage.set('parravon_fog_mode', chosen);
                say(plain(`Tryb: ${MODE_LABEL[mode()]}. Zmiana: /mgla tryb srednio | /mgla tryb bezpiecznie`));
                if (chosen && active) report(true);
            } else if (arg === 'start') {
                start(true);
            } else if (arg === 'stop') {
                stop('Wylaczone.');
            } else if (!active) {
                say(plain('Nie jestesmy w mgle. /mgla start wlacza recznie.'));
            } else if (arg === 'stan') {
                report(true);
            } else {
                const next = locator.advise(mode()).next;
                if (next) client.sendCommand(next);
                // Od razu, nie dopiero po odpowiedzi gry - nastepny Enter ma juz co wyslac.
                eventBus.emit('commandInput.fill', ALIAS);
            }
        },
    });
}
