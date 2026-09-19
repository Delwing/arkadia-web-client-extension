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

export const CHANNELS = [
    "comm",
    "combat",
    "room",
    "system",
    "notify",
    "command",
    "other",
    "script",
] as const;

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
    other: { label: "Inne", tag: "INNE", colorToken: "var(--ark-log-other)" },
    script: { label: "Skrypty", tag: "SKR", colorToken: "var(--ark-log-script)" },
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
    // Arkadia's own catch-all for game text it did not tag more specifically
    // ("Pozostale komunikaty" in the trigger catalogue), and the type
    // `MudClient.pushChunk` puts on every chunk that arrives outside GMCP msg
    // framing — the login screen, among others. Both are the game talking.
    ["other", "other"],
    ["mud", "other"],
];

const SORTED_PREFIXES = [...TYPE_PREFIXES].sort((a, b) => b[0].length - a[0].length);

/**
 * A type we do not fold yet. It still came from the game, so it belongs with
 * the rest of the game's text rather than with the client's own messages.
 */
export const FALLBACK_CHANNEL: Channel = "other";

/**
 * No type at all.
 *
 * This is not the same thing as an unrecognized type, and the difference is
 * the whole point of having two constants. Game text always carries a type:
 * it reaches the logger through `Client.flushLines`, which sets one on every
 * group. A record with no type was printed by the client itself —
 * `Client.print` pushes `{out}` with nothing else, and that is the path every
 * script, plugin and `printLine` takes. Folding the two together is what kept
 * script output hidden inside System.
 */
export const UNTYPED_CHANNEL: Channel = "script";

export function channelForType(type: string | undefined): Channel {
    if (!type) return UNTYPED_CHANNEL;
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
