/**
 * Sends the player's zlom list and the odmiany they saw to the crowd Worker,
 * once they opt in (BehaviorSettings.crowdContribute).
 *
 * There is no separate "first upload": every sync hashes everything held
 * locally, skips what this browser already sent, asks the Worker which of the
 * rest it wants, and sends only those. On opt-in that is the whole list; after
 * that it is whatever was evaluated or declined since.
 *
 * Best-effort throughout. A Worker that is down, a quota that ran out or a
 * record the Worker rejects never surfaces in the middle of play; the next
 * change, or the next session, tries again.
 */

import { getBehaviorSettings, onBehaviorSettingsChange } from '@modules/core/settings';
import { ensureZlomLoaded, getZlomSnapshot, subscribeZlom, type ZlomEntry } from '@modules/data/zlomStore';
import { ensureOdmianaLoaded, getOdmianaSnapshot, subscribeOdmiana } from '@modules/data/odmianaStore';
import { getFromIndexedDB, storeInIndexedDB, type IndexedDBConfig } from '@client/utils/dataCache';
import { characterStorage, globalStorage } from '@modules/core/storage';
import { CROWD_WORKER_URL } from './crowdConfig';
import {
    clearCrowdCredentials,
    loadCrowdCredentials,
    loadRetiredCrowdCredentials,
    saveCrowdCredentials,
    saveRetiredCrowdCredentials,
    type CrowdCredentials,
} from './crowdCredentials';
import { canonicalize, hashRecord, type CrowdKind } from './crowdRecords';

/** Must match the Worker's MAX_HAVE_HASHES and MAX_SUBMIT_ITEMS. */
const HAVE_CHUNK = 5000;
const SUBMIT_CHUNK = 500;

/** Quiet time after a change before syncing, so an evaluating spree is one request. */
const DEBOUNCE_MS = 30_000;
/** After a refusal (quota, rate limit, Worker down), wait this long before trying again. */
const BACKOFF_MS = 60 * 60_000;

/**
 * What this browser has sent, by hash. The key carries a generation: when the
 * Worker's data is reset, bumping it makes every client ask again once, which
 * costs reads. A record whose hash did not change with the reset (an odmiana,
 * when items moved to being keyed by name) would otherwise never be re-sent.
 */
const SENT_CONFIG: IndexedDBConfig = { dbName: 'ArkadiaCrowd', storeName: 'crowd', key: 'sent-3' };
/** Ignores the player brought back in the armour window, to take back from the crowd list on the next pass. */
const WITHDRAW_CONFIG: IndexedDBConfig = { dbName: 'ArkadiaCrowd', storeName: 'crowd', key: 'withdraw' };

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

interface PreparedItem {
    hash: string;
    kind: CrowdKind;
    record: Record<string, string | number>;
}

const ZLOM_KINDS: [keyof ReturnType<typeof getZlomSnapshot>, CrowdKind][] = [
    ['bronie', 'bron'],
    ['tarcze', 'tarcza'],
    ['zbroje', 'zbroja'],
    ['ubrania', 'ubranie'],
    ['dodatki', 'dodatek'],
];

/**
 * An `iLine` is typed by the player and may carry Polish letters the game
 * never sends. The Worker would refuse the whole record for it; dropping just
 * the line keeps the item.
 */
function shareable(entry: ZlomEntry): ZlomEntry {
    const iLine = (entry as { iLine?: string }).iLine;
    if (iLine === undefined || PRINTABLE_ASCII.test(iLine)) return entry;
    const { iLine: _, ...rest } = entry as ZlomEntry & { iLine?: string };
    return rest as ZlomEntry;
}

/** Every local record that can be shared, canonical and hashed. */
export async function prepareItems(): Promise<PreparedItem[]> {
    await Promise.all([ensureZlomLoaded(), ensureOdmianaLoaded()]);
    const sources: [CrowdKind, unknown][] = [];
    const zlom = getZlomSnapshot();
    for (const [group, kind] of ZLOM_KINDS) {
        for (const entry of zlom[group]) {
            const item = shareable(entry);
            sources.push([kind, item]);
            // Only a name that differs says anything. Voted on apart from the item, so knowing them adds to it rather than
            // splitting it from the players who do not (crowdRecords.ts says more)
            if (item.shortAlt && item.shortAlt.toLowerCase() !== item.short.toLowerCase()) sources.push(['altname', { item: kind, short: item.short, shortAlt: item.shortAlt }]);
            const iLine = (item as { iLine?: string }).iLine;
            if (iLine && kind !== 'bron') sources.push(['iline', { item: kind, short: item.short, iLine }]);
        }
    }
    for (const odmiana of Object.values(getOdmianaSnapshot())) sources.push(['odmiana', odmiana]);
    // What this character told the armour window to leave alone (a guild or club item)
    for (const text of characterStorage.get('worn_armor')?.ignored ?? []) sources.push(['ignorowany', { text }]);

    const items: PreparedItem[] = [];
    const seen = new Set<string>();
    for (const [kind, raw] of sources) {
        const result = canonicalize(kind, raw);
        if (!result.ok) continue;
        const hash = await hashRecord(result.record);
        if (seen.has(hash)) continue;
        seen.add(hash);
        items.push({ hash, kind, record: result.record.payload });
    }
    return items;
}

