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
    type LogSessionInfo,
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
        lineCount: lines.length,
        lines,
    };
}

// --- The session index ------------------------------------------------------
//
// What the list shows about a log — its characters, span, line count — takes
// reading and parsing every record of it. Done on every opening, that read the
// whole store into memory at once, which a few years of logs do not survive.
// So it is worked out once per log, one log at a time, and kept here. A log is
// read again only when its record count changes, which a finished one never
// does.

/** One log's list entry, as kept in the index. */
interface IndexEntry {
    /** Record count the entry was computed at; a different one means stale. */
    count: number;
    characters: string[];
    startedAt: number;
    endedAt: number;
    background?: string;
    lineCount: number;
    /**
     * The characters were read off login banners (a log from before the
     * client stamped names), so they depend on which characters this device
     * knows — see `IndexFile.candidates`.
     */
    fromBanner?: boolean;
}

interface IndexFile {
    version: 1;
    /** The candidate characters the banner-read entries were matched against. */
    candidates: string;
    entries: Record<string, IndexEntry>;
}

/** Shared by both hosts, like the preferences: they read the same database. */
const INDEX_KEY = "arkadia.logViewer.sessionIndex";

let index: IndexFile | null = null;

function loadIndex(candidates: string): IndexFile {
    if (!index) {
        try {
            const raw = window.localStorage.getItem(INDEX_KEY);
            const parsed = raw ? (JSON.parse(raw) as IndexFile) : null;
            if (parsed && parsed.version === 1 && parsed.entries && typeof parsed.entries === "object") index = parsed;
        } catch {
            // Unreadable: rebuilt below, as on a first opening.
        }
        index ??= { version: 1, candidates, entries: {} };
    }
    if (index.candidates !== candidates) {
        // A character added or removed can change what an old log's banner
        // names; the logs that were stamped are unaffected.
        for (const [name, entry] of Object.entries(index.entries)) {
            if (entry.fromBanner) delete index.entries[name];
        }
        index.candidates = candidates;
    }
    return index;
}

