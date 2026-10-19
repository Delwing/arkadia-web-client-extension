import Client from "../Client";
import { longToShort } from "@shared/map/directions";
import { getShortcut } from "./shortcuts";
import type { NotificationPayload, WalkerState } from "@shared/events/clientEvents";
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

    const roomLabel = (id: number) => client.Map.getRoomById(id)?.name || `lokacja ${id}`;
    const formatDelay = (d: number) => `${d.toFixed(2).replace('.', ',')} s`;

    // One toast follows the walk: progress while it runs, then how it ended.
    const WALK_TOAST = 'walk';

    const walkToast = (update: boolean) => {
        if (target === null || path.length < 2) return;
        const steps = path.length - 1;
        client.sendEvent('notify', {
            key: WALK_TOAST,
            update,
            source: 'walk',
            sticky: true,
            title: `Idę do: ${roomLabel(target)}`,
            text: paused ? 'Wstrzymane' : `Krok ${index} z ${steps} · ${formatDelay(delay)}`,
            progress: { value: index, max: steps },
            actions: [
                { label: 'Stop', command: '/stop', keepOpen: true },
                { label: 'Wolniej', command: '/wolniej', keepOpen: true },
                { label: 'Szybciej', command: '/szybciej', keepOpen: true },
            ],
        });
    };

    /** Replaces the walk toast with a fresh one (not counted as a repeat). */
    const endWalkToast = (payload: Omit<NotificationPayload, 'key' | 'source'>) => {
        client.sendEvent('notify.dismiss', { key: WALK_TOAST });
        client.sendEvent('notify', { key: WALK_TOAST, source: 'walk', ...payload });
    };

    const announceDelay = () => {
        // While walking the walk toast shows the delay itself.
        if (isWalking()) return;
        client.sendEvent('notify', { key: 'walk-delay', source: 'walk', text: `Opóźnienie chodzenia: ${formatDelay(lastDelay)}` });
    };

    const emitUpdate = () => {
        client.sendEvent('walker.update', getState());
        if (!paused || pausedByPauser) walkToast(true);
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
    characterStorage.onChange('settings', applySettings);

    const clearTimer = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const finishWalk = (reached: number | null = null) => {
        clearTimer();
        path = [];
        index = 0;
        target = null;
        client.sendEvent('clearLeadTo');
        emitUpdate();
        if (reached !== null) {
            endWalkToast({ level: 'success', text: `Dotarłem do: ${roomLabel(reached)}` });
        } else {
            endWalkToast({ level: 'warning', text: 'Prowadzenie przerwane: brak drogi dalej' });
        }
    };

    const scheduleStep = () => {
        if (paused) {
            clearTimer();
            return;
        }

        const time = (delay + (Math.random() * 0.6 - 0.3)) * 1000;
        timer = window.setTimeout(() => {
            timer = null;
            if (paused || target === null) return;

            const currentRoomId = client.Map.currentRoom?.id;
            if (typeof currentRoomId !== 'number') {
                finishWalk();
                return;
            }
            if (currentRoomId === target) {
                finishWalk(target);
                return;
            }

            // Keep the normal walk unchanged. Replan only when the mapper has
            // corrected the room to somewhere other than the planned step.
            if (path[index] !== currentRoomId) {
                const nextPath = client.Map.findPath(currentRoomId, target);
                if (!nextPath || nextPath.length < 2) {
                    finishWalk();
                    return;
                }
                path = nextPath.map((n) => parseInt(n as any, 10)).filter((n) => !isNaN(n));
                if (path.length < 2) {
                    finishWalk();
                    return;
                }
                index = 0;
                emitUpdate();
            }

            const current = client.Map.getRoomById(path[index]);
            if (!current) {
                finishWalk();
                return;
            }
            const nextId = path[index + 1];
            const exits = Object.assign({}, current.exits ?? {}, current.specialExits ?? {});
            const dir = Object.keys(exits).find(d => exits[d] === nextId);
            if (!dir) {
                finishWalk();
                return;
            }

            client.suppressMapMoveEvent = true;
            client.sendCommand(longToShort[dir] ?? dir);
            index += 1;
            emitUpdate();
            scheduleStep();
        }, time);
    };

    const startWalk = (targetId: number, d?: number) => {
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
        client.sendEvent('notify.dismiss', { key: WALK_TOAST });
        walkToast(false);
        emitUpdate();
        scheduleStep();
    };

    const stopWalk = () => {
        const wasWalking = isWalking();
        paused = true;
        clearTimer();
        if (wasWalking) {
            client.sendEvent('clearLeadTo');
            endWalkToast({ text: 'Prowadzenie zatrzymane', actions: [{ label: 'Dalej', command: '/dalej', primary: true }] });
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
        startWalk(target, d);
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
        announceDelay();
        emitUpdate();
    });
    client.on('walker.faster', () => {
        lastDelay = Math.max(0.5, lastDelay - 0.5);
        delay = Math.max(0.5, delay - 0.5);
        settings.autoWalkDelay = lastDelay;
        characterStorage.set('settings', settings as any);
        announceDelay();
        emitUpdate();
    });
    client.on('walker.slower', () => {
        lastDelay += 0.5;
        delay += 0.5;
        settings.autoWalkDelay = lastDelay;
        characterStorage.set('settings', settings as any);
        announceDelay();
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
            announceDelay();
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
            announceDelay();
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
            announceDelay();
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
