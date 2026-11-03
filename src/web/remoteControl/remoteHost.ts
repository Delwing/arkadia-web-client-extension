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
import { AnsiAwareBuffer, type FormatHyperlink } from "@client/ansi/FormatState.ts";
import { getDeviceId } from "@modules/firebase/firebaseTypes.ts";
import { openHost, type HostHandle, type RemoteChannel } from "@modules/remoteControl/peerTransport.ts";
import {
    OutputBacklog,
    parseRemoteMessage,
    emptyRemoteState,
    type HostMessage,
    type RemoteBind,
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
/** Messages printed so far: a tapped link that printed nothing and sent nothing did its work on the PC only. */
let outputCount = 0;

/**
 * Output links a phone may tap, by the id their HTML carries. Only links that
 * reached a phone are kept, the oldest dropped past the cap - about what a phone keeps.
 */
const LINK_LIMIT = 4000;
const links = new Map<string, (event: MouseEvent) => void>();
/** One id per link, however many pieces of HTML (or phones) it is in. */
const linkIds = new WeakMap<object, string>();
let nextLinkId = 1;

function linkId(link: FormatHyperlink): string | null {
    const click = link.onClick;
    if (!click) return null;
    const known = linkIds.get(click);
    if (known && links.has(known)) return known;
    const id = (nextLinkId++).toString(36);
    linkIds.set(click, id);
    links.set(id, click);
    if (links.size > LINK_LIMIT) links.delete(links.keys().next().value!);
    return id;
}

const toHtml = (text: string | AnsiAwareBuffer) => text instanceof AnsiAwareBuffer ? text.toHtml(linkId) : text;

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

/** Time for a goodbye to leave before its connection closes. */
const BYE_FLUSH_MS = 300;

/** Close phones on purpose: they are told so, and do not reconnect on their own. */
function sayGoodbye(phones: RemoteChannel[], after?: () => void) {
    const bye = JSON.stringify({ t: 'bye' } satisfies HostMessage);
    phones.forEach(phone => phone.send(bye));
    window.setTimeout(() => {
        phones.forEach(phone => phone.close());
        after?.();
    }, BYE_FLUSH_MS);
}

export function disconnectPhones(): void {
    sayGoodbye([...channels]);
}

function notify(text: string, level: 'info' | 'success' | 'warning' = 'info') {
    client?.sendEvent('notify', { text, level, source: 'client', key: 'remote.control', time: 6000 });
}

function tell(phone: RemoteChannel, text: string) {
    phone.send(JSON.stringify({ t: 'note', text } satisfies HostMessage));
}

/** Time a tapped link has to send a command or print something before the phone hears it did nothing there. */
const LINK_EFFECT_MS = 700;

function clickLink(id: string, phone: RemoteChannel) {
    const target = client;
    const click = links.get(id);
    if (!target) return;
    if (!click) {
        tell(phone, 'Ten link jest już za stary.');
        return;
    }
    const printed = outputCount;
    let sent = false;
    const stop = target.on('command', () => {
        sent = true;
    });
    try {
        click(new MouseEvent('click'));
    } catch (error) {
        console.warn('[RemoteHost] link failed:', error);
    }
    window.setTimeout(() => {
        stop();
        if (!sent && outputCount === printed) tell(phone, 'Ten link działa tylko na komputerze.');
    }, LINK_EFFECT_MS);
}

function onPhoneMessage(text: unknown, phone: RemoteChannel) {
    const target = client;
    const message = parseRemoteMessage(text);
    if (!target || !message) return;
    switch (message.t) {
        case 'cmd':
            void target.sendCommand(message.text, true, undefined, false, true);
            break;
        case 'fbind':
            // The phone's button showed one action; a bind that changed since must not fire in its place.
            if (state.functionalBind === message.action) target.sendEvent('executeFunctionalBind');
            else tell(phone, 'Bind na komputerze właśnie się zmienił.');
            break;
        case 'mbind': {
            const bind = state.binds.find(b => b.index === message.index);
            if (bind && bind.action === message.action) void target.sendCommand(bind.action);
            else tell(phone, 'Bind na komputerze właśnie się zmienił.');
            break;
        }
        case 'link':
            clickLink(message.id, phone);
            break;
    }
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
    watchBinds(target);
}

/** The functional bind and the room's binds, as the PC's footer row shows them. */
function watchBinds(target: Client) {
    target.on('functionalBindState', bind => {
        const action = bind?.action?.trim() ? bind.action : null;
        if (action !== state.functionalBind) patchState({ functionalBind: action });
    });
    target.on('multibinds', payload => {
        const binds: RemoteBind[] = (Array.isArray(payload?.list) ? payload.list : [])
            .filter(bind => typeof bind.action === 'string' && bind.action.trim() !== '')
            .sort((a, b) => a.index - b.index)
            .map(bind => ({ index: bind.index, action: bind.action, name: bind.name?.trim() || null, kind: bind.kind ?? null }));
        patchState({ binds });
    });
    target.sendEvent('requestFunctionalBindState');
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
        outputCount++;
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
            next.onMessage(text => onPhoneMessage(text, next));
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
    const previous = host;
    host = null;
    // Switched off or re-coded on purpose: the phones should not keep trying.
    sayGoodbye(open, () => previous?.close());
    setStatus({ listening: false, phones: 0 });
}
