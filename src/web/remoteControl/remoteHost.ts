/**
 * The PC side of remote control (POC): let a phone drive this tab. The phone
 * gets the output and what it shows besides (vitals, room, objects), and its
 * commands run here as if typed.
 *
 * Off until switched on in the /pilot window (remembered in localStorage).
 * Only a phone that scanned that window's QR - which carries a pairing code -
 * gets in. The link itself is in @modules/remoteControl/peerTransport.
 */

import type Client from "@client/Client";
import mudClient from "../MudClient.ts";
import { AnsiAwareBuffer } from "@client/ansi/FormatState.ts";
import { getDeviceId } from "@modules/firebase/firebaseTypes.ts";
import { openHost, type HostHandle, type RemoteChannel } from "@modules/remoteControl/peerTransport.ts";
import {
    OutputBacklog,
    parseRemoteMessage,
    emptyRemoteState,
    type HostMessage,
    type RemoteObject,
    type RemoteState,
} from "@modules/remoteControl/protocol.ts";

const ENABLED_KEY = 'arkadia.remoteHost';
const PAIR_KEY = 'arkadia.remoteHost.pair';

export interface RemoteHostStatus {
    enabled: boolean;
    /** Phones connected now; any number may drive at once. */
    phones: number;
    /** Registered with the PeerJS server: a phone can reach this PC. */
    listening: boolean;
}

let client: Client | null = null;
let enabled = false;
let status: RemoteHostStatus = { enabled: false, phones: 0, listening: false };
const statusListeners = new Set<(status: RemoteHostStatus) => void>();
let host: HostHandle | null = null;
const channels = new Set<RemoteChannel>();
const state: RemoteState = emptyRemoteState();
/**
 * Recent output, kept even while hosting is off, so a phone that connects
 * right after /pilot still sees what just happened. Kept as the client's own
 * messages and turned into HTML only when a phone connects.
 */
const backlog = new OutputBacklog<string | AnsiAwareBuffer>();
const toHtml = (text: string | AnsiAwareBuffer) => text instanceof AnsiAwareBuffer ? text.toHtml() : text;

function readEnabled(): boolean {
    try {
        return localStorage.getItem(ENABLED_KEY) === '1';
    } catch {
        return false;
    }
}

function setStatus(patch: Partial<RemoteHostStatus>) {
    status = { ...status, ...patch };
    statusListeners.forEach(listener => listener(status));
}

export function getRemoteHostStatus(): RemoteHostStatus {
    return status;
}

export function onRemoteHostStatus(listener: (status: RemoteHostStatus) => void): () => void {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
}

