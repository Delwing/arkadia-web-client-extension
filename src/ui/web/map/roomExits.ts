import { useSyncExternalStore } from "react";
import eventBus from "@modules/core/eventBus";
import { gmcp } from "@client/gmcp";
import { getShortDir, longToShort } from "@shared/map/directions";

const SHORT_DIRS = new Set(Object.values(longToShort));

/** Standard directions in the order a list reads them: round the rose, then up and down. */
export const DIRECTION_ORDER = ["n", "ne", "e", "se", "s", "sw", "w", "nw", "u", "d"];

/**
 * The current room's exits, from both sources: what the game shows (GMCP
 * Room.Info) and what the map knows on top of it.
 */
export interface RoomExits {
    /** Standard directions the game shows, short ("n", "u"). */
    standard: Set<string>;
    /** The game's non-compass exits ("wyjscie", "brama"). */
    special: string[];
    /** Every special exit the map records for the room ("wejdz na gore", "zanurkuj"). */
    mapSpecial: string[];
    /** The map's special exits the game does not show: the hidden ones worth listing. */
    custom: string[];
}

/** Room.Info's exits split into compass directions and the rest. */
export function splitGameExits(info: { exits?: unknown } | undefined): Pick<RoomExits, "standard" | "special"> {
    const list = Array.isArray(info?.exits) ? (info.exits as unknown[]).filter((e): e is string => typeof e === "string") : [];
    const standard = new Set<string>();
    const special: string[] = [];
    for (const exit of list) {
        const short = getShortDir(exit);
        if (SHORT_DIRS.has(short)) standard.add(short);
        else special.push(exit);
    }
    return { standard, special };
}

/**
 * The commands of a map room's special exits. A handful of rooms record
 * something that is not a command (a Mudlet `script:` body, a bare room
 * number); those are no use to click and are left out.
 */
export function mapSpecialExits(room: { specialExits?: Record<string, number> } | null | undefined): string[] {
    const keys = Object.keys(room?.specialExits ?? {});
    return keys
        .map((key) => key.trim())
        .filter((key) => key && !/^script:/i.test(key) && !/^\d+$/.test(key));
}

const norm = (exit: string) => exit.trim().toLowerCase();

/** Put both sources together; a map exit the game already shows is not repeated as custom. */
export function combineExits(info: { exits?: unknown } | undefined, room: { specialExits?: Record<string, number> } | null | undefined): RoomExits {
    const { standard, special } = splitGameExits(info);
    const mapSpecial = mapSpecialExits(room);
    const shown = new Set(special.map(norm));
    for (const dir of standard) shown.add(dir);
    const custom = mapSpecial.filter((exit) => {
        const key = norm(exit);
        return !shown.has(key) && !SHORT_DIRS.has(getShortDir(key));
    });
    return { standard, special, mapSpecial, custom };
}

let gameInfo: { exits?: unknown } | undefined = gmcp?.room?.info;
let mapRoom: { specialExits?: Record<string, number> } | null = null;
let snapshot: RoomExits = combineExits(gameInfo, mapRoom);
const listeners = new Set<() => void>();

function update(): void {
    snapshot = combineExits(gameInfo, mapRoom);
    listeners.forEach((listener) => listener());
}

// Watched from the first import (the footer and the widgets load with the
// page, before the game says anything), so a view mounted later starts current.
eventBus.on("gmcp.room.info", (info: { exits?: unknown } | undefined) => {
    gameInfo = info;
    update();
});
eventBus.on("enterLocation", ({ room }) => {
    mapRoom = (room as { specialExits?: Record<string, number> } | null) ?? null;
    update();
});

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getRoomExits(): RoomExits {
    return snapshot;
}

/** The current room's exits, kept up to date. */
export function useRoomExits(): RoomExits {
    return useSyncExternalStore(subscribe, getRoomExits);
}

/** Walk an exit: a direction or a special exit's command. */
export function walkExit(command: string): void {
    eventBus.emit("sendCommand", { command });
}
