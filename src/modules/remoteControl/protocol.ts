/**
 * Remote control: a phone drives the game running in a PC tab, over a WebRTC
 * data channel (see peerTransport). The PC stays the only client - it runs every trigger and
 * script - and the phone only shows what it is sent and types commands.
 *
 * Messages are JSON strings on one reliable, ordered channel.
 */

export interface RemoteRoom {
    /** Map room id, when the PC knows where the player is. */
    id: number | null;
    name: string | null;
    /** As the game lists them: short or Polish directions, or named exits. */
    exits: string[];
}

/** One thing in the room, as the PC's object list sees it. */
export interface RemoteObject {
    /** Game object number: commands aim at it as `ob_<num>`. */
    num: number;
    desc: string;
    /** The PC list's shortcut ('@', a number, or a team letter). */
    shortcut: string | null;
    hp: number | null;
    team: boolean;
    /** In a fight with someone. */
    fighting: boolean;
    /** The player's own attack target. */
    mine: boolean;
    /** The team leader's attack / defence target. */
    attackTarget: boolean;
    defenseTarget: boolean;
}

/** One of the PC's location binds / multibinds, as its footer row shows them. */
export interface RemoteBind {
    index: number;
    action: string;
    /** A temporary bind's display name, shown instead of the action. */
    name: string | null;
    /** The room's own bind, drink or gate bind; null for a numbered multibind. */
    kind: string | null;
}

/** What the phone shows besides the output. */
export interface RemoteState {
    character: string | null;
    /** GMCP Char.State numbers (hp, fatigue, mana, ...). */
    vitals: Record<string, number>;
    combat: boolean;
    room: RemoteRoom | null;
    /** Everyone and everything in the room but the player. */
    objects: RemoteObject[];
    /** The PC's attack command (`zabij` unless changed). */
    attackCommand: string;
    /** What the functional bind (`]`) would do now; null when nothing is bound. */
    functionalBind: string | null;
    binds: RemoteBind[];
}

export function emptyRemoteState(): RemoteState {
    return { character: null, vitals: {}, combat: false, room: null, objects: [], attackCommand: 'zabij', functionalBind: null, binds: [] };
}

/** PC -> phone. */
export type HostMessage =
    /** First message on a fresh channel: the full state and the recent output. */
    | { t: 'hello'; state: RemoteState; backlog: string[] }
    /** Fields of the state that changed. */
    | { t: 'state'; state: Partial<RemoteState> }
    /** One piece of output, as HTML (inline styles, so it needs no stylesheet). */
    | { t: 'out'; html: string }
    /** The PC is closing this connection on purpose: the phone must not reconnect on its own. */
    | { t: 'bye' }
    /** A short word for the phone's player, e.g. that a tapped link only works on the PC. */
    | { t: 'note'; text: string };

/** Phone -> PC. */
export type RemoteMessage =
    | { t: 'cmd'; text: string }
    /** Run the functional bind - only if it still does `action`, what the phone showed. */
    | { t: 'fbind'; action: string }
    /** Run a multibind - only if slot `index` still does `action`. */
    | { t: 'mbind'; index: number; action: string }
    /** Click an output link, by the `data-link` id its HTML carries. */
    | { t: 'link'; id: string };

export function parseRemoteMessage(raw: unknown): RemoteMessage | null {
    if (typeof raw !== 'string') return null;
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!value || typeof value !== 'object') return null;
    const message = value as Record<string, unknown>;
    if (message.t === 'cmd' && typeof message.text === 'string') {
        return { t: 'cmd', text: message.text };
    }
    if (message.t === 'fbind' && typeof message.action === 'string') {
        return { t: 'fbind', action: message.action };
    }
    if (message.t === 'mbind' && typeof message.index === 'number' && Number.isInteger(message.index) && typeof message.action === 'string') {
        return { t: 'mbind', index: message.index, action: message.action };
    }
    if (message.t === 'link' && typeof message.id === 'string' && message.id) {
        return { t: 'link', id: message.id };
    }
    return null;
}

