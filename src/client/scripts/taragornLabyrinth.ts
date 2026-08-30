import Client from "../Client";
import {getLongDir} from "@shared/map/directions";
import {gmcp} from "../gmcp";

/**
 * Taragorn - labirynt pod swiatynia.
 *
 * Uklad labiryntu jest staly: 16 lokacji, zawsze te same kierunki przejsc i
 * zawsze te same przejscia zamkniete ciezka krata. Losowe jest tylko to, ktora
 * lokacja dostaje schody ze swiatyni, ktora dostaje portal do komnaty z
 * katafalkiem i jakie opisy trafiaja do ktorych lokacji - opisow nie da sie
 * wiec uzyc do rozpoznania miejsca.
 *
 * Rozpoznajemy lokacje po odcisku: zbiorze wszystkich przejsc (otwartych i
 * zakratowanych) plus zbiorze tych zakratowanych. Osiem lokacji-wezlow (cztery
 * przejscia, dwa za krata) ma odcisk unikalny, wiec wchodzimy i od razu wiemy,
 * gdzie jestesmy. Osiem lacznikow (dwa przejscia, bez krat) dzieli odcisk w
 * pary, ale kazdy lacznik prowadzi wylacznie do wezlow, a laczniki z jednej
 * pary nie maja wspolnego sasiada - pierwszy krok rozstrzyga wiec zawsze.
 */

const TEMPLE_ROOM_ID = 24525;     // Wschodnia sala w swiatyni (schody na dol)
const CATAFALQUE_ROOM_ID = 26298; // Owalna komnata z katafalkiem (za portalem)
const PORTAL_EXIT = 'portal';

type Dir =
    | 'north' | 'south' | 'east' | 'west'
    | 'northeast' | 'northwest' | 'southeast' | 'southwest';

interface Slot {
    id: number;
    /** Wszystkie przejscia lokacji - otwarte i zakratowane. */
    dirs: Dir[];
    /** Te z przejsc, ktore zamyka ciezka krata. */
    grates: Dir[];
}

/**
 * Szkielet labiryntu. Wezly (cztery przejscia) lacza sie krata z innymi wezlami
 * i otwartym przejsciem z lacznikami; laczniki (dwa przejscia) zawsze siedza
 * miedzy dwoma wezlami.
 */
const SLOTS: Slot[] = [
    {id: 25649, dirs: ['east', 'west', 'southwest', 'northwest'], grates: ['southwest', 'northwest']},
    {id: 25650, dirs: ['north', 'west', 'southeast', 'northwest'], grates: ['north', 'west']},
    {id: 25651, dirs: ['north', 'east', 'northeast', 'southwest'], grates: ['north', 'east']},
    {id: 25652, dirs: ['south', 'west', 'northeast', 'southwest'], grates: ['south', 'west']},
    {id: 25653, dirs: ['east', 'south', 'southeast', 'northwest'], grates: ['east', 'south']},
    {id: 25655, dirs: ['north', 'south', 'northeast', 'northwest'], grates: ['northeast', 'northwest']},
    {id: 25658, dirs: ['east', 'west', 'northeast', 'southeast'], grates: ['northeast', 'southeast']},
    {id: 26296, dirs: ['north', 'south', 'southeast', 'southwest'], grates: ['southeast', 'southwest']},
    {id: 25648, dirs: ['southeast', 'northwest'], grates: []},
    {id: 25657, dirs: ['southeast', 'northwest'], grates: []},
    {id: 25654, dirs: ['northeast', 'southwest'], grates: []},
    {id: 26295, dirs: ['northeast', 'southwest'], grates: []},
    {id: 25656, dirs: ['north', 'south'], grates: []},
    {id: 26297, dirs: ['north', 'south'], grates: []},
    {id: 25659, dirs: ['east', 'west'], grates: []},
    {id: 26299, dirs: ['east', 'west'], grates: []},
];

export const TARAGORN_ROOM_IDS: number[] = SLOTS.map(slot => slot.id);
const POOL = new Set(TARAGORN_ROOM_IDS);

