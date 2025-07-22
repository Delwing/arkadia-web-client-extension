import Client from "../Client";
import { longToShort } from "../MapHelper";
import { getShortcut } from "./shortcuts";

export default function initIdz(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    if (!aliases) return;

    let path: number[] = [];
    let index = 0;
    let delay = 1;
    let lastDelay = 1;
    let timer: number | null = null;
    let paused = false;
    let target: number | null = null;

    const clearTimer = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const scheduleStep = () => {
        if (paused || index >= path.length - 1) {
            clearTimer();
            if (index >= path.length - 1) {
                path = [];
                target = null;
            }
            return;
        }

        const current = client.Map.mapReader.getRoomById(path[index]);
        const nextId = path[index + 1];
        const exits = Object.assign({}, current.exits ?? {}, current.specialExits ?? {});
        const dir = Object.keys(exits).find(d => exits[d] === nextId);
        if (!dir) {
            clearTimer();
            path = [];
            return;
        }

        const time = (delay + (Math.random() * 0.6 - 0.3)) * 1000;
        timer = window.setTimeout(() => {
            timer = null;
            if (paused) return;
            client.sendCommand(longToShort[dir] ?? dir);
            index += 1;
            scheduleStep();
        }, time);
    };

    const startWalk = (targetId: number, d?: number) => {
        const room: any = client.Map.currentRoom;
        if (!room) return;
        const p = client.Map.mapReader.getPath(room.id, targetId);
        if (!p || p.length < 2) return;
        path = p.map(n => parseInt(n));
        index = 0;
        if (d !== undefined) {
            delay = Math.max(0.5, d);
            lastDelay = delay;
        } else {
            delay = Math.max(0.5, lastDelay);
        }
        paused = false;
        target = targetId;
        clearTimer();
        scheduleStep();
    };

    const stopWalk = () => {
        paused = true;
        clearTimer();
    };

    const resumeWalk = () => {
        if (target === null) return;
        startWalk(target);
    };

    client.addEventListener('stepBack', stopWalk);

    aliases.push({
        pattern: /\/idz$/,
        callback: () => {
            const room: any = client.Map.currentRoom;
            if (!room) return;
            const allExits = Object.assign({}, room.exits ?? {}, room.specialExits ?? {});
            const exitDirs = Object.keys(allExits);
            if (exitDirs.length === 0) return;

            if (exitDirs.length === 2 && client.Map.locationHistory.length >= 2) {
                const prevId = client.Map.locationHistory[client.Map.locationHistory.length - 2];
                const cameFrom = exitDirs.find(d => allExits[d] === prevId);
                const alt = exitDirs.find(d => d !== cameFrom);
                if (alt) {
                    client.sendCommand(longToShort[alt] ?? alt);
                }
            }
        }
    });

    aliases.push({
        pattern: /^\/idz (\S+)(?:\s+([0-9]+(?:\.[0-9]+)?))?$/,
        callback: (m: RegExpMatchArray) => {
            const key = m[1];
            const targetId = getShortcut(key) ?? parseInt(key, 10);
            if (isNaN(targetId)) return;
            const d = m[2] ? parseFloat(m[2]) : undefined;
            startWalk(targetId, d);
        }
    });

    aliases.push({
        pattern: /^\/stop$/,
        callback: stopWalk
    });

    aliases.push({
        pattern: /^\/dalej$/,
        callback: resumeWalk
    });

    aliases.push({
        pattern: /^\/szybciej$/,
        callback: () => {
            lastDelay = Math.max(0.5, lastDelay - 1);
            delay = Math.max(0.5, delay - 1);
        }
    });

    aliases.push({
        pattern: /^\/wolniej$/,
        callback: () => {
            lastDelay += 1;
            delay += 1;
        }
    });
}

