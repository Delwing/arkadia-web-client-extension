/**
 * Notable moments marked on the timeline.
 *
 * Kept deliberately small and sourced from things the client already knows for
 * certain, rather than from guessed text patterns: a marker that fires on the
 * wrong line is worse than no marker, because the timeline is the one place a
 * player trusts to say "it happened here".
 *
 * `login` comes from the GMCP message type, and carries the name of the
 * character it let in (see `model/characters.ts`) so that a re-login is visible
 * on the timeline rather than merely marked. `death` reuses a line the game
 * itself prints as a marker, whose pattern already exists in the client's
 * trigger layer (see src/client/scripts/lvlCalc.ts).
 *
 * To add a kind: add it to `LOG_EVENTS`, give it a detector, and it appears in
 * the lane and the legend automatically. Patterns stay ASCII — Arkadia sends
 * diacritic-free Polish (see AGENTS.md).
 */

export const LOG_EVENT_KINDS = ["login", "death"] as const;

export type LogEventKind = (typeof LOG_EVENT_KINDS)[number];

export interface LogEventMeta {
    label: string;
    /** Short tag for the log's tag column. Written out, never a sliced label. */
    tag: string;
    /** Single character drawn in the timeline's event lane. Never an emoji. */
    glyph: string;
    colorToken: string;
}

export const LOG_EVENT_META: Record<LogEventKind, LogEventMeta> = {
    login: { label: "Wejscie do gry", tag: "WEJSC", glyph: "|", colorToken: "var(--lv-log-event-login)" },
    death: { label: "Smierc", tag: "SMIERC", glyph: "✕", colorToken: "var(--lv-log-event-death)" },
};

/** `Twoje cechy sa oslabione po ostatniej smierci.` — the game's own death marker. */
const DEATH_LINE = /^Twoje cechy sa oslabione po ostatniej smierci\./;

/**
 * Classifies one line. `type` is the stored GMCP message type; `text` is the
 * plain text. Returns undefined for the overwhelming majority of lines.
 */
export function detectEvent(text: string, type: string | undefined): LogEventKind | undefined {
    if (type === "system.login") return "login";
    if (DEATH_LINE.test(text)) return "death";
    return undefined;
}