export function parseHostMessage(raw: unknown): HostMessage | null {
    if (typeof raw !== 'string') return null;
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!value || typeof value !== 'object') return null;
    const message = value as Record<string, unknown>;
    if (message.t === 'bye') return { t: 'bye' };
    if (message.t === 'note' && typeof message.text === 'string') return { t: 'note', text: message.text };
    if (message.t === 'out' && typeof message.html === 'string') {
        return { t: 'out', html: message.html };
    }
    if (message.t === 'hello' && Array.isArray(message.backlog)) {
        return {
            t: 'hello',
            state: { ...emptyRemoteState(), ...parseStatePatch(message.state) },
            backlog: message.backlog.filter((item): item is string => typeof item === 'string'),
        };
    }
    if (message.t === 'state') {
        return { t: 'state', state: parseStatePatch(message.state) };
    }
    return null;
}

/** Keep only well-formed fields: the phone renders these directly. */
export function parseStatePatch(raw: unknown): Partial<RemoteState> {
    if (!raw || typeof raw !== 'object') return {};
    const value = raw as Record<string, unknown>;
    const patch: Partial<RemoteState> = {};
    if ('character' in value) {
        patch.character = typeof value.character === 'string' && value.character ? value.character : null;
    }
    if (value.vitals && typeof value.vitals === 'object') {
        const vitals: Record<string, number> = {};
        for (const [key, number] of Object.entries(value.vitals as Record<string, unknown>)) {
            if (typeof number === 'number' && Number.isFinite(number)) vitals[key] = number;
        }
        patch.vitals = vitals;
    }
    if (typeof value.combat === 'boolean') patch.combat = value.combat;
    if ('room' in value) {
        const room = value.room as Record<string, unknown> | null;
        patch.room = room && typeof room === 'object'
            ? {
                id: typeof room.id === 'number' && Number.isInteger(room.id) && room.id > 0 ? room.id : null,
                name: typeof room.name === 'string' && room.name ? room.name : null,
                exits: Array.isArray(room.exits)
                    ? room.exits.filter((exit): exit is string => typeof exit === 'string')
                    : [],
            }
            : null;
    }
    if (Array.isArray(value.objects)) patch.objects = value.objects.flatMap(parseObject);
    if (typeof value.attackCommand === 'string' && value.attackCommand.trim()) patch.attackCommand = value.attackCommand.trim();
    if ('functionalBind' in value) {
        patch.functionalBind = typeof value.functionalBind === 'string' && value.functionalBind.trim() ? value.functionalBind : null;
    }
    if (Array.isArray(value.binds)) patch.binds = value.binds.flatMap(parseBind);
    return patch;
}

function parseBind(raw: unknown): RemoteBind[] {
    if (!raw || typeof raw !== 'object') return [];
    const b = raw as Record<string, unknown>;
    if (typeof b.index !== 'number' || !Number.isInteger(b.index)) return [];
    if (typeof b.action !== 'string' || !b.action.trim()) return [];
    return [{
        index: b.index,
        action: b.action,
        name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : null,
        kind: typeof b.kind === 'string' && b.kind ? b.kind : null,
    }];
}

function parseObject(raw: unknown): RemoteObject[] {
    if (!raw || typeof raw !== 'object') return [];
    const o = raw as Record<string, unknown>;
    if (typeof o.num !== 'number' || !Number.isInteger(o.num) || o.num <= 0) return [];
    return [{
        num: o.num,
        desc: typeof o.desc === 'string' && o.desc ? o.desc : `ob_${o.num}`,
        shortcut: typeof o.shortcut === 'string' && o.shortcut ? o.shortcut : null,
        hp: typeof o.hp === 'number' && Number.isFinite(o.hp) ? o.hp : null,
        team: o.team === true,
        fighting: o.fighting === true,
        mine: o.mine === true,
        attackTarget: o.attackTarget === true,
        defenseTarget: o.defenseTarget === true,
    }];
}

/**
 * Output kept for a phone that connects mid-session. Pieces, not lines: the
 * client emits newlines as pieces of their own, so the cap counts pieces.
 */
export class OutputBacklog<T = string> {
    private items: T[] = [];

    constructor(private readonly limit = 3000) {}

    push(item: T): void {
        this.items.push(item);
        if (this.items.length > this.limit) this.items.splice(0, this.items.length - this.limit);
    }

    snapshot(): T[] {
        return this.items.slice();
    }
}
