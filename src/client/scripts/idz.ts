import Client from "../Client";
import { longToShort } from "@shared/map/directions";
import { getShortcut } from "./shortcuts";
import type { WalkerState } from "@shared/events/clientEvents";
import { characterStorage } from "@modules/core/storage";


export default function initIdz(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    if (!aliases) return;

    let path: number[] = [];
    let index = 0;
    let delay = 1;
    let lastDelay = 1;
    let settings: Record<string, unknown> = {};
    let timer: number | null = null;
    let paused = false;
    let target: number | null = null;
    let pausedByPauser = false;

    const isWalking = () => !paused && path.length > 0;

    const getState = (): WalkerState => ({
        active: path.length > 0,
        paused,
        path: [...path],
        currentIndex: index,
        target,
        delay,
    });

    const emitUpdate = () => {
        client.sendEvent('walker.update', getState());
    };

    const applySettings = (payload: any) => {
        const detail = (payload ?? {}) as { autoWalkDelay?: unknown } & Record<string, unknown>;
        settings = detail;
        const value = detail.autoWalkDelay !== undefined ? parseFloat(String(detail.autoWalkDelay)) : NaN;
        if (!isNaN(value)) {
            lastDelay = value;
        }
    };
    applySettings(characterStorage.get('settings'));
    client.scope.onDispose(characterStorage.onChange('settings', applySettings));

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
                const reached = target;
                target = null;
                client.sendEvent('clearLeadTo');
                emitUpdate();
                if (reached !== null) {
                    client.sendEvent('notify', { text: `[WALK] reached ${reached}` });
                }
            }
            return;
        }

        const current = client.Map.getRoomById(path[index]);
        if (!current) {
            clearTimer();
            path = [];
            client.sendEvent('clearLeadTo');
            emitUpdate();
            return;
        }
        const nextId = path[index + 1];
        const exits = Object.assign({}, current.exits ?? {}, current.specialExits ?? {});
        const dir = Object.keys(exits).find(d => exits[d] === nextId);
        if (!dir) {
            clearTimer();
            path = [];
            client.sendEvent('clearLeadTo');
            emitUpdate();
            return;
        }

        const time = (delay + (Math.random() * 0.6 - 0.3)) * 1000;
        timer = window.setTimeout(() => {
            timer = null;
            if (paused) return;
            client.suppressMapMoveEvent = true;
            client.sendCommand(longToShort[dir] ?? dir);
            index += 1;
            emitUpdate();
            scheduleStep();
        }, time);
    };

    const startWalk = (targetId: number, d?: number, info: string = 'start') => {
        const room: any = client.Map.currentRoom;
        if (!room) return;
        const p = client.Map.findPath(room.id, targetId);
        if (!p || p.length < 2) return;
        path = p.map(n => parseInt(n as any, 10)).filter(n => !isNaN(n));
        if (path.length < 2) {
            path = [];
            return;
        }
        index = 0;
        if (d !== undefined) {
            delay = Math.max(0.5, d);
            lastDelay = delay;
            settings.autoWalkDelay = lastDelay;
            characterStorage.set('settings', settings as any);
        } else {
            delay = Math.max(0.5, lastDelay);
        }
        paused = false;
        target = targetId;
        client.sendEvent('leadTo', targetId);
        clearTimer();
        client.sendEvent('notify', { text: `[WALK] ${info} → ${targetId} (${delay.toFixed(2)}s)` });
        emitUpdate();
        scheduleStep();
    };

    const stopWalk = () => {
        const wasWalking = isWalking();
        paused = true;
        clearTimer();
        if (wasWalking) {
            client.sendEvent('clearLeadTo');
            client.sendEvent('notify', { text: `[WALK] stopped` });
        }
        emitUpdate();
    };

    const resumeWalk = (d?: number) => {
        if (target === null) {
            const current: any = client.Map.currentRoom;
            const dest = client.Map.destinations?.[0];
            if (!current || dest === undefined) return;
            const p = client.Map.findPath(current.id, dest);
            if (!p || p.length < 2) return;
            path = p.map((n) => parseInt(n as any, 10)).filter(n => !isNaN(n));
            if (path.length < 2) {
                path = [];
                return;
            }
            index = 0;
            target = dest;
        }
        startWalk(target, d, 'resume');
    };

    client.on('stepBack', stopWalk);
    client.on('mapMove', stopWalk);
    client.on('pauserStart', () => {
        if (!paused && path.length > 0) {
            paused = true;
            pausedByPauser = true;
            clearTimer();
            emitUpdate();
        }
    });
    client.on('pauserEnd', () => {
        if (pausedByPauser) {
            paused = false;
            pausedByPauser = false;
            emitUpdate();
            scheduleStep();
        }
    });

    // UI event listeners
    client.on('walker.stop', stopWalk);
    client.on('walker.resume', () => resumeWalk());
    client.on('walker.setDelay', (d) => {
        lastDelay = Math.max(0.5, d);
        delay = lastDelay;
        settings.autoWalkDelay = lastDelay;
        characterStorage.set('settings', settings as any);
        client.sendEvent('notify', { text: `[WALK] delay ${lastDelay.toFixed(2)}s` });
        emitUpdate();
    });
    client.on('walker.faster', () => {
        lastDelay = Math.max(0.5, lastDelay - 0.5);
        delay = Math.max(0.5, delay - 0.5);
        settings.autoWalkDelay = lastDelay;
        characterStorage.set('settings', settings as any);
        client.sendEvent('notify', { text: `[WALK] delay ${lastDelay.toFixed(2)}s` });
        emitUpdate();
    });
    client.on('walker.slower', () => {
        lastDelay += 0.5;
        delay += 0.5;
        settings.autoWalkDelay = lastDelay;
        characterStorage.set('settings', settings as any);
        client.sendEvent('notify', { text: `[WALK] delay ${lastDelay.toFixed(2)}s` });
        emitUpdate();
    });

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
        pattern: /^\/idz (\S+)(?:\s+([0-9]+(?:\.[0-9]{1,2})?))?$/,
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
        pattern: /^\/dalej(?:\s+([0-9]+(?:\.[0-9]{1,2})?))?$/,
        callback: (m: RegExpMatchArray) => {
            const d = m[1] ? parseFloat(m[1]) : undefined;
            resumeWalk(d);
        }
    });

    aliases.push({
        pattern: /^\/opoz ([0-9]+(?:\.[0-9]{1,2})?)$/,
        callback: (m: RegExpMatchArray) => {
            lastDelay = Math.max(0.5, parseFloat(m[1]));
            delay = lastDelay;
            settings.autoWalkDelay = lastDelay;
            characterStorage.set('settings', settings as any);
            client.sendEvent('notify', { text: `[WALK] delay ${lastDelay.toFixed(2)}s` });
            emitUpdate();
        }
    });

    aliases.push({
        pattern: /^\/szybciej$/,
        callback: () => {
            lastDelay = Math.max(0.5, lastDelay - 0.5);
            delay = Math.max(0.5, delay - 0.5);
            settings.autoWalkDelay = lastDelay;
            characterStorage.set('settings', settings as any);
            client.sendEvent('notify', { text: `[WALK] delay ${lastDelay.toFixed(2)}s` });
            emitUpdate();
        }
    });

    aliases.push({
        pattern: /^\/wolniej$/,
        callback: () => {
            lastDelay += 0.5;
            delay += 0.5;
            settings.autoWalkDelay = lastDelay;
            characterStorage.set('settings', settings as any);
            client.sendEvent('notify', { text: `[WALK] delay ${lastDelay.toFixed(2)}s` });
            emitUpdate();
        }
    });

    // Alias to open walker popup
    aliases.push({
        pattern: /^\/walkerw$/,
        callback: () => {
            client.sendEvent('walker.popup.open');
        }
    });
}
