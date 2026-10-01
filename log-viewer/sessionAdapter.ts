/**
 * Turns the client's stored log records into the viewer's model.
 *
 * This is the only reader that knows about the log database
 * (`@web/logsDatabase`), `session_<ms>` session ids or the shape of a stored
 * entry. Everything downstream works on `LogSession`,
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
import { splitLines } from "@web/logBrowserUtils";
import { countSession, countSessions, LogsDatabase, readSession, type StoredLogEntry } from "@web/logsDatabase";
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

type StoredEntry = StoredLogEntry;

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

function byStart(a: string, b: string): number {
    return (sessionStartFromName(a) ?? 0) - (sessionStartFromName(b) ?? 0);
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
     * Every log's list entry, oldest first. The `priority` logs go to
     * `onUpdate` before the rest of the store is so much as counted (with a
     * `total` of 0, as it is not known yet), so the viewer can open on them; the
     * newest log follows, then the rest newest to oldest. Stops early, with
     * what it has, once `signal` aborts.
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

    /**
     * The open connection, asked for before each use: it is let go of when the
     * database is deleted under us, and the next ask reopens it.
     */
    const connection = async (): Promise<IDBDatabase | null> => (released ? null : database.get());

    /** Reads and parses one session, and brings its index entry up to date. */
    const readAndParse = async (name: string): Promise<LogSession | null> => {
        const db = await connection();
        if (!db) return null;
        const entries = await readSession(db, name);
        const session = parseSession(name, entries, parseOptions);
        const file = loadIndex(candidatesKey);
        if (session) file.entries[name] = indexEntry(session, entries.length, entries);
        else delete file.entries[name];
        remember(name, entries.length, session);
        return session;
    };

    const load = async (id: string): Promise<LogSession | null> => {
        const db = await connection();
        if (!db) return null;
        const count = await countSession(db, id);
        if (!count) return null;
        const cached = cache.get(id);
        if (cached && cached.count === count) {
            // Touched: to the back of the eviction order.
            cache.delete(id);
            cache.set(id, cached);
            return cached.session;
        }
        const session = await readAndParse(id);
        saveIndex();
        return session;
    };

    return {
        async list(onUpdate, signal) {
            const db = await connection();
            if (!db) return [];
            const file = loadIndex(candidatesKey);
            const now = options.now ?? Date.now();
            const listed = new Map<string, LogSessionInfo>();

            /** Lists one log, from the index when it is current, else by reading it. */
            const listOne = async (name: string, count: number) => {
                const known = file.entries[name];
                if (known && known.count === count) {
                    listed.set(name, infoFromEntry(name, known, options, now));
                    return;
                }
                try {
                    const session = await readAndParse(name);
                    if (session) listed.set(name, infoFromEntry(name, file.entries[name], options, now));
                } catch (error) {
                    // One log that cannot be read is left out of this listing,
                    // not out of the rest: it is still stored, and its index
                    // entry stays for the next opening.
                    console.error(`[Logs] Failed to read ${name}:`, error);
                }
                // Reading a log is the slow part; let the page breathe.
                await yieldToBrowser();
            };

            // The `priority` logs are listed before the rest of the store is
            // even counted: counting walks every record, which on years of logs
            // is a wait of its own, and the log being recorded is the one a
            // player opens the window for. The total is not known yet.
            for (const name of new Set(options.priority ?? [])) {
                if (signal?.aborted || released) break;
                if (!name) continue;
                const count = await countSession(db, name);
                if (count > 0) await listOne(name, count);
            }
            onUpdate?.(
                [...listed.keys()].sort(byStart).map((name) => listed.get(name)!),
                { done: listed.size, total: 0 },
            );
            if (signal?.aborted || released) return [...listed.values()];

            const counts = await countSessions(db);
            const names = [...counts.keys()].sort(byStart);
            // Sessions that are gone (deleted, or replaced by an import) leave the index.
            for (const name of Object.keys(file.entries)) {
                if (!counts.has(name)) delete file.entries[name];
            }

            const present = names.filter((name) => (counts.get(name) ?? 0) > 0);
            // Not twice: the log being recorded has grown since it was listed
            // above, and reading it again would only be the same log.
            const pending = present.filter((name) => !listed.has(name));
            const newest = present[present.length - 1];
            const first = pending.filter((name) => name === newest);
            const order = [...first, ...pending.filter((name) => name !== newest).reverse()];
            const list = () => present.flatMap((name) => listed.get(name) ?? []);
            const alreadyListed = present.length - pending.length;

            let lastUpdate = performance.now();
            for (let position = 0; position < order.length; position += 1) {
                if (signal?.aborted || released) break;
                const name = order[position];
                await listOne(name, counts.get(name) ?? 0);
                const firstBatchDone = position === first.length - 1;
                if (onUpdate && (firstBatchDone || performance.now() - lastUpdate > UPDATE_EVERY_MS)) {
                    onUpdate(list(), { done: alreadyListed + position + 1, total: present.length });
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
