import Triggers from '@client/Triggers';
import {AnsiAwareBuffer} from '@client/ansi/FormatState';

/**
 * Drives the real Raon labyrinth mapper with a fake client.
 */

const SHORT_TO_POLISH: Record<string, string> = {
    n: 'polnoc', s: 'poludnie', e: 'wschod', w: 'zachod',
    ne: 'polnocny-wschod', nw: 'polnocny-zachod', se: 'poludniowy-wschod', sw: 'poludniowy-zachod',
    u: 'gora', d: 'dol',
};

function exitLine(exits: string[]): string {
    const names = exits.map(e => SHORT_TO_POLISH[e] ?? e);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} i ${names[names.length - 1]}` : names[0];
    return `Sa tutaj ${names.length} widoczne wyjscia: ${list}.`;
}

export interface RaonHarness {
    client: any;
    rooms: Record<number, any>;
    output: string[];
    /** A command typed by the user (goes through command hooks only). */
    command(text: string): void;
    line(text: string, type?: string): void;
    /** A full room arrival: description + exits (short codes, e.g. ['n', 'se']). */
    room(description: string, exits: string[], extraLines?: string[]): void;
    enterEntry(): void;
    statusLines(): string[];
}

export async function createRaonHarness(): Promise<RaonHarness> {
    const mod = await import('@client/scripts/raonLabyrinthMapper');
    const {ENTRY_ROOM_ID, ALL_ROOM_IDS} = mod;

    const rooms: Record<number, any> = {};
    const area = {
        area: {rooms: [] as any[]},
        planes: [], exits: new Map(),
        createPlanes: () => [], createExits: () => {}, markDirty: () => {},
    };
    ALL_ROOM_IDS.forEach((id: number, i: number) => {
        rooms[id] = {
            id, area: 1, x: id === ENTRY_ROOM_ID ? 0 : 100 + i, y: 0, z: 0, hash: `h${id}`,
            exits: {}, specialExits: {}, stubs: [], customLines: {}, userData: {}, env: 1, roomChar: '',
        };
        area.area.rooms.push(rooms[id]);
    });
    const reader = {rooms, areas: {1: area}};

    const hooks: Function[] = [];
    const listeners: Record<string, Function[]> = {};
    const output: string[] = [];

    const client: any = {
        Map: {
            currentRoom: undefined as any,
            hashes: {} as Record<string, number>,
            refreshPosition: false,
            getMapReader: () => reader,
            tryGetMapReader: () => reader,
            renderRoomById: (id: number) => { client.Map.currentRoom = rooms[id]; },
        },
        FunctionalBind: {set: () => {}},
        println: (buf: any) => output.push(typeof buf === 'string' ? buf : buf.text),
        sendGMCP: () => {},
        registerCommandHook: (_id: string, cb: Function) => hooks.push(cb),
        on: (event: string, cb: Function) => { (listeners[event] ??= []).push(cb); return () => {}; },
    };
    client.Triggers = new Triggers(client);

    mod.default(client, []);

    const line = (text: string, type = '') => {
        Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(text), type);
    };

    return {
        client, rooms, output,
        command: (text) => hooks.forEach(h => h(text, true)),
        line,
        room: (description, exits, extraLines = []) => {
            extraLines.forEach(l => line(l));
            line(description, 'room.long');
            line(exitLine(exits), 'room.exits');
        },
        enterEntry: () => {
            client.Map.currentRoom = rooms[ENTRY_ROOM_ID];
            listeners['enterLocation']?.forEach(cb => cb({id: ENTRY_ROOM_ID}));
        },
        statusLines: () => output.filter(l => l.startsWith('[Raon] Pokoj')),
    };
}
