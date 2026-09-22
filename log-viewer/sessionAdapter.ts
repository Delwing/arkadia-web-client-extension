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

const NAMED_ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
};

const htmlStripper = typeof document === "undefined" ? null : document.createElement("template");

/**
 * The text of one stored line. The logger writes plain spans and entities, so
 * tags are dropped and entities decoded with string work: this runs for every
 * line of every log, and parsing each one as DOM was most of the load time.
 * An entity outside the common few goes through an inert \`<template>\`.
 */
export function htmlToText(html: string): string {
    if (html.indexOf("<") === -1 && html.indexOf("&") === -1) return html;
    const stripped = html.replace(/<[^>]*>/g, "");
    if (stripped.indexOf("&") === -1) return stripped;
    return stripped.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (entity, body: string) => {
        if (body[0] === "#") {
            const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
        }
        const known = NAMED_ENTITIES[body];
        if (known !== undefined) return known;
        if (!htmlStripper) return entity;
        htmlStripper.innerHTML = entity;
        return htmlStripper.content.textContent ?? entity;
    });
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
    /** Written by `sessionLogger` on the first record after the output background changed. */
    background?: string;
}

/** The output background the session was last recorded with, if it says. */
export function recordedBackground(entries: StoredEntry[]): string | undefined {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const background = entries[index].background;
        if (typeof background === "string" && background) return background;
    }
    return undefined;
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
    /**
     * Sessions to read before the rest, besides the newest: the one the viewer
     * opens on. They arrive in the first update, so it can open at once.
     */
    priority?: (string | undefined)[];
}

/** One stored session's records, parsed into the viewer's model. Null when it holds no lines. */
export function parseSession(storeName: string, entries: StoredEntry[], options: LoadOptions = {}): LogSession | null {
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
        background: recordedBackground(entries),
        lines,
    };
}

export async function loadSession(
    db: IDBDatabase,
    storeName: string,
    options: LoadOptions = {},
): Promise<LogSession | null> {
    const entries = (await getRawSessionData(db, storeName)) as StoredEntry[];
    return parseSession(storeName, entries, options);
}

/**
 * Parsed sessions, kept between openings of the window. A finished log never
 * changes, so one whose record count is what it was is not read or parsed
 * again; only the one still being written to is.
 */
const parsedCache = new Map<string, { count: number; session: LogSession | null }>();

/** What one store holds: the cached parse when its count still matches, else its records. */
type StoreRead =
    | { count: number; session: LogSession | null }
    | { count: number; entries: StoredEntry[] };

/**
 * Reads several stores in ONE transaction, every request in flight together:
 * the count first, and the records only for a store the cache cannot answer.
 */
function readStores(db: IDBDatabase, names: string[]): Promise<Map<string, StoreRead>> {
    const result = new Map<string, StoreRead>();
    if (names.length === 0) return Promise.resolve(result);
    return new Promise((resolve) => {
        let tx: IDBTransaction;
        try {
            tx = db.transaction(names, "readonly");
        } catch {
            if (names.length === 1) {
                resolve(result);
                return;
            }
            // A store vanished under us (deleted in another tab): read the
            // others one by one rather than losing them all.
            void Promise.all(names.map((name) => readStores(db, [name]))).then((parts) => {
                for (const part of parts) part.forEach((value, key) => result.set(key, value));
                resolve(result);
            });
            return;
        }
        for (const name of names) {
            const store = tx.objectStore(name);
            const counting = store.count();
            counting.onsuccess = () => {
                const count = counting.result;
                const known = parsedCache.get(name);
                if (known && known.count === count) {
                    result.set(name, { count, session: known.session });
                    return;
                }
                if (count === 0) return;
                const reading = store.getAll();
                reading.onsuccess = () => {
                    result.set(name, { count, entries: reading.result as StoredEntry[] });
                };
            };
        }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => resolve(result);
        tx.onabort = () => resolve(result);
    });
}

/** Lets the page paint and handle input between slices of parsing. */
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** How long one slice of parsing may hold the main thread. */
const PARSE_SLICE_MS = 40;
/** How often the growing list is handed over while the rest parse. */
const UPDATE_EVERY_MS = 400;

/**
 * Loads every session, oldest first.
 *
 * The newest session and the `priority` ones come first and go to `onUpdate`
 * straight away, so the viewer opens on them; the rest follow, newest to
 * oldest, parsed in slices that leave the page responsive, the growing list
 * handed over now and then. A past session that has not changed comes from
 * the cache. The promise resolves with the full list.
 */
export async function loadAllSessions(
    options: LoadOptions = {},
    onUpdate?: (sessions: LogSession[]) => void,
): Promise<LogSession[]> {
    const database = new LogsDatabase();
    let names: string[] = [];
    let firstNames: string[] = [];
    let first = new Map<string, StoreRead>();
    let rest = new Map<string, StoreRead>();
    try {
        const db = await database.get();
        if (!db) return [];
        names = Array.from(db.objectStoreNames).sort(
            (a, b) => (sessionStartFromName(a) ?? 0) - (sessionStartFromName(b) ?? 0),
        );
        const wanted = new Set<string | undefined>([...(options.priority ?? []), names[names.length - 1]]);
        firstNames = names.filter((name) => wanted.has(name));
        first = await readStores(db, firstNames);
        rest = await readStores(db, names.filter((name) => !wanted.has(name)));
    } finally {
        // Everything is in memory by now, so the connection has no further use
        // — and a held one makes the next tab that starts logging wait for a
        // `versionchange` round trip before it can create its store.
        database.release();
    }

    // Stores that are gone (deleted, or replaced by an import) leave the cache.
    for (const name of Array.from(parsedCache.keys())) {
        if (!names.includes(name)) parsedCache.delete(name);
    }

    // One sweep of localStorage for all of them; it does not change under us.
    const parseOptions: LoadOptions = { ...options, candidates: options.candidates ?? collectCharacters() };
    const now = parseOptions.now ?? Date.now();
    const parsed = new Map<string, LogSession>();
    const take = (name: string, read: StoreRead | undefined) => {
        if (!read) return;
        let session: LogSession | null;
        if (!("entries" in read)) {
            // The day label and the live flag depend on today and on which tab asks.
            session = read.session && {
                ...read.session,
                live: name === options.liveSessionName,
                dayLabel: formatDayLabel(read.session.startedAt, now),
            };
        } else {
            session = parseSession(name, read.entries, parseOptions);
            parsedCache.set(name, { count: read.count, session });
        }
        if (session) parsed.set(name, session);
    };
    const list = () => names.flatMap((name) => parsed.get(name) ?? []);

    for (const name of firstNames) take(name, first.get(name));
    if (onUpdate && parsed.size > 0) onUpdate(list());

    let sliceStart = performance.now();
    let lastUpdate = sliceStart;
    const remaining = names.filter((name) => rest.has(name)).reverse();
    for (const name of remaining) {
        take(name, rest.get(name));
        if (!onUpdate || performance.now() - sliceStart < PARSE_SLICE_MS) continue;
        if (performance.now() - lastUpdate > UPDATE_EVERY_MS) {
            onUpdate(list());
            lastUpdate = performance.now();
        }
        await yieldToBrowser();
        sliceStart = performance.now();
    }
    return list();
}
