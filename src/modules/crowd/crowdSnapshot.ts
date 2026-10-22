/**
 * The merged crowd list, downloaded for players who share.
 *
 * Fetched when sharing is switched on (or the client starts with it on) and
 * then hourly, matching the Worker's hourly export. The browser revalidates its
 * own copy (no-cache), so an unchanged list costs a 304 - a hand-set
 * If-None-Match would need a CORS preflight the Worker does not answer. The
 * last one is kept in IndexedDB, so a reload
 * has it at once and an offline start still has something.
 *
 * Read-only by design: nothing here is ever written into the player's own
 * zlom list or odmiana store. Those are what crowdSync uploads, and copying
 * other players' data into them would send it back as this player's own
 * observation - a confirmation nobody made. See crowdView.ts for how it is
 * used instead.
 */

import { getBehaviorSettings, onBehaviorSettingsChange } from '@modules/core/settings';
import { getFromIndexedDB, storeInIndexedDB, type IndexedDBConfig } from '@client/utils/dataCache';
import { CROWD_WORKER_URL } from './crowdConfig';

const REFRESH_MS = 60 * 60_000;

const CACHE: IndexedDBConfig = { dbName: 'ArkadiaCrowd', storeName: 'crowd', key: 'snapshot' };

interface Voted {
    confirmations: number;
}

export interface CrowdWeapon extends Voted {
    short: string;
    shortAlt?: string;
    typ: string;
    rodzaj: string;
    klute: number;
    obuch: number;
    ciete: number;
    chwyt: string;
    magik: number;
    srebro: number;
    opis: string;
}

export interface CrowdShield extends Voted {
    short: string;
    shortAlt?: string;
    magik: number;
    opis: string;
    oslona: string;
    iLine?: string;
}

export interface CrowdArmour extends CrowdShield {
    typ: string;
}

export interface CrowdOdmiana extends Voted {
    mianownik: string;
    dopelniacz: string;
    celownik: string;
    biernik: string;
    narzednik: string;
    miejscownik: string;
}

export interface CrowdSnapshot {
    generatedAt: string;
    bronie: CrowdWeapon[];
    tarcze: CrowdShield[];
    zbroje: CrowdArmour[];
    odmiany: CrowdOdmiana[];
}

function asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
}

function normalize(raw: unknown): CrowdSnapshot {
    const s = (raw ?? {}) as Partial<CrowdSnapshot>;
    return {
        generatedAt: typeof s.generatedAt === 'string' ? s.generatedAt : '',
        bronie: asArray(s.bronie),
        tarcze: asArray(s.tarcze),
        zbroje: asArray(s.zbroje),
        odmiany: asArray(s.odmiany),
    };
}

let current: CrowdSnapshot | null = null;
const listeners = new Set<(snapshot: CrowdSnapshot | null) => void>();

/** The last crowd list, or null when the player does not share or none arrived yet */
export function getCrowdSnapshot(): CrowdSnapshot | null {
    return current;
}

export function subscribeCrowdSnapshot(listener: (snapshot: CrowdSnapshot | null) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function set(next: CrowdSnapshot | null) {
    current = next;
    for (const listener of listeners) listener(current);
}

/** Test seam: forget what was downloaded */
export function __setCrowdSnapshotForTests(next: CrowdSnapshot | null): void {
    set(next);
}

async function loadCached(): Promise<void> {
    try {
        const cached = await getFromIndexedDB<{ snapshot: unknown }>(CACHE);
        if (cached && !current) set(normalize(cached.snapshot));
    } catch {
        // Nothing cached; the download fills it
    }
}

/** One check with the Worker. Best-effort: a failure keeps what is held. */
export async function refreshCrowdSnapshot(): Promise<void> {
    try {
        const response = await fetch(`${CROWD_WORKER_URL}/crowd/snapshot`, { cache: 'no-cache' });
        if (!response.ok) return;
        const snapshot = normalize(await response.json());
        // A revalidated copy is the same export: nothing for the views to redo
        if (snapshot.generatedAt && snapshot.generatedAt === current?.generatedAt) return;
        set(snapshot);
        await storeInIndexedDB(CACHE, { snapshot });
    } catch {
        // Offline or the Worker is down: try again on the next tick
    }
}

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

function enable() {
    if (timer) return;
    void loadCached().then(refreshCrowdSnapshot);
    timer = setInterval(() => void refreshCrowdSnapshot(), REFRESH_MS);
}

function disable() {
    if (timer) clearInterval(timer);
    timer = null;
    // Not sharing, so not reading either: the views fall back to the player's own lists
    set(null);
}

/** Follow the opt-in setting for the rest of the session. Safe to call twice. */
export function startCrowdSnapshot(): void {
    if (started) return;
    started = true;
    const apply = () => (getBehaviorSettings().crowdContribute ? enable() : disable());
    onBehaviorSettingsChange(apply);
    apply();
}