function newPairingCode(): string {
    const bytes = new Uint8Array(9);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** The code the QR carries; kept, so a phone that scanned it once can come back. */
export function getPairingCode(): string {
    try {
        let code = localStorage.getItem(PAIR_KEY);
        if (!code) {
            code = newPairingCode();
            localStorage.setItem(PAIR_KEY, code);
        }
        return code;
    } catch {
        return '';
    }
}

/** A fresh code: phones paired with the old one can no longer connect, and the connected ones are dropped. */
export function rotatePairingCode(): string {
    const code = newPairingCode();
    try {
        localStorage.setItem(PAIR_KEY, code);
    } catch {
        // Kept for this page only
    }
    // The PC's address on the server is made from the code: register under the new one.
    if (enabled) {
        stopHosting();
        startHosting();
    }
    return code;
}

/** Names this PC on the phone (which keeps a code and a character per PC). */
export function getRemoteHostId(): string {
    return getDeviceId();
}

export function setRemoteHostEnabled(next: boolean): void {
    if (next === enabled) return;
    enabled = next;
    try {
        localStorage.setItem(ENABLED_KEY, next ? '1' : '0');
    } catch {
        // Kept for this page only
    }
    setStatus({ enabled: next });
    if (next) startHosting();
    else stopHosting();
}

export function disconnectPhones(): void {
    [...channels].forEach(channel => channel.close());
}

function notify(text: string, level: 'info' | 'success' | 'warning' = 'info') {
    client?.sendEvent('notify', { text, level, source: 'client', key: 'remote.control', time: 6000 });
}

function send(message: HostMessage) {
    if (channels.size === 0) return;
    const text = JSON.stringify(message);
    channels.forEach(channel => channel.send(text));
}

function patchState(patch: Partial<RemoteState>) {
    Object.assign(state, patch);
    send({ t: 'state', state: patch });
}

/**
 * What the phone shows besides the output, from events the client already
 * emits - nothing in the client knows the phone exists.
 */
function watchGameState(target: Client) {
    let roomId: number | null = null;
    let roomName: string | null = null;
    let exits: string[] = [];
    const sendRoom = () => patchState({ room: { id: roomId, name: roomName, exits } });

    target.on('player.character', name => patchState({ character: typeof name === 'string' && name ? name : null }));
    target.on('gmcp.char.state', vitals => {
        if (!vitals || typeof vitals !== 'object') return;
        const merged = { ...state.vitals };
        for (const [key, value] of Object.entries(vitals)) {
            if (typeof value === 'number' && Number.isFinite(value)) merged[key] = value;
        }
        patchState({ vitals: merged });
    });
    target.on('combatState', inCombat => patchState({ combat: !!inCombat }));
    target.on('gmcp.room.info', info => {
        exits = Array.isArray(info?.exits) ? info.exits.filter((exit): exit is string => typeof exit === 'string') : [];
        sendRoom();
    });
    target.on('enterLocation', location => {
        const name = (location?.room as { name?: unknown } | null | undefined)?.name;
        roomName = typeof name === 'string' && name ? name : null;
        roomId = Number.isInteger(location?.id) && location.id > 0 ? location.id : null;
        sendRoom();
    });
    watchObjects(target);
}

/**
 * The room's objects, read from the client's own object list. Its events come
 * in bursts (numbers, then data), so a send waits for the burst to end and is
 * skipped when nothing the phone shows changed.
 */
function watchObjects(target: Client) {
    let scheduled = false;
    let lastSent = '';
    const flush = () => {
        scheduled = false;
        const objects: RemoteObject[] = target.ObjectManager.getObjectsOnLocation()
            .filter(o => o.__category !== 'player')
            .map(o => ({
                num: o.num,
                desc: o.desc ?? `ob_${o.num}`,
                shortcut: o.shortcut ?? null,
                hp: typeof o.hp === 'number' ? o.hp : null,
                team: o.__category === 'team',
                fighting: o.attack_num !== false && o.attack_num !== undefined,
                mine: !!o.avatar_target,
                attackTarget: !!o.attack_target,
                defenseTarget: !!o.defense_target,
            }));
        const patch = { objects, attackCommand: target.attackCommand };
        const key = JSON.stringify(patch);
        if (key === lastSent) return;
        lastSent = key;
        patchState(patch);
    };
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(flush, 0);
    };
    target.on('parsedObjects', schedule);
    target.on('parsedNums', schedule);
}

export function installRemoteHost(target: Client): void {
    if (client) return;
    client = target;

    target.aliases.push({
        pattern: /^\/pilot$/,
        callback: () => {
            void import('./openRemoteControlModal').then(({ openRemoteControlModal }) => openRemoteControlModal());
        },
    });

    mudClient.on('message', (text?: string | AnsiAwareBuffer) => {
        // Like the PC output: every message is a line, and an empty one is an empty line.
        if (text === undefined || text === null) return;
        backlog.push(text);
        if (channels.size > 0) send({ t: 'out', html: toHtml(text) });
    });
    watchGameState(target);

    if (readEnabled()) setRemoteHostEnabled(true);
}

function startHosting() {
    if (!client || host) return;
    host = openHost(getPairingCode(), {
        ready: () => {
            setStatus({ listening: true });
            console.info('[RemoteHost] waiting for a phone');
        },
        offline: reason => {
            setStatus({ listening: false });
            console.warn('[RemoteHost] not reachable yet:', reason);
        },
        connection: next => {
            // Any number of phones: each gets everything, and any may send commands.
            channels.add(next);
            next.onMessage(text => {
                const message = parseRemoteMessage(text);
                if (message?.t === 'cmd') void client?.sendCommand(message.text, true, undefined, false, true);
            });
            next.onClose(() => {
                if (!channels.delete(next)) return;
                setStatus({ phones: channels.size });
                notify('Telefon rozłączony.');
            });
            next.send(JSON.stringify({ t: 'hello', state, backlog: backlog.snapshot().map(toHtml) } satisfies HostMessage));
            setStatus({ phones: channels.size });
            notify(channels.size > 1 ? `Telefon steruje postacią (połączone: ${channels.size}).` : 'Telefon steruje postacią.', 'success');
        },
    });
}

function stopHosting() {
    const open = [...channels];
    channels.clear();
    open.forEach(channel => channel.close());
    host?.close();
    host = null;
    setStatus({ listening: false, phones: 0 });
}
