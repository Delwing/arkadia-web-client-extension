import Client from "../Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import eventBus from "@modules/core/eventBus.ts";
import {getLongDir} from "@shared/map/directions";
import {isDrivableExit} from "@shared/map/exitCommands";
import type {FormatStateSnapshot} from "@client/ansi/FormatState.ts";
import {
    blockRoom,
    clearBlockedRooms,
    getBlockedRooms,
    isBlocked,
    setBlockedRooms,
    unblockRoom,
} from "@modules/data/carriageBlocks";

const GRAY: FormatStateSnapshot = {foreground: {space: 'hex', color: '#888888'}};
const WHITE: FormatStateSnapshot = {foreground: {space: 'hex', color: '#dddddd'}};
const YELLOW: FormatStateSnapshot = {foreground: {space: 'hex', color: '#ffff00'}};
const RESET: FormatStateSnapshot = {};

const idRange = (from: number, to: number) => Array.from({length: to - from + 1}, (_, index) => from + index);

/**
 * Rooms a refusal must never be taken as proof about.
 *
 * These do refuse a ride, but not because a wagon cannot be there - so learning from it would bar
 * a room that is in fact perfectly drivable and quietly route every later journey around it.
 * /wozblok still marks them by hand, since a deliberate mark is a statement, not a guess.
 */
const NEVER_LEARNED = new Set([
    1419, 1137,
    // 5217-5253, a run with no gaps in it - the whole stretch refuses for its own reasons.
    ...idRange(5217, 5253),
]);

/**
 * Rooms a carriage cannot enter, marked by hand.
 *
 * Nobody has this data yet - the Mudlet package that first had the idea shipped none, which is why
 * it went unused - so this exists to gather it. The list is deliberately easy to read back out, so
 * a collected set can be shared or promoted into shipped data later.
 */
