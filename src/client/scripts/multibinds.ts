import Client from "../Client";
import { formatBindKey, getMultibindKeyLabel, getMultibindKeys, getMultibindLabel } from "../multibindKeys";
import {
    replaceAll as replaceMultibinds,
    subscribe as subscribeMultibinds,
    type StoredMultibindRecord,
} from "@modules/data/multibindStore";
import { globalStorage } from "@modules/core/storage";
import { type Bind, bindMatches } from "@modules/core/keymapTypes";
import MapHelper from "@shared/map/MapHelper";
import { getGateBindString, isGateRoom } from "./gateBind";
import { resolveMultibindSlots, temporaryMultibinds } from "./temporaryMultibinds";

/** Bar indexes of the room's own binds, past any multibind slot so they sort last. */
const ROOM_BIND_INDEX = 1001;
const DRINKABLE_BIND_INDEX = 1002;
const GATE_BIND_INDEX = 1003;

/** Saved binds past this index are dropped on load (a broken record, not a slot). */
const MAX_STORED_INDEX = 99;

interface DisplayMultibind {
    index: number;
    action: string;
    /** Key label, e.g. "ALT+1"; empty for a slot without a key. */
    label: string;
    /** The location's own bind, drink or gate bind, rather than a numbered multibind. */
    kind?: 'room' | 'drink' | 'gate';
    /** Display name of a temporary bind (shown on the bar instead of the action). */
    name?: string;
    /** Slot filled by a temporary (plugin) bind, not a saved one. */
    temporary?: boolean;
    /** Slot a temporary bind asked to draw attention to. */
    highlight?: boolean;
}

/** How many multibind slots the active keymap has. */
function slotCount() {
    return getMultibindKeys().length;
}

function isValidIndex(index: number) {
    return Number.isInteger(index) && index >= 1 && index <= slotCount();
}

function slotRangeMessage() {
    const count = slotCount();
    return count > 0
        ? `Numer binda musi byc pomiedzy 1, a ${count}.`
        : 'Brak slotow multibindow - dodaj je w oknie Klawisze.';
}