const DIR_ORDER: Dir[] = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const DIR_INDEX = new Map<string, number>(DIR_ORDER.map((dir, index) => [dir, index]));
/** Przesuniecie w ukladzie czytnika mapy, gdzie rosnace y idzie na poludnie. */
const DIR_DELTA: Record<Dir, { x: number; y: number }> = {
    north: {x: 0, y: -1}, south: {x: 0, y: 1},
    east: {x: 1, y: 0}, west: {x: -1, y: 0},
    northeast: {x: 1, y: -1}, northwest: {x: -1, y: -1},
    southeast: {x: 1, y: 1}, southwest: {x: -1, y: 1},
};
/** Lokacje labiryntu stoja na siatce co dwie jednostki. */
const GRID_SPACING = 2;

/** Znak, ktorym mapa oznacza znaleziona w tym resecie sale z portalem. */
const PORTAL_MARK = 'P';

/** Barwa sali nad schodami (24525) - dostaje ja lokacja, do ktorej schody prowadza. */
const ENTRANCE_ENV = 270;
/** Barwa pozostalych lokacji labiryntu, gdy trzeba cofnac oznaczenie wejscia. */
const DEFAULT_ENV = -1;

/**
 * Przejscia w labiryncie nie sa euklidesowe, wiec mapa rysuje je liniami
 * wlasnymi. Portal ma swoja - czerwona kropkowana - i trzeba ja przepiac razem
 * z wyjsciem, inaczej zostaje przy lokacji z poprzedniego resetu. Punkty linii
 * sa w orientacji zrodlowej (y do gory), odwrotnie niz x/y pokoju w czytniku.
 */
const PORTAL_LINE: MapData.LineAttribute = {
    color: {r: 255, g: 0, b: 0, alpha: 255},
    style: 'dot line',
    arrow: false,
};

/** Linia wlasna prowadzaca do srodka lokacji `to`, podanej we wspolrzednych czytnika. */
function lineTo(to: { x: number; y: number }, attributes: MapData.LineAttribute): MapData.Line {
    return {points: [{x: to.x, y: -to.y}], attributes};
}

/** Wiersz z drzwiami i kratami, np. "Ciezka krata zamykajaca przejscie na polnoc i ...". */
const DOOR_LINE = /^(?:Ciezka|Opadajaca|Uniesiona|Podniesiona|Otwarte|Otwarta|Zamkniete|Zamknieta)\b.*\.$/;

/**
 * "Sala z portalem." Nazwa lokacji chodzi za tym, co w niej stoi - tak samo jak
 * "Korytarz z drzwiami" chodzi za schodami - wiec zdradza sale z portalem juz
 * przy pierwszym wejsciu, na dlugo zanim portal da sie otworzyc i pokazac jako
 * wyjscie. Do rozpoznania *ktora* to lokacja nazwa sie nie nadaje (opisy sa co
 * reset przekladane) - to zalatwia odcisk przejsc.
 */
const PORTAL_NAME = /portal/i;

function sortDirs(dirs: Iterable<string>): string[] {
    return [...new Set(dirs)].sort((a, b) => (DIR_INDEX.get(a) ?? 99) - (DIR_INDEX.get(b) ?? 99));
}

function signature(dirs: Iterable<string>, grates: Iterable<string>): string {
    return `${sortDirs(dirs).join(',')}|${sortDirs(grates).join(',')}`;
}

const BY_SIGNATURE = new Map<string, number[]>();
for (const slot of SLOTS) {
    const key = signature(slot.dirs, slot.grates);
    BY_SIGNATURE.set(key, [...(BY_SIGNATURE.get(key) ?? []), slot.id]);
}

/**
 * Lokacje pasujace do odcisku: jedna dla wezla, dwie dla lacznika, zero gdy to
 * nie jest lokacja labiryntu.
 */
export function matchTaragornRooms(dirs: Iterable<string>, grates: Iterable<string>): number[] {
    return BY_SIGNATURE.get(signature(dirs, grates)) ?? [];
}

