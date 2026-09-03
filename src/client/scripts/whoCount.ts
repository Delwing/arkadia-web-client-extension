import Client from "../Client";
import { polishWordToNumber, polishNumberPattern } from "./polishNumberConverter";
import { createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import { getMergedSnapshot } from "@modules/data/peopleLoader";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";
import type { FormatStateSnapshot } from "@client/ansi/FormatState";
import type { TriggerMatchFunction } from "../Triggers";

const TAG = 'who-count';
const GREEN = createColorFormat('#00ff00');
const RED = createColorFormat('#ff0000');
const DEFAULT_NAME_COLOR = createColorFormat('#ffffff');

/**
 * How long a reply that never named its own end stays open waiting for the rest of itself.
 * A reply split across frames continues in the very next one, so this only has to outlast
 * the socket — long enough to cover a frame boundary and the 300ms tail flush behind it.
 */
const REPLY_IDLE_MS = 600;

const KTO_HEADER = /^Sposrod\s+.+\s+osob przebywajacych obecnie w swiecie Arkadii, znane tobie to:/m;

/** Sentence punctuation, which no kto line has. See {@link takeKtoBody}. */
const SENTENCE_END = /[.!?]/;

/**
 * Split a frame into the part that still belongs to the kto reply and whether the reply
 * ended inside it.
 *
 * The reply has no terminator of its own, so both halves of this rest on one fact: no line
 * of the reply ever ends a sentence — names carry no period, exclamation or question mark,
 * and neither do the long-format descriptions. So the first line that does is where the
 * reply ended and unrelated output began (a weapon shouting "Tarcza!", say), and everything
 * from there on is neither parsed nor decorated. When no line has one, the frame is reply
 * body all the way to its end and the reply may well continue in the next frame.
 */
export function takeKtoBody(text: string): { body: string; ended: boolean } {
    const lines = text.split('\n');
    const end = lines.findIndex(l => SENTENCE_END.test(l));
    if (end === -1) {
        return { body: text, ended: false };
    }
    return { body: lines.slice(0, end).join('\n'), ended: true };
}

/** The part of a frame that belongs to the kto reply. See {@link takeKtoBody}. */
export function sliceKtoBody(body: string): string {
    return takeKtoBody(body).body;
}

/**
 * Parse names from the kto response body.
 * Supports two formats:
 * - Long format (kto / kto l): each person on a separate line with descriptions and commas
 * - Short format (kto k): names in columns separated by 2+ spaces, no commas
 * Leading/trailing * is stripped from names.
 */
export function parseKtoNames(body: string): string[] {
    const names: string[] = [];
    const lines = body.split('\n');

    // Detect format: long format has commas (descriptions), short format doesn't
    const isShortFormat = !body.includes(',');

    if (isShortFormat) {
        // Short/column format: names separated by 2+ spaces
        for (const l of lines) {
            const trimmed = l.trim();
            if (trimmed.length === 0) continue;
            const parts = trimmed.split(/\s{2,}/);
            for (const part of parts) {
                const name = part.trim().replace(/^\*|\*$/g, '');
                if (name.length > 0) {
                    names.push(name);
                }
            }
        }
    } else {
        // Long format: each person starts on a non-indented line
        for (const l of lines) {
            const trimmed = l.trimEnd();
            if (trimmed.length === 0 || l.startsWith(' ') || trimmed.endsWith('.') || !trimmed.includes(',')) continue;
            const firstWord = l.split(/\s/)[0];
            const name = firstWord.replace(/^\*|\*$/g, '').replace(/,+$/, '');
            if (name.length > 0) {
                names.push(name);
            }
        }
    }

    return names;
}

/** A kto reply being assembled, possibly out of more than one frame. */
interface OpenReply {
    /** Names gathered from every frame of this reply so far. */
    names: string[];
    /** The previous reply's names, frozen for as long as this one is being assembled. */
    baseline: string[];
    baselineSet: Set<string>;
}

export default function initWhoCount(client: Client) {
    let lastCount: number | null = null;
    let previousNames: string[] = [];

    // A kto reply is not guaranteed to arrive in one frame: the game flushes what fits and
    // the rest lands in the next one. Diffing half a reply against the last whole one reads
    // every name below the cut as having left, and then marks all of them as new arrivals
    // on the next kto — so the names are collected across frames and only compared once the
    // reply is over.
    let openReply: OpenReply | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    // Settings for guild/enemy coloring
    let enemyGuilds: string[] = [];
    let guildColors: Record<string, string | undefined> = {};

    const applySettings = (settings: any) => {
        const detail = (settings ?? defaultSettings) as {
            enemyGuilds?: string[];
            guildColors?: Record<string, string | undefined>;
        };
        enemyGuilds = detail.enemyGuilds || [];
        guildColors = detail.guildColors || {};
    };
    applySettings(characterStorage.get('settings'));
    characterStorage.onChange('settings', applySettings);

    // Reset state on character switch
    client.on("reset", () => {
        lastCount = null;
        previousNames = [];
        openReply = null;
        clearIdleTimer();
    });

    /**
     * Look up a name in the people database and return an appropriate color.
     * Enemy guilds get red, guild members get their guild color, others get default.
     */
    function getColorForName(name: string): FormatStateSnapshot {
        const people = getMergedSnapshot();
        if (!people) return DEFAULT_NAME_COLOR;

        const entry = people.find(
            p => p.name.toLowerCase() === name.toLowerCase() && !p.ignored
        );
        if (!entry) return DEFAULT_NAME_COLOR;

        if (entry.isEnemy || enemyGuilds.includes(entry.guild)) {
            return RED;
        }
        if (entry.color) {
            return createColorFormat(entry.color);
        }
        const guildColorHex = guildColors[entry.guild];
        if (guildColorHex) {
            return createColorFormat(guildColorHex);
        }
        return DEFAULT_NAME_COLOR;
    }

    function isWordChar(ch: string | undefined): boolean {
        if (!ch) return false;
        if (ch >= 'a' && ch <= 'z') return true;
        if (ch >= 'A' && ch <= 'Z') return true;
        return ch >= '0' && ch <= '9';

    }

    /**
     * Find position of a name in the buffer text (within [bodyStart, bodyEnd)), respecting
     * word boundaries. Both the character before and after must be non-word characters to
     * prevent matching a shorter name inside a longer one (e.g. "Ana" inside "Anarion").
     * The end bound keeps a decoration from landing on unrelated output that shared the frame.
     * Returns the insert position (before * if present), or -1 if not found.
     */
    function findNamePosition(text: string, name: string, bodyStart: number, bodyEnd: number): number {
        let idx = text.indexOf(name, bodyStart);
        while (idx >= 0 && idx + name.length <= bodyEnd) {
            const before = idx > 0 ? text[idx - 1] : undefined;
            const afterIdx = idx + name.length;
            const after = afterIdx < text.length ? text[afterIdx] : undefined;
            if (!isWordChar(before) && !isWordChar(after)) {
                return before === '*' ? idx - 1 : idx;
            }
            idx = text.indexOf(name, idx + 1);
        }
        return -1;
    }

    function clearIdleTimer(): void {
        if (idleTimer !== null) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
    }

    /** Names the previous reply had that the one being assembled no longer lists. */
    function departed(reply: OpenReply): string[] {
        if (reply.baseline.length === 0) return [];
        const current = new Set(reply.names);
        return reply.baseline.filter(n => !current.has(n));
    }

    function departedBuffer(names: string[]): AnsiAwareBuffer {
        const out = new AnsiAwareBuffer("Zakonczyli: ");
        for (let i = 0; i < names.length; i++) {
            out.append(names[i], getColorForName(names[i]));
            if (i < names.length - 1) {
                out.append(", ", {});
            }
        }
        return out;
    }

    /** Accept the assembled reply as the set the next one is diffed against. */
    function commitReply(): void {
        if (!openReply) return;
        previousNames = openReply.names;
        openReply = null;
        clearIdleTimer();
    }

    /**
     * Nothing in the reply says where it stops, so one whose last frame held no unrelated
     * line stays open until either a later frame closes it or this fires. The departed
     * names then have to be printed rather than inserted — there is no line left to attach
     * them to.
     */
    function scheduleIdleClose(): void {
        clearIdleTimer();
        idleTimer = setTimeout(() => {
            idleTimer = null;
            if (!openReply) return;
            const gone = departed(openReply);
            if (gone.length > 0) {
                const out = new AnsiAwareBuffer("\n");
                out.appendBuffer(departedBuffer(gone));
                client.print(out);
            }
            commitReply();
        }, REPLY_IDLE_MS);
    }

    // Single-line trigger for the count display (header line)
    const numberGroup = `(${polishNumberPattern}|\\d+)`;
    const pattern = new RegExp(
        `^Sposrod\\s+${numberGroup}\\s+osob przebywajacych obecnie w swiecie Arkadii, znane tobie to:`
    );

    client.Triggers.registerTrigger(pattern, (line, matches) => {
        if (!matches) return line;

        const count = polishWordToNumber(matches[1]);
        if (count === 0) return line;

        let suffix = '';
        if (lastCount !== null) {
            const diff = count - lastCount;
            if (diff > 0) {
                suffix = ` [+${diff}]`;
            } else if (diff < 0) {
                suffix = ` [${diff}]`;
            } else {
                suffix = ` [=]`;
            }
        }
        lastCount = count;

        if (suffix) {
            const text = line.text;
            const colonIndex = text.indexOf(':');
            if (colonIndex >= 0) {
                line = line.insert(colonIndex + 1, suffix, {});
            }
        }

        return line;
    }, TAG);

    /**
     * Matches the frame that opens a kto reply and — while one is open — every frame after
     * it, since any of them may carry the rest of that reply. The zero-length match is how
     * the callback tells a continuation from a header: it reads from the end of the match.
     */
    const matchKtoFrame: TriggerMatchFunction = (line) => {
        const header = KTO_HEADER.exec(line.text);
        if (header) return header;
        if (!openReply) return undefined;
        const continuation = [''] as unknown as RegExpMatchArray;
        continuation.index = 0;
        continuation.input = line.text;
        return continuation;
    };

    client.Triggers.registerMultilineTrigger(matchKtoFrame, (line, matches, type) => {
        const text = line.text;
        const isHeader = matches[0].length > 0;
        const start = matches.index ?? 0;

        // Every insertion is resolved against the untouched text and applied at the end,
        // back to front, so no earlier insert shifts a position found after it.
        const inserts: { pos: number; apply: () => void }[] = [];

        const applyInserts = () => {
            inserts.sort((a, b) => b.pos - a.pos);
            for (const insert of inserts) {
                insert.apply();
            }
        };

        // "Zakonczyli" belongs to the kto reply, so it goes where the reply ended rather
        // than after whatever else the game flushed around it.
        const pushDeparted = (pos: number, names: string[]) => {
            if (names.length === 0) return;
            const atLineStart = pos === 0 || text[pos - 1] === '\n';
            const out = new AnsiAwareBuffer(atLineStart ? "" : "\n");
            out.appendBuffer(departedBuffer(names));
            if (atLineStart) {
                out.append("\n", {});
            }
            inserts.push({ pos, apply: () => { line.insertBuffer(pos, out); } });
        };

        if (isHeader) {
            // A new reply proves the open one is over, wherever the game stopped writing it.
            if (openReply) {
                pushDeparted(start, departed(openReply));
                commitReply();
            }
            openReply = { names: [], baseline: previousNames, baselineSet: new Set(previousNames) };
        } else if (openReply && type === 'prompt') {
            // A prompt ends the server's burst, so it ends the reply too — and does it
            // straight away, rather than making the player wait out the idle timer.
            pushDeparted(0, departed(openReply));
            commitReply();
            applyInserts();
            return line;
        }

        const reply = openReply;
        if (!reply) return line;

        let cursor = start + matches[0].length;
        if (text[cursor] === '\n') cursor++;

        const { body, ended } = takeKtoBody(text.slice(cursor));
        const names = parseKtoNames(body);
        const bodyEnd = Math.min(cursor + body.length, line.length);

        // Decorations only make sense once we have something to compare against
        if (reply.baseline.length > 0) {
            // Resolve the new arrivals up front, while no insertion has shifted anything yet
            for (const name of names) {
                if (reply.baselineSet.has(name)) continue;
                const pos = findNamePosition(text, name, cursor, bodyEnd);
                if (pos >= 0) {
                    inserts.push({ pos, apply: () => { line.insert(pos, '+ ', GREEN); } });
                }
            }
        }
        reply.names.push(...names);

        if (ended) {
            pushDeparted(bodyEnd, departed(reply));
            commitReply();
        } else {
            scheduleIdleClose();
        }

        applyInserts();
        return line;
    }, TAG);
}
