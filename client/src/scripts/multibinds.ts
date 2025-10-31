import Client from "../Client";
import { getMultibindLabel, MULTIBIND_KEYS } from "../multibindKeys";
import {
    replaceAll as replaceMultibinds,
    subscribe as subscribeMultibinds,
    type StoredMultibindRecord,
} from "front-client/src/dataStores/multibindStore";

const MAX_BINDS = 4;

interface DisplayMultibind {
    index: number;
    action: string;
    label: string;
}

function isValidIndex(index: number) {
    return Number.isInteger(index) && index >= 1 && index <= MAX_BINDS;
}

export default function initMultibinds(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const data = new Map<number, Map<number, string>>();
    let isInitialized = false;
    const pendingActions: (() => void)[] = [];

    function runWhenReady(action: () => void) {
        if (isInitialized) {
            action();
            return;
        }
        pendingActions.push(action);
    }

    function flushPendingActions() {
        if (isInitialized && pendingActions.length > 0) {
            const actions = pendingActions.splice(0, pendingActions.length);
            actions.forEach(fn => {
                try {
                    fn();
                } catch (err) {
                    console.error('Failed to execute queued multibind action:', err);
                }
            });
        }
    }

    function serialize(): StoredMultibindRecord[] {
        const entries: StoredMultibindRecord[] = [];
        data.forEach((roomMap, roomId) => {
            roomMap.forEach((action, index) => {
                entries.push({ roomId, index, action });
            });
        });
        return entries;
    }

    function persist() {
        const payload = serialize();
        replaceMultibinds(payload).catch(err => {
            console.error('Failed to persist multibinds:', err);
        });
    }

    function set(roomId: number, index: number, action: string) {
        if (!data.has(roomId)) {
            data.set(roomId, new Map());
        }
        const roomMap = data.get(roomId)!;
        roomMap.set(index, action);
    }

    function remove(roomId: number, index: number) {
        const roomMap = data.get(roomId);
        if (!roomMap) {
            return;
        }
        roomMap.delete(index);
        if (roomMap.size === 0) {
            data.delete(roomId);
        }
    }

    function removeAll(roomId: number) {
        data.delete(roomId);
    }

    function getRoomId(): number | null {
        const id = client.Map.currentRoom?.id;
        return typeof id === 'number' ? id : null;
    }

    function getForRoom(roomId: number): StoredMultibindRecord[] {
        const roomMap = data.get(roomId);
        if (!roomMap) {
            return [];
        }
        return Array.from(roomMap.entries())
            .map(([index, action]) => ({ roomId, index, action }))
            .sort((a, b) => a.index - b.index);
    }

    function toDisplay(roomId: number): DisplayMultibind[] {
        return getForRoom(roomId).map(({ index, action }) => ({
            index,
            action,
            label: getMultibindLabel(index),
        }));
    }

    function sendUpdate(roomId: number | null) {
        const payload = roomId === null ? [] : toDisplay(roomId);
        client.sendEvent('multibinds', { list: payload });
    }

    function log(message: string) {
        client.println(`[multibinds] ${message}`);
    }

    function create(roomId: number, index: number, action: string) {
        if (!isValidIndex(index)) {
            log(`Numer binda musi byc pomiedzy 1, a ${MAX_BINDS}.`);
            return;
        }
        const normalized = action.trim();
        runWhenReady(() => {
            set(roomId, index, normalized);
            persist();
        });
    }

    function createCurrent(index: number, action: string) {
        const roomId = getRoomId();
        if (roomId === null) {
            log('Nie mozna utworzyc binda - brak aktualnej lokacji.');
            return;
        }
        create(roomId, index, action);
    }

    function createNext(action: string) {
        const roomId = getRoomId();
        if (roomId === null) {
            log('Nie mozna utworzyc binda - brak aktualnej lokacji.');
            return;
        }
        runWhenReady(() => {
            const normalized = action.trim();
            const roomMap = data.get(roomId);
            for (let i = 1; i <= MAX_BINDS; i += 1) {
                if (!roomMap || !roomMap.has(i)) {
                    set(roomId, i, normalized);
                    persist();
                    return;
                }
            }
            log(`Lokacja ma juz maksymalna (${MAX_BINDS}) liczbe bindow.`);
        });
    }

    function clearRoom(roomId: number) {
        runWhenReady(() => {
            removeAll(roomId);
            persist();
        });
    }

    function clearCurrent() {
        const roomId = getRoomId();
        if (roomId === null) {
            log('Brak aktualnej lokacji.');
            return;
        }
        clearRoom(roomId);
    }

    function clearIndex(roomId: number, index: number) {
        runWhenReady(() => {
            remove(roomId, index);
            persist();
        });
    }

    function clearCurrentIndex(index: number) {
        const roomId = getRoomId();
        if (roomId === null) {
            log('Brak aktualnej lokacji.');
            return;
        }
        clearIndex(roomId, index);
    }

    function display(roomId: number) {
        const list = toDisplay(roomId);
        const lines: string[] = [`Multibindy dla lokacji ${roomId}:`];
        if (list.length === 0) {
            lines.push('Brak.');
        } else {
            list.forEach(({ label, action }) => {
                lines.push(`[${label}] - ${action}`);
            });
        }
        client.println(lines.join('\n'));
    }

    function displayCurrent() {
        const roomId = getRoomId();
        if (roomId === null) {
            log('Brak aktualnej lokacji.');
            return;
        }
        display(roomId);
    }

    function run(roomId: number, index: number) {
        const action = data.get(roomId)?.get(index);
        if (!action) {
            return;
        }
        client.sendCommand(action);
    }

    function runCurrent(index: number) {
        const roomId = getRoomId();
        if (roomId === null) {
            return;
        }
        run(roomId, index);
    }

    function applyStored(list: StoredMultibindRecord[]) {
        data.clear();
        list.forEach(item => {
            const roomId = Number(item.roomId);
            const index = Number(item.index);
            if (!isValidIndex(index) || Number.isNaN(roomId)) {
                return;
            }
            set(roomId, index, item.action);
        });
        isInitialized = true;
        flushPendingActions();
        sendUpdate(getRoomId());
    }

    client.on('enterLocation', (detail) => {
        const payload = detail as { id?: number };
        const roomId = typeof payload?.id === 'number' ? payload.id : Number(payload?.id);
        sendUpdate(Number.isNaN(roomId) ? null : roomId);
    });

    subscribeMultibinds(applyStored);

    window.addEventListener('keydown', (ev) => {
        if (ev.repeat) {
            return;
        }
        const entry = Object.entries(MULTIBIND_KEYS).find(([, def]) => {
            if (!def) {
                return false;
            }
            const matchesKey = ev.code === def.key || ev.key === def.key;
            if (!matchesKey) {
                return false;
            }
            return (!!def.ctrl === ev.ctrlKey) && (!!def.alt === ev.altKey) && (!!def.shift === ev.shiftKey);
        });
        if (!entry) {
            return;
        }
        const index = parseInt(entry[0], 10);
        runCurrent(index);
        ev.preventDefault();
    });

    if (aliases) {
        aliases.push({
            pattern: /^\/mbind (\d) (.+)$/,
            callback: (matches: RegExpMatchArray) => {
                const index = parseInt(matches[1], 10);
                const action = matches[2].trim();
                createCurrent(index, action);
            }
        });
        aliases.push({
            pattern: /^\/mbind\+ (.*)$/,
            callback: (matches: RegExpMatchArray) => {
                const action = matches[1].trim();
                createNext(action);
            }
        });
        aliases.push({
            pattern: /^\/mbind (\d+)$/,
            callback: (matches: RegExpMatchArray) => {
                const roomId = parseInt(matches[1], 10);
                if (!Number.isNaN(roomId)) {
                    display(roomId);
                }
            }
        });
        aliases.push({
            pattern: /^\/mbind-$/,
            callback: () => {
                clearCurrent();
            }
        });
        aliases.push({
            pattern: /^\/mbind- (\d)$/,
            callback: (matches: RegExpMatchArray) => {
                const index = parseInt(matches[1], 10);
                if (!isValidIndex(index)) {
                    log(`Numer binda musi byc pomiedzy 1, a ${MAX_BINDS}.`);
                    return;
                }
                clearCurrentIndex(index);
            }
        });
        aliases.push({
            pattern: /^\/mbind$/,
            callback: () => {
                displayCurrent();
            }
        });
    }
}