/**
 * Kierunki zakratowanych przejsc z wiersza opisujacego drzwi. Krata opadajaca
 * ("Opadajaca ciezka krata ponad przejsciem na X") liczy sie tak samo jak
 * zamknieta - kratowane jest samo przejscie, nie jego chwilowy stan.
 */
export function parseGrateDirections(line: string): string[] {
    if (!DOOR_LINE.test(line)) return [];
    const dirs: string[] = [];
    for (const clause of line.replace(/\.$/, '').split(/,\s*| i /)) {
        if (!/krat/i.test(clause)) continue;
        const match = clause.match(/\bna ([a-z-]+)$/);
        if (!match) continue;
        const dir = getLongDir(match[1]);
        if (DIR_INDEX.has(dir)) dirs.push(dir);
    }
    return dirs;
}

/** Czy w wierszu z drzwiami sa drzwi prowadzace na gore - czyli schody do swiatyni. */
export function parseDoorUp(line: string): boolean {
    if (!DOOR_LINE.test(line)) return false;
    return line.replace(/\.$/, '').split(/,\s*| i /)
        .some(clause => /drzwi/i.test(clause) && /\bna (?:gore|gora)$/.test(clause));
}

/**
 * Wyjscia z lustra GMCP, rozbite na kierunki swiata i wyjscia specjalne.
 * Przyjmuje wezel `gmcp.room`, sama informacje o lokacji albo goła liste.
 */
export function readGmcpExits(source: unknown): { dirs: string[]; specials: string[]; up: boolean } {
    const node = source as { info?: { exits?: unknown }; exits?: unknown } | unknown[] | undefined;
    const raw = Array.isArray(node) ? node : (node?.info?.exits ?? node?.exits);
    let list: unknown[] = [];
    if (Array.isArray(raw)) list = raw;
    else if (raw && typeof raw === 'object') list = Object.keys(raw);

    const dirs: string[] = [];
    const specials: string[] = [];
    let up = false;
    for (const exit of list) {
        const long = getLongDir(String(exit));
        if (DIR_INDEX.has(long)) dirs.push(long);
        else if (long === 'up') up = true;
        else if (long !== 'down') specials.push(String(exit));
    }
    return {dirs, specials, up};
}

