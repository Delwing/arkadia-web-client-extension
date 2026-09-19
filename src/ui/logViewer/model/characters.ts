/**
 * Which character a log belongs to.
 *
 * A session does not have exactly one. The log runs from page load to page
 * close, and a player can re-log in between; a session that never reached the
 * game has no character at all. Attribution is therefore a LIST, in the order
 * the names appeared, and an empty one is a normal result rather than a failure.
 *
 * Two sources feed it, and they differ only in how the marks are found:
 *
 * 1. **Marks recorded while logging.** `sessionLogger` stamps the name
 *    `PlayerIdentity` settled on onto the next line it writes. Exact, and only
 *    in logs recorded after that landed.
 * 2. **The login banner**, matched against the characters this device holds
 *    settings for. Old logs carry no GMCP and never will, so the banner is the
 *    only trace of who was playing; see `matchCharacter` for why that is a
 *    recognition problem rather than a declension one.
 *
 * Both produce a mark at a line index, and everything below this point treats
 * the two the same way.
 *
 * Patterns stay ASCII — Arkadia sends diacritic-free Polish (see AGENTS.md).
 */
import type { LogLine } from "./types";

/**
 * The one normalisation applied to a name anywhere: GMCP sends `dargoth`, and
 * `localStorage` keys carry whatever case was stored with them. Names are
 * single words here, which is what makes this safe.
 */
export function titleCase(name: string): string {
    if (!name) return name;
    return name[0].toUpperCase() + name.slice(1).toLowerCase();
}

/** `Witaj, Dargocie. Podaj swe haslo:` — the game's own login banner. */
const LOGIN_BANNER = /^Witaj, ([A-Za-z]+)\./;

/** The name as the banner spells it — a vocative, so never shown to anyone. */
export function loginBannerToken(text: string): string | null {
    const match = LOGIN_BANNER.exec(text);
    return match ? match[1] : null;
}

/**
 * Shortest common prefix worth believing. Below three letters almost any two
 * Polish names agree, and the point of this module is to stay silent rather
 * than to guess.
 */
const MIN_PREFIX = 3;

/**
 * How much of the candidate the shared prefix has to cover. Declension changes
 * the ending and leaves the stem, so a genuine hit keeps most of the name:
 * `Dargoth`/`Dargocie` share 5 of 7, `Kethra`/`Kethro` 5 of 6.
 */
const MIN_COVERAGE = 0.6;

/** How far ahead of every other candidate the winner has to be. */
const MIN_MARGIN = 2;

function commonPrefixLength(a: string, b: string): number {
    const limit = Math.min(a.length, b.length);
    let length = 0;
    while (length < limit && a[length] === b[length]) length += 1;
    return length;
}

/**
 * Which known character the banner was addressing, or null.
 *
 * The banner greets in the vocative (`Dargocie`), and generating Polish
 * declension is hard — but nothing here generates anything. The candidates are
 * the characters this device has settings for, a small closed set, so the job
 * is to RECOGNISE one of them: declension changes the ending and keeps the
 * stem, so the longest common prefix picks the right one out of a handful of
 * names without a single declension table.
 *
 * A wrong name on a log is worse than no name, so the winner has to beat every
 * other candidate by a clear margin and the shared prefix has to be a real part
 * of the name. Two characters sharing a stem (`Dargoth`, `Dargon`) leave the
 * log unattributed on purpose.
 *
 * The returned name is the CANDIDATE's, never the token: the token is a
 * vocative, and the candidate is the nominative we are looking for.
 */
export function matchCharacter(token: string, candidates: readonly string[]): string | null {
    const needle = token.toLowerCase();
    if (needle.length < MIN_PREFIX) return null;

    // Storage can hold the same character under two spellings of case; scoring
    // both would read as an ambiguity and lose a name we actually know.
    const unique = new Map<string, string>();
    for (const candidate of candidates) {
        const key = candidate.toLowerCase();
        if (key && !unique.has(key)) unique.set(key, candidate);
    }

    let best: string | null = null;
    let bestScore = 0;
    let runnerUp = 0;
    for (const [key, candidate] of unique) {
        const score = commonPrefixLength(needle, key);
        if (score > bestScore) {
            runnerUp = bestScore;
            bestScore = score;
            best = candidate;
        } else if (score > runnerUp) {
            runnerUp = score;
        }
    }

    if (!best) return null;
    if (bestScore < MIN_PREFIX) return null;
    if (bestScore < best.length * MIN_COVERAGE) return null;
    if (bestScore - runnerUp < MIN_MARGIN) return null;
    return titleCase(best);
}

