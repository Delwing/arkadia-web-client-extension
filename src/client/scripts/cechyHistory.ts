import Client from "../Client";
import eventBus from "@modules/core/eventBus";
import { characterStorage } from "@modules/core/storage";
import { gmcp, setGmcp } from "../gmcp";
import { CECHA_ORDER, CechaKey, CechySnapshot } from "./lvlCalc";
import { getLifetimeData } from "./improveCounter";

const STORAGE_KEY = "cechy_history";

/** How many snapshots to keep. Only changes are stored, so this is years of play. */
const MAX_ENTRIES = 500;

/** One trait as recorded in the history. */
export interface CechyStat {
    /** Trait level, 1..10. */
    value: number;
    /** Progress towards the next level, 0..4. */
    step: number;
    /** Trait value expressed in subcech. */
    sum: number;
}

/** A recorded `cechy` read-out. Only read-outs that differ from the previous one are kept. */
export interface CechyHistoryEntry {
    time: number;
    /**
     * Fresh reading per trait. `null` means the trait was skipped because it
     * carried a `( +cos )` modifier at the time and so did not reflect its real
     * value; the popup falls back to the last known reading for those.
     */
    stats: Partial<Record<CechaKey, CechyStat | null>>;
    /** Total in subcech, with skipped traits filled in from their last known reading. */
    total: number;
    /** True when the total leans on a carried-over reading rather than a full fresh one. */
    estimated: boolean;
    /**
     * Lifetime postepy counted at the moment of the read-out. The difference
     * between two entries is how many postepy the change cost. Absent when the
     * global counter holds no data for this character.
     */
    postepy?: number;
}

let history: CechyHistoryEntry[] = [];

/**
 * Capturing traits only makes sense when the game annotates modified ones, which
 * it does only with this option on — without it a buffed trait is indistinguishable
 * from a real gain.
 */
function modifiersEnabled(): boolean {
    return gmcp?.char?.options?.state_modifiers === 1;
}

/**
 * Lifetime postepy for this character, or undefined when the global counter holds
 * nothing — a real zero and "never counted" would otherwise look the same.
 */
function currentPostepy(): number | undefined {
    const lifetime = getLifetimeData();
    if (!lifetime.length) return undefined;
    return lifetime.reduce((sum, entry) => sum + entry.count, 0);
}

/** The whole stored history, oldest first. */
export function getCechyHistory(): CechyHistoryEntry[] {
    return history;
}

/**
 * The most recent real reading of a trait in `entries`, searching backwards from
 * `before` (exclusive). Skips entries where the trait was modified at the time.
 */
export function findLastKnownStat(
    entries: CechyHistoryEntry[],
    key: CechaKey,
    before: number = entries.length,
): CechyStat | undefined {
    for (let i = Math.min(before, entries.length) - 1; i >= 0; i--) {
        const stat = entries[i].stats[key];
        if (stat) return stat;
    }
    return undefined;
}

/** {@link findLastKnownStat} against the stored history. */
export function getLastKnownStat(key: CechaKey, before?: number): CechyStat | undefined {
    return findLastKnownStat(history, key, before);
}

function persist() {
    characterStorage.set(STORAGE_KEY, history);
    eventBus.emit("cechy.history.updated");
}

function load() {
    history = characterStorage.get(STORAGE_KEY) ?? [];
    eventBus.emit("cechy.history.updated");
}

export function clearCechyHistory() {
    history = [];
    persist();
}

/**
 * Records a read-out, but only when it differs from what is already known —
 * running `cechy` twice in a row leaves a single entry, so every entry in the
 * history is a real change.
 */
function record(snapshot: CechySnapshot): CechyHistoryEntry | null {
    const stats: Partial<Record<CechaKey, CechyStat | null>> = {};
    for (const key of CECHA_ORDER) {
        const reading = snapshot.readings.find((r) => r.key === key);
        stats[key] = reading && !reading.modifier
            ? { value: reading.value, step: reading.step, sum: reading.sum }
            : null;
    }

    // Every trait was modified (or nothing parsed) — there is nothing to learn.
    if (CECHA_ORDER.every((key) => !stats[key])) return null;

    let total = 0;
    let estimated = false;
    let changed = history.length === 0;

    for (const key of CECHA_ORDER) {
        const fresh = stats[key];
        const known = getLastKnownStat(key);
        if (fresh && (!known || known.value !== fresh.value || known.step !== fresh.step)) {
            changed = true;
        }
        const effective = fresh ?? known;
        if (effective) {
            total += effective.sum;
        }
        if (!fresh) {
            estimated = true;
        }
    }

    if (!changed) return null;

    const postepy = currentPostepy();
    const entry: CechyHistoryEntry = {
        time: snapshot.time,
        stats,
        total,
        estimated,
        ...(postepy !== undefined ? { postepy } : {}),
    };
    history = [...history, entry].slice(-MAX_ENTRIES);
    persist();
    return entry;
}

export default function initCechyHistory(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[],
) {
    load();
    const unsubscribes = [
        characterStorage.onChange(STORAGE_KEY, (value) => {
            history = value ?? [];
            eventBus.emit("cechy.history.updated");
        }),
        characterStorage.onCharacterChange(() => load()),
        eventBus.on("cechy.read", (snapshot: CechySnapshot) => {
            // Every trait is temporarily lowered, so nothing in this read-out is real.
            if (snapshot.weakened) return;
            // Without the option a buffed trait looks exactly like a real gain; the
            // popup surfaces this (and offers to turn it on) rather than the output.
            if (!modifiersEnabled()) return;
            record(snapshot);
        }),
        eventBus.on("cechy.enableModifiers", () => {
            client.sendGMCP("char.options", { state_modifiers: 1 });
            // sendGMCP does not update the local mirror, so keep it in sync.
            setGmcp("char.options.state_modifiers", 1);
        }),
    ];

    aliases?.push({
        pattern: /^\/cechyw$/,
        callback: () => eventBus.emit("cechy.popup.open"),
    });

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}