export default function initTaragornLabyrinth(client: Client) {
    const tag = 'taragorn-labyrinth';

    let watching = false;
    let capturedGrates: string[] = [];
    let capturedDoorUp = false;
    let capturedShort = '';
    /** Lacznik, ktorego nie dalo sie jeszcze rozroznic - czeka na nastepny krok. */
    let pending: { candidates: number[]; up: boolean; portal: boolean } | null = null;
    /** Czy to pierwsze rozpoznanie od wejscia z zewnatrz - wtedy czyscimy stare polaczenia. */
    let fresh = true;
    let applying = false;
    /** Barwy lokacji sprzed oznaczenia wejscia, zeby dalo sie je oddac. */
    const originalEnv = new Map<number, number>();

    const reader = () => client.Map.tryGetMapReader() as any;
    const roomOf = (id: number): MapData.Room | undefined => reader()?.rooms?.[id];

    const stopWatching = () => {
        watching = false;
        capturedGrates = [];
        capturedDoorUp = false;
        capturedShort = '';
        pending = null;
        fresh = true;
    };

    /** Kierunek, w ktorym `to` lezy wzgledem `from`, wedlug wspolrzednych mapy. */
    const directionBetween = (from: { x: number; y: number }, to: { x: number; y: number }): Dir | undefined => {
        const dx = Math.sign(to.x - from.x);
        const dy = Math.sign(to.y - from.y);
        if (dx === 0 && dy === 0) return undefined;
        return DIR_ORDER.find(dir => DIR_DELTA[dir].x === dx && DIR_DELTA[dir].y === dy);
    };

    /** Wolne miejsce na siatce obok `room`, na ktorym mozna postawic komnate z katafalkiem. */
    const freeCellNextTo = (room: MapData.Room): { x: number; y: number } | undefined => {
        const rooms: Record<number, MapData.Room> = reader()?.rooms ?? {};
        const taken = new Set<string>();
        for (const other of Object.values(rooms)) {
            if (other.id === CATAFALQUE_ROOM_ID) continue;
            if (other.area === room.area && other.z === room.z) taken.add(`${other.x}:${other.y}`);
        }
        for (const dir of DIR_ORDER) {
            const x = room.x + DIR_DELTA[dir].x * GRID_SPACING;
            const y = room.y + DIR_DELTA[dir].y * GRID_SPACING;
            if (!taken.has(`${x}:${y}`)) return {x, y};
        }
        return undefined;
    };

    /**
     * Schody ze swiatyni prowadza po kazdym resecie gdzie indziej - przepinamy
     * je z lokacji, ktora nosi je na mapie, na te, w ktorej naprawde jestesmy.
     */
    const wireEntrance = (roomId: number) => {
        const temple = roomOf(TEMPLE_ROOM_ID);
        if (!temple) return;
        const changes: Record<string, unknown>[] = [];

        for (const id of TARAGORN_ROOM_IDS) {
            const room = roomOf(id);
            if (!room) continue;
            const exits = (room.exits ?? {}) as Record<string, number>;
            const lines = (room.customLines ?? {}) as Record<string, MapData.Line>;
            if (id === roomId) {
                if (exits.up !== TEMPLE_ROOM_ID || room.env !== ENTRANCE_ENV || lines.up) {
                    if (!originalEnv.has(id)) originalEnv.set(id, room.env);
                    // Sala nad schodami ma ta sama barwe, a strzalki w gore i w
                    // dol mowia reszte - linia przez pol mapy nic by nie dodala.
                    const withoutLine = {...lines};
                    delete withoutLine.up;
                    changes.push({
                        roomId: id,
                        exits: {...exits, up: TEMPLE_ROOM_ID},
                        env: ENTRANCE_ENV,
                        customLines: withoutLine,
                    });
                }
            } else if (exits.up !== undefined || lines.up || room.env === ENTRANCE_ENV) {
                const without = {...exits};
                delete without.up;
                const withoutLine = {...lines};
                delete withoutLine.up;
                changes.push({
                    roomId: id,
                    exits: without,
                    customLines: withoutLine,
                    env: room.env === ENTRANCE_ENV ? (originalEnv.get(id) ?? DEFAULT_ENV) : room.env,
                });
            }
        }
        const templeExits = (temple.exits ?? {}) as Record<string, number>;
        if (templeExits.down !== roomId) {
            changes.push({roomId: TEMPLE_ROOM_ID, exits: {...templeExits, down: roomId}});
        }
        if (changes.length === 0) return;

        client.Map.applyRoomChanges(changes as any);
    };

    /** Rozpiecie portalu ze wszystkiego, do czego byl podpiety poprzednio. */
    const unwirePortal = (except?: number): Record<string, unknown>[] => {
        const changes: Record<string, unknown>[] = [];
        for (const id of TARAGORN_ROOM_IDS) {
            if (id === except) continue;
            const room = roomOf(id);
            if (!room) continue;
            const lines = (room.customLines ?? {}) as Record<string, MapData.Line>;
            const hasPortal = room.specialExits?.[PORTAL_EXIT] !== undefined;
            if (!hasPortal && !lines[PORTAL_EXIT] && room.roomChar !== PORTAL_MARK) continue;
            const specialExits = {...room.specialExits};
            delete specialExits[PORTAL_EXIT];
            const customLines = {...lines};
            delete customLines[PORTAL_EXIT];
            changes.push({roomId: id, specialExits, customLines, roomChar: '', userData: {dir_bind: null}});
        }
        return changes;
    };

    /**
     * Portal z poprzedniej wizyty stoi juz gdzie indziej, wiec przy wejsciu
     * zdejmujemy go z mapy - lepiej nie miec polaczenia niz miec falszywe.
     */
    const clearPortalWiring = (except?: number) => {
        const catafalque = roomOf(CATAFALQUE_ROOM_ID);
        const changes = unwirePortal(except);
        const linked = catafalque?.specialExits?.[PORTAL_EXIT];
        if (linked !== undefined && linked !== except) {
            changes.push({roomId: CATAFALQUE_ROOM_ID, specialExits: {}, userData: {dir_bind: null}});
        }
        if (changes.length === 0) return;
        client.Map.applyRoomChanges(changes as any);
    };

    /**
     * Portal do komnaty z katafalkiem tez wedruje po labiryncie - przenosimy go
     * razem z sama komnata, zeby mapa i chodzenie po niej sie zgadzaly.
     */
    const wirePortal = (roomId: number) => {
        const room = roomOf(roomId);
        const catafalque = roomOf(CATAFALQUE_ROOM_ID);
        if (!room || !catafalque) return;
        if (room.specialExits?.[PORTAL_EXIT] === CATAFALQUE_ROOM_ID
            && catafalque.specialExits?.[PORTAL_EXIT] === roomId
            && room.customLines?.[PORTAL_EXIT]
            && room.roomChar === PORTAL_MARK) {
            return;
        }
        const changes: Record<string, unknown>[] = unwirePortal(roomId);
        const cell = freeCellNextTo(room) ?? {x: catafalque.x, y: catafalque.y};
        const outward = directionBetween(room, cell);
        const inward = directionBetween(cell, room);

        changes.push({
            roomId,
            roomChar: PORTAL_MARK,
            specialExits: {...room.specialExits, [PORTAL_EXIT]: CATAFALQUE_ROOM_ID},
            customLines: {...room.customLines, [PORTAL_EXIT]: lineTo(cell, PORTAL_LINE)},
            userData: {dir_bind: outward ? `${outward}=${PORTAL_EXIT}` : null},
        });
        changes.push({
            roomId: CATAFALQUE_ROOM_ID,
            x: cell.x,
            y: cell.y,
            specialExits: {[PORTAL_EXIT]: roomId},
            userData: {dir_bind: inward ? `${inward}=${PORTAL_EXIT}` : null},
        });

        client.Map.applyRoomChanges(changes as any);
    };

    const moveTo = (roomId: number) => {
        if (client.Map.currentRoom?.id === roomId) return;
        applying = true;
        try {
            client.Map.setMapRoomById(roomId);
        } finally {
            applying = false;
        }
    };

    const settle = (roomId: number, found: { up: boolean; portal: boolean }) => {
        // Lacznik sprzed kroku rozstrzyga sie teraz: tylko jeden z dwoch
        // kandydatow sasiaduje z lokacja, w ktorej wlasnie stoimy.
        const previous = pending;
        const cameFrom = previous?.candidates.find(id => {
            const room = roomOf(id);
            return room ? Object.values(room.exits ?? {}).includes(roomId) : false;
        });
        pending = null;

        // Pierwsze rozpoznanie po wejsciu z zewnatrz: labirynt zostal przelozony
        // od nowa, wiec zapamietane polaczenie portalu na pewno juz nie pasuje.
        if (fresh) {
            fresh = false;
            const portalHere = found.portal ? roomId : previous?.portal ? cameFrom : undefined;
            clearPortalWiring(portalHere);
        }

        moveTo(roomId);

        // Schody i portal, ktore widzielismy w nierozpoznanym jeszcze laczniku,
        // nalezaly do niego, a nie do lokacji, w ktorej stoimy teraz.
        if (cameFrom !== undefined && previous?.up) wireEntrance(cameFrom);
        if (cameFrom !== undefined && previous?.portal) wirePortal(cameFrom);
        if (found.up) wireEntrance(roomId);
        if (found.portal) wirePortal(roomId);
    };

    const evaluate = () => {
        const exits = readGmcpExits((gmcp as Record<string, unknown>)?.room);
        const grates = capturedGrates;
        const found = {
            up: exits.up || capturedDoorUp,
            // Nazwa wystarczy: sala z portalem nosi go w nazwie od poczatku, a
            // jako wyjscie portal pokazuje sie dopiero po otwarciu.
            portal: exits.specials.includes(PORTAL_EXIT) || PORTAL_NAME.test(capturedShort),
        };
        capturedGrates = [];
        capturedDoorUp = false;
        capturedShort = '';
        if (!reader()) return;

        // Komnata z katafalkiem nie ma zwyklych wyjsc - zdradza ja sam portal.
        if (exits.dirs.length === 0 && grates.length === 0) {
            if (exits.specials.includes(PORTAL_EXIT)) {
                const from = client.Map.currentRoom?.id;
                pending = null;
                moveTo(CATAFALQUE_ROOM_ID);
                if (from !== undefined && POOL.has(from)) wirePortal(from);
            }
            return;
        }

        const candidates = matchTaragornRooms([...exits.dirs, ...grates], grates);
        if (candidates.length === 1) {
            settle(candidates[0], found);
            return;
        }
        if (candidates.length === 0) {
            pending = null;
            return;
        }

        // Lacznik: dwie mozliwosci, ale ich sasiedzi sa rozlaczni, wiec kolejna
        // lokacja rozstrzygnie, ktora to byla. Po wejsciu z zewnatrz nie wolno
        // uwierzyc mapie tylko dlatego, ze stoi na jednym z kandydatow - trafila
        // tam po schodach z poprzedniego resetu, wiec rownie dobrze moze to byc
        // ten drugi.
        // Mapa juz stoi na jednym z kandydatow i nie ma powodu jej nie wierzyc -
        // pozycja jest zalatwiona, ale schody i portal wciaz trzeba przepiac,
        // bo lacznik moze byc wlasnie ta sala z portalem.
        const current = client.Map.currentRoom?.id;
        if (!fresh && current !== undefined && candidates.includes(current)) {
            settle(current, found);
            return;
        }
        pending = {candidates, ...found};
    };

    // Kraty czytamy z opisu drzwi, bo GMCP ich nie podaje - `room.info` wymienia
    // wylacznie przejscia otwarte. Ten wiersz przychodzi razem z opisem lokacji,
    // w tej samej paczce co zdanie o wyjsciach, wiec lezy tu na nia gotowy.
    client.Triggers.registerTrigger(DOOR_LINE, (line) => {
        const text = line.text ?? String(line);
        capturedGrates.push(...parseGrateDirections(text));
        capturedDoorUp ||= parseDoorUp(text);
        return line;
    }, tag);

    // Wejscie do labiryntu: mapa prowadzi nas w to miejsce, w ktore prowadzila
    // po ostatnim mapowaniu - czyli prawie na pewno w zle. Od tej chwili
    // patrzymy na kazdy opis lokacji.
    client.on('enterLocation', (detail) => {
        if (applying) return;
        const id = (detail as { id: number })?.id;
        if (POOL.has(id) || id === CATAFALQUE_ROOM_ID) {
            watching = true;
        } else if (watching) {
            stopWatching();
        }
    });

    // Nazwa lokacji poprzedza zdanie o wyjsciach, wiec czeka gotowa na ocene.
    client.on('gmcp_msg.room.short', (line) => {
        capturedShort = (line as { text?: string })?.text ?? '';
    });

    // Zdanie o wyjsciach konczy opis lokacji i przychodzi dokladnie raz na opis,
    // takze przy zerknieciu - to jest moment na rozpoznanie. Wystarczy, ze mapa
    // stoi w labiryncie: po wznowieniu sesji w srodku pozycje odtwarza sie po
    // cichu, bez enterLocation, wiec to jedyny sygnal, od ktorego da sie zaczac.
    client.on('gmcp_msg.room.exits', () => {
        const current = client.Map.currentRoom?.id;
        if (watching || (current !== undefined && POOL.has(current))) {
            watching = true;
            evaluate();
            return;
        }
        capturedGrates = [];
        capturedDoorUp = false;
        capturedShort = '';
    });
}