function saveIndex(): void {
    if (!index) return;
    try {
        window.localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch {
        // A full quota costs the next opening a re-read, nothing more.
    }
}

/** Forgets the index in memory, so the next source reads it back from storage. For tests. */
export function resetSessionIndex(): void {
    index = null;
}

function indexEntry(session: LogSession, count: number, entries: StoredEntry[]): IndexEntry {
    return {
        count,
        characters: session.characters,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        background: session.background,
        lineCount: session.lines.length,
        fromBanner: session.characters.length > 0 && !entries.some((entry) => entry.character),
    };
}

function infoFromEntry(name: string, entry: IndexEntry, options: LoadOptions, now: number): LogSessionInfo {
    return {
        id: name,
        characters: entry.characters,
        dayLabel: formatDayLabel(entry.startedAt, now),
        dateLabel: formatDateLong(entry.startedAt),
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        live: name === options.liveSessionName,
        file: `${name}.txt`,
        background: entry.background,
        lineCount: entry.lineCount,
    };
}

// --- Reading the store -------------------------------------------------------

function storeNames(db: IDBDatabase): string[] {
    return Array.from(db.objectStoreNames).sort(
        (a, b) => (sessionStartFromName(a) ?? 0) - (sessionStartFromName(b) ?? 0),
    );
}

/** Record counts of the stores, in one transaction; a store that cannot be read is left out. */
function countStores(db: IDBDatabase, names: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (names.length === 0) return Promise.resolve(counts);
    return new Promise((resolve) => {
        let tx: IDBTransaction;
        try {
            tx = db.transaction(names, "readonly");
        } catch {
            if (names.length === 1) {
                resolve(counts);
                return;
            }
            // A store vanished under us (deleted in another tab): count the
            // others one by one rather than losing them all.
            void Promise.all(names.map((name) => countStores(db, [name]))).then((parts) => {
                for (const part of parts) part.forEach((value, key) => counts.set(key, value));
                resolve(counts);
            });
            return;
        }
        for (const name of names) {
            const request = tx.objectStore(name).count();
            request.onsuccess = () => counts.set(name, request.result);
        }
        tx.oncomplete = () => resolve(counts);
        tx.onerror = () => resolve(counts);
        tx.onabort = () => resolve(counts);
    });
}

/** Lets the page paint and handle input between logs. */
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** How often the growing list is handed over while the rest are indexed. */
const UPDATE_EVERY_MS = 400;

/**
 * Parsed logs kept by one source, by line count. Enough for the open log and
 * a good few around it — and for a small store, all of it, so a search across
 * every log stays instant there — without ever growing with the store.
 */
const CACHED_LINES = 200_000;

export interface ListProgress {
    done: number;
    total: number;
}

export interface SessionSource {
    /**
     * Every log's list entry, oldest first. The `priority` logs and the newest
     * come first and go to `onUpdate` at once, so the viewer can open; the rest
     * follow newest to oldest. Stops early, with what it has, once `signal`
     * aborts.
     */
    list(
        onUpdate?: (sessions: LogSessionInfo[], progress: ListProgress) => void,
        signal?: AbortSignal,
    ): Promise<LogSessionInfo[]>;
    /** One log with its lines; null when it is gone or empty. */
    load(id: string): Promise<LogSession | null>;
    /** Drops the cached logs and the database connection. */
    release(): void;
}

/**
 * The adapter a host holds while its viewer is open. Only a bounded number of
 * logs is ever parsed in memory at once, however large the store; everything
 * is let go on `release`, which the host calls when its window closes.
 */
export function createSessionSource(options: LoadOptions = {}): SessionSource {
    const database = new LogsDatabase();
    // One sweep of localStorage for every log; it does not change under us.
    const candidates = options.candidates ?? collectCharacters();
    const parseOptions: LoadOptions = { ...options, candidates };
    const candidatesKey = [...candidates].sort().join("|");

    const cache = new Map<string, { count: number; session: LogSession | null }>();
    let cachedLines = 0;
    const inFlight = new Map<string, Promise<LogSession | null>>();
    /** Set by `release`: a late call must not reopen the connection and hold it. */
    let released = false;

    const remember = (name: string, count: number, session: LogSession | null) => {
        const previous = cache.get(name);
        if (previous) {
            cachedLines -= previous.session?.lines.length ?? 0;
            cache.delete(name);
        }
        cache.set(name, { count, session });
        cachedLines += session?.lines.length ?? 0;
        // Oldest-used first, as a Map keeps insertion order; the one just
        // added stays even when it alone is over the budget.
        for (const [key, value] of cache) {
            if (cachedLines <= CACHED_LINES || key === name) break;
            cache.delete(key);
            cachedLines -= value.session?.lines.length ?? 0;
        }
    };

    /** Reads and parses one store, and brings its index entry up to date. */
    const readAndParse = async (db: IDBDatabase, name: string): Promise<LogSession | null> => {
        const entries = (await getRawSessionData(db, name)) as StoredEntry[];
        const session = parseSession(name, entries, parseOptions);
        const file = loadIndex(candidatesKey);
        if (session) file.entries[name] = indexEntry(session, entries.length, entries);
        else delete file.entries[name];
        remember(name, entries.length, session);
        return session;
    };

    const load = async (id: string): Promise<LogSession | null> => {
        if (released) return null;
        const db = await database.get();
        if (!db || !db.objectStoreNames.contains(id)) return null;
        const count = (await countStores(db, [id])).get(id);
        if (!count) return null;
        const cached = cache.get(id);
        if (cached && cached.count === count) {
            // Touched: to the back of the eviction order.
            cache.delete(id);
            cache.set(id, cached);
            return cached.session;
        }
        const session = await readAndParse(db, id);
        saveIndex();
        return session;
    };

    return {
        async list(onUpdate, signal) {
            if (released) return [];
            const db = await database.get();
            if (!db) return [];
            const names = storeNames(db);
            const counts = await countStores(db, names);
            const file = loadIndex(candidatesKey);
            // Stores that are gone (deleted, or replaced by an import) leave the index.
            for (const name of Object.keys(file.entries)) {
                if (!counts.has(name)) delete file.entries[name];
            }

            const now = options.now ?? Date.now();
            const listed = new Map<string, LogSessionInfo>();
            const present = names.filter((name) => (counts.get(name) ?? 0) > 0);
            const wanted = new Set<string | undefined>([...(options.priority ?? []), present[present.length - 1]]);
            const first = present.filter((name) => wanted.has(name));
            const order = [...first, ...present.filter((name) => !wanted.has(name)).reverse()];
            const list = () => present.flatMap((name) => listed.get(name) ?? []);

            let lastUpdate = performance.now();
            for (let position = 0; position < order.length; position += 1) {
                if (signal?.aborted || released) break;
                const name = order[position];
                const known = file.entries[name];
                if (known && known.count === counts.get(name)) {
                    listed.set(name, infoFromEntry(name, known, options, now));
                } else {
                    const session = await readAndParse(db, name);
                    if (session) listed.set(name, infoFromEntry(name, file.entries[name], options, now));
                    // Reading a log is the slow part; let the page breathe.
                    await yieldToBrowser();
                }
                const firstBatchDone = position === first.length - 1;
                if (onUpdate && (firstBatchDone || performance.now() - lastUpdate > UPDATE_EVERY_MS)) {
                    onUpdate(list(), { done: position + 1, total: order.length });
                    saveIndex();
                    lastUpdate = performance.now();
                }
            }
            saveIndex();
            return list();
        },

        load(id) {
            // Two callers asking at once (the open log and a search) share one read.
            let pending = inFlight.get(id);
            if (!pending) {
                pending = load(id).finally(() => inFlight.delete(id));
                inFlight.set(id, pending);
            }
            return pending;
        },

        release() {
            released = true;
            cache.clear();
            cachedLines = 0;
            database.release();
        },
    };
}
