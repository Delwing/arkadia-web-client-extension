/**
 * Channel classification.
 *
 * The classification itself is NOT done here: Arkadia tags every line with a
 * GMCP message type as it arrives (`comm`, `combat.avatar`, `room.long`, …),
 * the client stores that type with the line, and this module only folds those
 * ~25 types into the handful of buckets a player would actually filter by.
 *
 * That is the design the spec asks for — classification at write time, from the
 * parser layer — and it means filters work on every log already recorded, with
 * no re-parsing of game text.
 */

export const CHANNELS = ["comm", "combat", "room", "system", "notify", "command"] as const;

export type Channel = (typeof CHANNELS)[number];

export interface ChannelMeta {
    label: string;
    /** Short tag shown in the log's tag column. */
    tag: string;
    /** Token that colours this channel's text and chip dot. */
    colorToken: string;
}

export const CHANNEL_META: Record<Channel, ChannelMeta> = {
    comm: { label: "Rozmowy", tag: "ROZM", colorToken: "var(--ark-log-comm)" },
    combat: { label: "Walka", tag: "WALKA", colorToken: "var(--ark-log-combat)" },
    room: { label: "Lokacja", tag: "LOK", colorToken: "var(--ark-log-room)" },
    system: { label: "System", tag: "SYS", colorToken: "var(--ark-log-system)" },
    notify: { label: "Powiadomienia", tag: "POW", colorToken: "var(--ark-log-notify)" },
    command: { label: "Komendy", tag: "KOM", colorToken: "var(--ark-log-command)" },
};

/**
 * GMCP message type -> channel. Prefixes are matched longest-first, so
 * `room.combat` lands in combat while the other `room.*` types stay in room.
 */
const TYPE_PREFIXES: [prefix: string, channel: Channel][] = [
    ["room.combat", "combat"],
    ["combat", "combat"],
    ["comm", "comm"],
    ["emotes", "comm"],
    ["room", "room"],
    ["living.long", "room"],
    ["object.long", "room"],
    ["notification", "notify"],
    ["mail", "notify"],
    ["editor", "notify"],
    ["command", "command"],
    ["system", "system"],
    ["prompt", "system"],
    ["other", "system"],
];

const SORTED_PREFIXES = [...TYPE_PREFIXES].sort((a, b) => b[0].length - a[0].length);

/** Lines with no stored type are game output with nothing more specific said about them. */
export const FALLBACK_CHANNEL: Channel = "system";

export function channelForType(type: string | undefined): Channel {
    if (!type) return FALLBACK_CHANNEL;
    for (const [prefix, channel] of SORTED_PREFIXES) {
        if (type === prefix || type.startsWith(`${prefix}.`)) return channel;
    }
    return FALLBACK_CHANNEL;
}

export type ChannelFilter = Record<Channel, boolean>;

export function allChannelsOn(): ChannelFilter {
    return Object.fromEntries(CHANNELS.map((channel) => [channel, true])) as ChannelFilter;
}

export function anyChannelOff(filter: ChannelFilter): boolean {
    return CHANNELS.some((channel) => !filter[channel]);
}

export function allChannelsOff(filter: ChannelFilter): boolean {
    return CHANNELS.every((channel) => !filter[channel]);
}