async function loadSent(): Promise<Set<string>> {
    try {
        const stored = await getFromIndexedDB<{ hashes?: string[] }>(SENT_CONFIG);
        return new Set(Array.isArray(stored?.hashes) ? stored.hashes : []);
    } catch {
        return new Set();
    }
}

async function saveSent(sent: Set<string>): Promise<void> {
    try {
        await storeInIndexedDB(SENT_CONFIG, { hashes: [...sent] });
    } catch (e) {
        console.warn('[crowd] could not remember sent records', e);
    }
}

type CallResult = { ok: boolean; status: number; data: Record<string, unknown> };

async function call(path: string, body: unknown, credentials?: CrowdCredentials): Promise<CallResult> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credentials) headers.authorization = `Bearer ${credentials.contributorId}.${credentials.secret}`;
    try {
        const response = await fetch(`${CROWD_WORKER_URL}${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        return { ok: response.ok, status: response.status, data };
    } catch {
        return { ok: false, status: 0, data: {} };
    }
}

async function ensureCredentials(): Promise<CrowdCredentials | null> {
    const existing = loadCrowdCredentials();
    if (existing) return existing;
    const result = await call('/crowd/register', {});
    const { contributorId, secret } = result.data as Partial<CrowdCredentials>;
    if (!result.ok || typeof contributorId !== 'string' || typeof secret !== 'string') return null;
    const credentials = { contributorId, secret };
    saveCrowdCredentials(credentials);
    return credentials;
}

export type SyncOutcome =
    | { status: 'done'; sent: number }
    | { status: 'off' }
    | { status: 'failed'; reason: 'register' | 'refused' | 'network' };

/**
 * Hand the Worker the credentials this browser held before sync brought the
 * one another device registered, so the player counts once. Kept for the next
 * pass when the Worker cannot be reached.
 */
async function mergeRetired(): Promise<void> {
    const retired = loadRetiredCrowdCredentials();
    const credentials = loadCrowdCredentials();
    if (!retired.length || !credentials) return;
    const left: CrowdCredentials[] = [];
    for (const old of retired) {
        if (old.contributorId === credentials.contributorId) continue;
        const result = await call('/crowd/merge', old, credentials);
        if (!result.ok) left.push(old);
    }
    saveRetiredCrowdCredentials(left);
}

async function loadWithdrawals(): Promise<string[]> {
    try {
        const stored = await getFromIndexedDB<{ texts?: string[] }>(WITHDRAW_CONFIG);
        return Array.isArray(stored?.texts) ? stored.texts : [];
    } catch {
        return [];
    }
}

async function saveWithdrawals(texts: string[]): Promise<void> {
    try {
        await storeInIndexedDB(WITHDRAW_CONFIG, { texts });
    } catch (e) {
        console.warn('[crowd] could not remember what to take back', e);
    }
}

/**
 * Take an ignore back from the crowd list: the player brought it back in the
 * armour window, so their vote should not keep it hidden for everyone else.
 * Sent with the next pass.
 */
export async function withdrawCrowdIgnore(text: string): Promise<void> {
    const texts = await loadWithdrawals();
    if (!texts.includes(text)) await saveWithdrawals([...texts, text]);
}

/**
 * Send the queued withdrawals. What the Worker took back is no longer sent,
 * so ignoring it again (here or on another character) votes again.
 */
async function sendWithdrawals(sent: Set<string>): Promise<void> {
    const queued = await loadWithdrawals();
    if (!queued.length) return;
    const ignored = characterStorage.get('worn_armor')?.ignored ?? [];
    const credentials = loadCrowdCredentials();
    const hashes: string[] = [];
    // Ignored again since: the vote stands
    for (const text of queued.filter(text => !ignored.includes(text))) {
        const result = canonicalize('ignorowany', { text });
        if (result.ok) hashes.push(await hashRecord(result.record));
    }
    if (hashes.length && credentials) {
        const result = await call('/crowd/withdraw', { hashes }, credentials);
        // Kept for the next pass, unless the Worker does not know this credential: then nothing of it is left to take back
        if (!result.ok && result.status !== 401) return;
        hashes.forEach(hash => sent.delete(hash));
        await saveSent(sent);
    }
    // Queued meanwhile: left for the next pass
    const left = (await loadWithdrawals()).filter(text => !queued.includes(text));
    await saveWithdrawals(left);
}

/** One pass: send whatever the Worker wants and this browser has not sent. */
export async function syncOnce(): Promise<SyncOutcome> {
    if (!getBehaviorSettings().crowdContribute) return { status: 'off' };
    await mergeRetired();

    const sent = await loadSent();
    await sendWithdrawals(sent);
    const pending = (await prepareItems()).filter(item => !sent.has(item.hash));
    if (!pending.length) return { status: 'done', sent: 0 };

    let credentials = await ensureCredentials();
    if (!credentials) return { status: 'failed', reason: 'register' };

    let total = 0;
    const unsent = new Set<string>();
    for (let offset = 0; offset < pending.length; offset += HAVE_CHUNK) {
        const chunk = pending.slice(offset, offset + HAVE_CHUNK);
        let have = await call('/crowd/have', { hashes: chunk.map(item => item.hash) }, credentials);
        if (have.status === 401) {
            // The Worker no longer knows this credential (its database was
            // reset, say). A new one costs nothing; the old one is useless.
            clearCrowdCredentials();
            credentials = await ensureCredentials();
            if (!credentials) return { status: 'failed', reason: 'register' };
            have = await call('/crowd/have', { hashes: chunk.map(item => item.hash) }, credentials);
        }
        if (!have.ok) return { status: 'failed', reason: have.status ? 'refused' : 'network' };

        const wanted = new Set(Array.isArray(have.data.wanted) ? (have.data.wanted as string[]) : []);
        const toSend = chunk.filter(item => wanted.has(item.hash));
        for (let start = 0; start < toSend.length; start += SUBMIT_CHUNK) {
            const batch = toSend.slice(start, start + SUBMIT_CHUNK);
            const submit = await call(
                '/crowd/submit',
                { items: batch.map(({ kind, record }) => ({ kind, record })) },
                credentials,
            );
            if (!submit.ok) {
                await saveSent(sent);
                return { status: 'failed', reason: submit.status ? 'refused' : 'network' };
            }
            // A Worker older than this client refuses a kind it does not know yet;
            // left unsent, the record goes again once the Worker knows it
            const refused = new Set(Array.isArray(submit.data.rejected)
                ? (submit.data.rejected as { index?: unknown }[]).map(r => batch[r?.index as number]?.hash).filter(Boolean)
                : []);
            for (const item of batch) if (!refused.has(item.hash)) sent.add(item.hash);
            total += batch.length - refused.size;
            refused.forEach(hash => unsent.add(hash));
        }
        // What the Worker did not want it already has from us, or has enough
        // of from others; either way, asking again would not change the answer.
        for (const item of chunk) if (!unsent.has(item.hash)) sent.add(item.hash);
        await saveSent(sent);
    }
    return { status: 'done', sent: total };
}

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let rerun = false;
let blockedUntil = 0;
let unsubscribers: (() => void)[] = [];

function schedule(delay = DEBOUNCE_MS): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        timer = null;
        void run();
    }, Math.max(delay, blockedUntil - Date.now()));
}

async function run(): Promise<void> {
    if (running) {
        rerun = true;
        return;
    }
    running = true;
    try {
        const outcome = await syncOnce();
        if (outcome.status === 'failed') {
            blockedUntil = Date.now() + BACKOFF_MS;
            schedule(BACKOFF_MS);
        }
    } finally {
        running = false;
        if (rerun) {
            rerun = false;
            schedule();
        }
    }
}

function enable(): void {
    if (unsubscribers.length) return;
    unsubscribers = [
        subscribeZlom(() => schedule()),
        subscribeOdmiana(() => schedule()),
        characterStorage.onChange('worn_armor', () => schedule()),
        globalStorage.onChange('crowdCredentialsRetired', () => schedule()),
    ];
    // Soon after load or opt-in, but not in the middle of logging in.
    schedule(10_000);
}

function disable(): void {
    unsubscribers.forEach(unsubscribe => unsubscribe());
    unsubscribers = [];
    if (timer) clearTimeout(timer);
    timer = null;
}

/** Follow the opt-in setting for the rest of the session. Safe to call twice. */
export function startCrowdSync(): void {
    if (started) return;
    started = true;
    const apply = () => (getBehaviorSettings().crowdContribute ? enable() : disable());
    onBehaviorSettingsChange(apply);
    apply();
}
