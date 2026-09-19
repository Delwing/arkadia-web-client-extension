/**
 * Turns the client's stored log records into the viewer's model.
 *
 * This is the only place that knows about IndexedDB, `session_<ms>` store names
 * or the shape of a stored entry. Everything downstream works on `LogSession`,
 * which is what lets the showcase drive the same viewer from mock data.
 *
 * A stored record is one *message* and may hold several lines of text; the
 * viewer wants lines. Line numbers therefore come from the flattened sequence
 * and stay stable no matter which filters are on.
 */
import {
    attributeCharacters,
    channelForType,
    detectEvent,
    findBannerMarks,
    formatDateLong,
    formatDayLabel,
    type CharacterMark,
    type LogLine,
    type LogSession,
} from "@ui/logViewer";
import { getRawSessionData, splitLines } from "@web/logBrowserUtils";
import { LogsDatabase } from "@web/logsDatabase";
import { collectCharacters } from "@web/options/exportUtils";

/** `session_1758304931000` -> 1758304931000; null for anything else. */
export function sessionStartFromName(name: string): number | null {
    if (!name.startsWith("session_")) return null;
    const value = Number.parseInt(name.slice("session_".length), 10);
    return Number.isNaN(value) ? null : value;
}

const htmlStripper = typeof document === "undefined" ? null : document.createElement("div");

function htmlToText(html: string): string {
    if (!htmlStripper) return html;
    htmlStripper.innerHTML = html;
    const text = htmlStripper.textContent ?? "";
    htmlStripper.textContent = "";
    return text;
}

interface StoredEntry {
    text: string;
    type?: string;
    timestamp: number;
    /**
     * Written by `sessionLogger` on the first record after the character
     * changed, and on nothing else — see `src/web/sessionLogger.ts`.
     */
    character?: string;
}

/**
 * Lines, plus the character marks the logger left among the records.
 *
 * The marks come out here rather than from a second pass because only this
 * function knows how many lines a record turned into, and a mark is a line
 * index.
 */
export function entriesToLines(entries: StoredEntry[]): { lines: LogLine[]; marks: CharacterMark[] } {
    const lines: LogLine[] = [];
    const marks: CharacterMark[] = [];
    for (const entry of entries) {
        if (entry.character) marks.push({ line: lines.length, character: entry.character });
        for (const part of splitLines(entry.text)) {
            const text = htmlToText(part);
            lines.push({
                number: lines.length + 1,
                timestamp: entry.timestamp,
                channel: channelForType(entry.type),
                text,
                html: part === text ? undefined : part,
                event: detectEvent(text, entry.type),
            });
        }
    }
    return { lines, marks };
}

/** Store names holding at least one record, oldest first. */
export async function listSessionStores(db: IDBDatabase): Promise<string[]> {
    const names: string[] = [];
    for (let index = 0; index < db.objectStoreNames.length; index += 1) {
        const name = db.objectStoreNames.item(index);
        if (!name) continue;
        try {
            const request = db.transaction(name, "readonly").objectStore(name).count();
            const count = await new Promise<number>((resolve) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(0);
            });
            if (count > 0) names.push(name);
        } catch {
            // A store that cannot be opened (another tab mid-upgrade) is skipped
            // rather than failing the whole list.
        }
    }
    return names.sort((a, b) => (sessionStartFromName(a) ?? 0) - (sessionStartFromName(b) ?? 0));
}

export interface LoadOptions {
    /** Name of the store currently being written to, if any. */
    liveSessionName?: string;
    now?: number;
    /**
     * Characters this device holds settings for — what an old log's login
     * banner is matched against. Defaults to `collectCharacters()`.
     */
    candidates?: string[];
}

export async function loadSession(
    db: IDBDatabase,
    storeName: string,
    options: LoadOptions = {},
): Promise<LogSession | null> {
    const entries = (await getRawSessionData(db, storeName)) as StoredEntry[];
    if (entries.length === 0) return null;

    const { lines, marks } = entriesToLines(entries);
    if (lines.length === 0) return null;

    // Computed here, on the way out of the store, rather than written back into
    // it: the heuristic below can be improved later without anyone having
    // rewritten a record, and a log is not worth risking for a label. A log
    // recorded before the client stamped names has no marks and never will, so
    // its login banner is read instead — see `model/characters.ts`.
    const candidates = options.candidates ?? collectCharacters();
    const { characters, byLine } = attributeCharacters(
        lines,
        marks.length > 0 ? marks : findBannerMarks(lines, candidates),
    );
    byLine.forEach((character, index) => {
        if (character) lines[index].character = character;
    });

    const now = options.now ?? Date.now();
    const startedAt = sessionStartFromName(storeName) ?? lines[0].timestamp;
    const endedAt = lines[lines.length - 1].timestamp;
    const live = storeName === options.liveSessionName;

    return {
        id: storeName,
        characters,
        dayLabel: formatDayLabel(startedAt, now),
        dateLabel: formatDateLong(startedAt),
        startedAt,
        endedAt,
        live,
        file: `${storeName}.txt`,
        lines,
    };
}

/**
 * Loads every session. Sessions are small enough individually that eager
 * loading keeps cross-log search honest; if that stops being true, the shape to
 * move to is a lines-on-demand `LogSession` with a cached per-session hit count.
 */
export async function loadAllSessions(options: LoadOptions = {}): Promise<LogSession[]> {
    const database = new LogsDatabase();
    const db = await database.get();
    if (!db) return [];

    const names = await listSessionStores(db);
    // One sweep of localStorage for all of them; it does not change under us.
    const withCandidates = { ...options, candidates: options.candidates ?? collectCharacters() };
    const sessions: LogSession[] = [];
    for (const name of names) {
        const session = await loadSession(db, name, withCandidates);
        if (session) sessions.push(session);
    }
    return sessions;
}