/** A name becoming current at a line of the session. */
export interface CharacterMark {
    /** Index into the session's lines. */
    line: number;
    character: string;
}

export interface Attribution {
    /** Characters in order of first appearance; empty when none was identified. */
    characters: string[];
    /** The character in force on each line, by line index. */
    byLine: (string | undefined)[];
}

/**
 * How far back a mark may move onto the login that produced it.
 *
 * A mark recorded from GMCP lands on the first line written after the game said
 * who we are, which is a moment after the banner the player actually sees. The
 * timeline marks the banner, so the name has to travel back to it or the marker
 * stays anonymous. Generous, because the wait at the password prompt is the
 * player's, and nothing is written to the log while it lasts.
 */
const SNAP_BACK_MS = 300_000;

/**
 * The earliest login line within the snap window, or the mark's own line.
 *
 * `floor` is where the previous name ends: a mark may never travel back over
 * the one before it, or a re-login would take its predecessor's lines with it.
 */
function snapToLogin(lines: readonly LogLine[], index: number, floor: number): number {
    const limit = lines[index].timestamp - SNAP_BACK_MS;
    let snapped = index;
    for (let i = index; i >= floor; i -= 1) {
        if (lines[i].timestamp < limit) break;
        if (lines[i].event === "login") snapped = i;
    }
    return snapped;
}

/**
 * Spreads marks over the session's lines.
 *
 * The first name reaches back to the start of the log: the lines before it are
 * the login that produced it, not somebody else's play. Every later name holds
 * from its own mark until the next one.
 */
export function attributeCharacters(lines: readonly LogLine[], marks: readonly CharacterMark[]): Attribution {
    const byLine = new Array<string | undefined>(lines.length).fill(undefined);
    if (lines.length === 0 || marks.length === 0) return { characters: [], byLine };

    let floor = 0;
    const ordered = marks
        .filter((mark) => mark.character && mark.line >= 0 && mark.line < lines.length)
        .sort((a, b) => a.line - b.line)
        .map((mark) => {
            const line = Math.max(floor, snapToLogin(lines, mark.line, floor));
            floor = line + 1;
            return { line, character: titleCase(mark.character) };
        });

    // Consecutive repeats are not switches: a death and respawn re-announces the
    // same character, and so does a log that stamps a name it had already seen.
    const spans = ordered.filter((mark, index) => index === 0 || mark.character !== ordered[index - 1].character);
    if (spans.length === 0) return { characters: [], byLine };

    for (let index = 0; index < spans.length; index += 1) {
        const from = index === 0 ? 0 : spans[index].line;
        const to = index + 1 < spans.length ? spans[index + 1].line : lines.length;
        for (let line = from; line < to; line += 1) byLine[line] = spans[index].character;
    }

    const characters: string[] = [];
    for (const span of spans) {
        if (!characters.includes(span.character)) characters.push(span.character);
    }
    return { characters, byLine };
}

/**
 * Marks read out of an already recorded log — the second level, for sessions
 * that predate the GMCP stamp. `candidates` is what `collectCharacters()`
 * found in `localStorage`; with none of them, nothing is attributed.
 */
export function findBannerMarks(lines: readonly LogLine[], candidates: readonly string[]): CharacterMark[] {
    if (candidates.length === 0) return [];
    const marks: CharacterMark[] = [];
    lines.forEach((line, index) => {
        const token = loginBannerToken(line.text);
        if (!token) return;
        const character = matchCharacter(token, candidates);
        if (character) marks.push({ line: index, character });
    });
    return marks;
}

/** What to call a session: its characters, or the label it falls back to. */
export function charactersLabel(characters: readonly string[], fallback: string): string {
    return characters.length > 0 ? characters.join(", ") : fallback;
}