export default function initCarriageBlocks(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const list = aliases ?? client.aliases;

    const currentRoomId = (): number | null => client.Map?.currentRoom?.id ?? null;

    const roomLabel = (id: number): string => {
        const room = client.Map?.tryGetMapReader()?.getRoom(id) as { name?: string; area?: number } | undefined;
        const name = room?.name && room.name !== String(id) ? room.name : '';
        const areaName = room?.area !== undefined ? (client.Map?.getAreaName(String(room.area)) ?? '') : '';
        if (name && areaName) return `${name}, ${areaName} (${id})`;
        if (name) return `${name} (${id})`;
        return String(id);
    };

    const resolveTarget = (argument?: string): number | null => {
        if (argument) {
            const parsed = Number(argument);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return currentRoomId();
    };

    list.push({
        pattern: /^\/wozblok(?:\s+(\S+))?$/,
        callback: (matches: RegExpMatchArray) => {
            const roomId = resolveTarget(matches[1]);
            if (roomId === null) {
                client.println('Nie wiadomo, ktora lokacje zablokowac.');
                return;
            }
            // One key toggles, so marking a run of rooms while driving needs no thought about which
            // command to use.
            if (isBlocked(roomId)) {
                unblockRoom(roomId);
                client.println(`Woz znowu przejedzie przez ${roomLabel(roomId)}.`);
            } else {
                blockRoom(roomId);
                client.println(`Woz nie przejedzie przez ${roomLabel(roomId)}.`);
            }
        },
    });

    list.push({
        pattern: /^\/wozbloki$/,
        callback: () => {
            const rooms = [...getBlockedRooms()].sort((a, b) => a - b);
            const output = new AnsiAwareBuffer();
            if (rooms.length === 0) {
                output.append('Brak zablokowanych lokacji. Uzyj /wozblok stojac w takiej lokacji.', RESET);
                client.println(output);
                return;
            }

            output.append(`--- Lokacje nieprzejezdne dla wozu (${rooms.length}) ---\n`, RESET);
            for (const roomId of rooms) {
                const line = new AnsiAwareBuffer();
                const text = roomLabel(roomId);
                const start = line.length;
                line.append(text, WHITE);
                line.createLink([start, start + text.length], {
                    onClick: () => client.sendEvent('leadTo', roomId),
                    title: `Kliknij aby prowadzic do: ${text}`,
                });
                line.append('\n', RESET);
                output.appendBuffer(line);
            }
            output.append('\nDo skopiowania: ', GRAY);
            output.append(`/wozbloki+ ${rooms.join(',')}\n`, WHITE);
            client.println(output);
        },
    });

    list.push({
        pattern: /^\/wozbloki\+\s+(.+)$/,
        callback: (matches: RegExpMatchArray) => {
            const rooms = matches[1]
                .split(/[\s,]+/)
                .map(Number)
                .filter(id => Number.isFinite(id) && id > 0);
            if (rooms.length === 0) {
                client.println('Nie rozpoznano zadnych numerow lokacji.');
                return;
            }
            setBlockedRooms(rooms);
            client.println(`Wczytano ${rooms.length} nieprzejezdnych lokacji.`);
        },
    });

    list.push({
        pattern: /^\/wozbloki-$/,
        callback: () => {
            clearBlockedRooms();
            client.println('Wyczyszczono liste nieprzejezdnych lokacji.');
        },
    });

    /**
     * The room a given exit of the current room leads to, or null when the map does not know it.
     * The refusal names either a compass direction or a special exit verbatim, so both are tried.
     */
    const exitTarget = (exit: string): number | null => {
        const room = client.Map?.currentRoom as
            { exits?: Record<string, number>; specialExits?: Record<string, number> } | undefined;
        if (!room) return null;
        return room.exits?.[getLongDir(exit)] ?? room.specialExits?.[exit] ?? null;
    };

    /** Record a blockade and say so, with the undo right there in the line. */
    const learnBlock = (roomId: number) => {
        if (NEVER_LEARNED.has(roomId)) return false;
        if (isBlocked(roomId) || !blockRoom(roomId)) return false;
        const note = new AnsiAwareBuffer();
        note.append('Zapamietane: woz nie przejedzie przez ', YELLOW);
        note.append(roomLabel(roomId), WHITE);
        note.append('. ', GRAY);
        // A refusal can be a shut gate rather than a wagon that will never fit, so the undo has to
        // be right there in the line - by the time you have read it you already know which it was.
        const undo = '[ cofnij ]';
        const start = note.length;
        note.append(undo, GRAY);
        note.createLink([start, start + undo.length], {
            onClick: () => {
                if (unblockRoom(roomId)) {
                    client.println(`Woz znowu przejedzie przez ${roomLabel(roomId)}.`);
                }
            },
            title: `Cofnij: ${roomLabel(roomId)}`,
        });
        client.println(note);
        return true;
    };

    /**
     * Learn a blockade from the game refusing to drive somewhere.
     *
     * "Nie mozna jechac na zachod." / "Nie mozna jechac na latarnia." names the way that was
     * refused, and the room barred to the wagon is what lies that way - not the one we are standing
     * in. The refusal is a reply to our own "jedz na ..." so it always refers to the current room.
     */
    client.Triggers.registerTrigger(/^[ >]*Nie mozna jechac na (.+)\.$/, (line, matches) => {
        const roomId = exitTarget(matches[1]);
        if (roomId !== null) learnBlock(roomId);
        return line;
    }, 'carriageBlocks');

    /**
     * Whether the room we now stand in was described together with its exits message.
     *
     * The dead-end notice is only trusted when the game itself just listed the ways out - a
     * room.short or room.long message followed by room.exits. When the description came without
     * one, the game said nothing about the exits, so the map's picture of them is not confirmed
     * and nothing may be learned from the notice.
     *
     * Tracked off the parsed lines' own types rather than the gmcp_msg events: those are deferred
     * until the whole flush is processed, and the dead-end line arrives in the same flush as the
     * description of the room it stops in - by trigger time the events would still describe the
     * previous room.
     */
    let exitsAnnounced = false;
    const roomMessage = (): RegExpMatchArray => {
        const matches = [] as unknown as RegExpMatchArray;
        matches.index = 0;
        return matches;
    };
    client.Triggers.registerTrigger(
        (_line, _matches, type) =>
            type === 'room.short' || type === 'room.long' || type === 'room.exits'
                ? roomMessage()
                : undefined,
        (line, _matches, type) => {
            exitsAnnounced = type === 'room.exits';
            return line;
        },
        'carriageBlocks'
    );

    /**
     * Where we were before this room, so a dead end knows which way it may still go back.
     *
     * Tracked from the event's own room ids rather than by reading the map when it fires: the map
     * has already moved us by then, so it would only ever report where we now are.
     */
    let previousRoomId: number | null = null;
    let lastRoomId: number | null = null;
    client.on('enterLocation', payload => {
        const id = (payload as { id?: number })?.id;
        if (typeof id !== 'number' || id === lastRoomId) return;
        previousRoomId = lastRoomId;
        lastRoomId = id;
    });

    /**
     * A dead end bars every way on, so mark them all in one go.
     *
     * "Nie ma tu zadnej drogi, ktora mozna by dalej jechac." is the game saying no road continues
     * from here - unlike a junction, which announces itself as one. So every neighbour except the
     * one we drove in from is unreachable by wagon along that exit.
     *
     * Exits that are already barred by their shape ("wejdz na gore" and friends) are skipped on
     * purpose: they are handled without any data, and the room behind one may well be perfectly
     * drivable from its other side, which a room-level mark would wrongly deny.
     */
    client.Triggers.registerTrigger(/^Nie ma tu zadnej drogi, ktora mozna by dalej jechac\.$/, line => {
        if (!client.carriageMode || previousRoomId === null || !exitsAnnounced) return line;
        const room = client.Map?.currentRoom as
            { exits?: Record<string, number>; specialExits?: Record<string, number> } | undefined;
        if (!room) return line;

        const ways = {...(room.exits ?? {}), ...(room.specialExits ?? {})};
        // Only trust this when the way back is among them, so we know where we came from.
        if (!Object.values(ways).includes(previousRoomId)) return line;

        for (const [exit, target] of Object.entries(ways)) {
            if (target === previousRoomId || !isDrivableExit(exit)) continue;
            learnBlock(target);
        }
        return line;
    }, 'carriageBlocks');

    // Marked rooms are shown on the map whether or not a carriage is being driven: you often learn
    // a room is barred while standing in it on foot, having left the wagon behind.
    const publishMarks = () => client.sendEvent('mapCarriageBlocks', [...getBlockedRooms()]);
    eventBus.on('carriageBlocks.changed', publishMarks);
    client.on('requestMapCarriageBlocks', publishMarks);
    publishMarks();

    // Printed when leading somewhere the wagon cannot reach, so the route on the map is explained.
    client.on('carriageRoute', payload => {
        if (!payload) return;
        const output = new AnsiAwareBuffer();
        output.append('Wozem dojedziesz do ', YELLOW);
        output.append(roomLabel(payload.transfer), WHITE);
        if (payload.driveRooms > 0) {
            output.append(` (${payload.driveRooms} lok.)`, GRAY);
        } else {
            output.append(' — czyli nigdzie, woz sie tu nie przyda', GRAY);
        }
        if (payload.boarding) {
            output.append('\nDalej statkiem: ', YELLOW);
            output.append(payload.boarding, WHITE);
            output.append(` i ${payload.walkRooms} lok. pieszo`, GRAY);
        } else {
            output.append('\nDalej pieszo: ', YELLOW);
            output.append(`${payload.walkRooms} lok.`, WHITE);
        }
        client.println(output);
    });
}