export default function initMultibinds(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const data = new Map<number, Map<number, string>>();
    let isInitialized = false;
    const pendingActions: (() => void)[] = [];

    // Load configured binds and listen for changes
    let roomBind: Bind = { key: 'KeyP', alt: true };
    let drinkableBind: Bind = { key: 'KeyN', alt: true };
    let gateBind: Bind = { key: 'KeyB', alt: true };

    let multibindKeys = getMultibindKeys();

    function applyMultibindKeys(b: any) {
        multibindKeys = getMultibindKeys();
        if (b?.roomBind) {
            roomBind = b.roomBind;
        }
        if (b?.drinkable) {
            drinkableBind = b.drinkable;
        }
        if (b?.gateBind) {
            gateBind = b.gateBind;
        }
    }

    applyMultibindKeys(globalStorage.get('binds'));
    globalStorage.onChange('binds', (b) => {
        applyMultibindKeys(b);
        // Slot count and key labels may have changed.
        if (isInitialized) sendUpdate(getRoomId());
    });

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

    /** Saved binds of the room merged with the temporary binds that apply to it. */
    function resolveSlots(roomId: number | null) {
        const saved = roomId === null ? undefined : data.get(roomId);
        return resolveMultibindSlots(saved, roomId, temporaryMultibinds.list(), slotCount());
    }

    function toBarDisplay(roomId: number | null): DisplayMultibind[] {
        return Array.from(resolveSlots(roomId).entries())
            .sort(([a], [b]) => a - b)
            .map(([index, slot]) => {
                const entry: DisplayMultibind = {
                    index,
                    action: slot.action,
                    label: getMultibindKeyLabel(index),
                };
                if (slot.name) entry.name = slot.name;
                if (slot.temporary) entry.temporary = true;
                if (slot.highlight) entry.highlight = true;
                return entry;
            });
    }

    let onTransport = false;
    client.on('transport.onBoard', (v) => {
        onTransport = v;
        if (!v) sendUpdate(getRoomId());
    });

    function sendUpdate(roomId: number | null) {
        let payload = toBarDisplay(roomId);

        const currentRoom = client.Map.currentRoom as any;
        const room = roomId !== null && currentRoom?.id === roomId ? currentRoom : null;
        // The chip shows in every gate location, crossing included - the
        // just-crossed rule applies to the functional bind only (see gates.ts).
        const showGateBind = isGateRoom(room);

        // Add userData.bind, drinkable and/or the gate bind if present in the room being displayed
        // Skip while player is physically on a transport — map room is the stop destination, not the player's location
        if (room && !onTransport) {
            const additionalBinds: DisplayMultibind[] = [];

            if (room?.userData?.bind) {
                additionalBinds.push({
                    index: ROOM_BIND_INDEX,
                    kind: 'room',
                    action: MapHelper.getBindPrintable(room.userData.bind),
                    label: formatBindKey(roomBind)
                });
            }

            if (room?.userData?.drinkable) {
                additionalBinds.push({
                    index: DRINKABLE_BIND_INDEX,
                    kind: 'drink',
                    action: "napij sie do syta wody",
                    label: formatBindKey(drinkableBind)
                });
            }

            if (showGateBind) {
                additionalBinds.push({
                    index: GATE_BIND_INDEX,
                    kind: 'gate',
                    action: MapHelper.getBindPrintable(getGateBindString(room)),
                    label: formatBindKey(gateBind)
                });
            }

            payload = [...payload, ...additionalBinds];
        }

        client.sendEvent('multibinds', { list: payload });
    }

    function log(message: string) {
        client.println(`[multibinds] ${message}`);
    }

    function create(roomId: number, index: number, action: string) {
        if (!isValidIndex(index)) {
            log(slotRangeMessage());
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
            const count = slotCount();
            for (let i = 1; i <= count; i += 1) {
                if (!roomMap || !roomMap.has(i)) {
                    set(roomId, i, normalized);
                    persist();
                    return;
                }
            }
            log(count > 0
                ? `Lokacja ma juz maksymalna (${count}) liczbe bindow.`
                : slotRangeMessage());
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

    function runCurrent(index: number) {
        // Saved binds of the current room plus any temporary binds in their slots
        const action = resolveSlots(getRoomId()).get(index)?.action;
        if (!action) {
            return;
        }
        client.sendCommand(action);
    }

    function applyStored(list: StoredMultibindRecord[]) {
        data.clear();
        list.forEach(item => {
            const roomId = Number(item.roomId);
            const index = Number(item.index);
            if (!Number.isInteger(index) || index < 1 || index > MAX_STORED_INDEX || Number.isNaN(roomId)) {
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
    temporaryMultibinds.subscribe(() => sendUpdate(getRoomId()));

    window.addEventListener('keydown', (ev) => {
        if (ev.repeat) {
            return;
        }
        const slot = multibindKeys.findIndex(def => !!def?.key && bindMatches(ev, def));
        if (slot === -1) {
            return;
        }
        runCurrent(slot + 1);
        ev.preventDefault();
    });

    // Handle room bind and drinkable binds
    window.addEventListener('keydown', (ev) => {
        if (ev.repeat) {
            return;
        }
        const room = client.Map.currentRoom as any;

        // gate bind - always active, uses userData.brama when the location defines it
        if (bindMatches(ev, gateBind)) {
            client.Map.executeBind(getGateBindString(room));
            ev.preventDefault();
            return;
        }

        if (!room) {
            return;
        }

        // userData.bind
        if (bindMatches(ev, roomBind)) {
            if (room?.userData?.bind) {
                client.Map.executeBind(room.userData.bind);
                ev.preventDefault();
            }
            return;
        }

        // drinkable - always active, but info displayed only on drinkable locations
        if (bindMatches(ev, drinkableBind)) {
            client.sendCommand("napij sie do syta wody");
            ev.preventDefault();
            return;
        }
    });

    // Helper bind support for roomBind and drinkable
    client.on('helperBind', (bindName) => {
        if (bindName === 'roomBind') {
            const room = client.Map.currentRoom as any;
            if (room?.userData?.bind) {
                client.Map.executeBind(room.userData.bind);
            }
        }
        if (bindName === 'drinkable') {
            client.sendCommand("napij sie do syta wody");
        }
        if (bindName === 'gateBind') {
            client.Map.executeBind(getGateBindString(client.Map.currentRoom));
        }
        const multibind = /^multibind(\d+)$/.exec(bindName);
        if (multibind) runCurrent(parseInt(multibind[1], 10));
    });

    if (aliases) {
        aliases.push({
            pattern: /^\/mbind (\d+) (.+)$/,
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
            pattern: /^\/mbind- (\d+)$/,
            callback: (matches: RegExpMatchArray) => {
                const index = parseInt(matches[1], 10);
                if (!isValidIndex(index)) {
                    log(slotRangeMessage());
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
