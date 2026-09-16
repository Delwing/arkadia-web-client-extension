/**
 * Temporary multibinds
 *
 * In-memory registry of multibinds contributed at runtime (by plugins via
 * `api.multibinds.addTemporary`). They are never persisted, never written to
 * the multibind store and never synced - the saved per-room binds `/mbind`
 * manages stay untouched. `multibinds.ts` subscribes to this registry and
 * merges the entries into the bar (and key handling) on every change.
 */

export interface TemporaryMultibindEntry {
    /** Command sent when the bind runs. */
    action: string;
    /** Optional display name shown on the bar instead of the action. */
    label?: string;
    /** Only applies when the current room id equals this. Omitted = every room. */
    roomId?: number;
    /** Draw attention to the slot on the bar. */
    highlight?: boolean;
}

export interface TemporaryMultibindPatch {
    action?: string;
    label?: string;
    highlight?: boolean;
}

export interface TemporaryMultibindRegistryHandle {
    update(patch: TemporaryMultibindPatch): void;
    remove(): void;
}

/** One resolved bar slot (saved bind or temporary). */
export interface ResolvedMultibindSlot {
    action: string;
    /** Display name of the temporary bind, when it has one. */
    name?: string;
    temporary?: boolean;
    highlight?: boolean;
}

type Listener = () => void;

class TemporaryMultibindRegistry {
    private entries: TemporaryMultibindEntry[] = [];
    private listeners = new Set<Listener>();

    add(opts: TemporaryMultibindEntry): TemporaryMultibindRegistryHandle {
        const entry: TemporaryMultibindEntry = {
            action: String(opts?.action ?? ''),
            label: opts?.label,
            roomId: typeof opts?.roomId === 'number' ? opts.roomId : undefined,
            highlight: opts?.highlight === true,
        };
        this.entries.push(entry);
        this.notify();

        return {
            update: (patch) => {
                if (!this.entries.includes(entry) || !patch) return;
                if (patch.action !== undefined) entry.action = String(patch.action);
                if ('label' in patch) entry.label = patch.label;
                if (patch.highlight !== undefined) entry.highlight = patch.highlight === true;
                this.notify();
            },
            remove: () => {
                const index = this.entries.indexOf(entry);
                if (index === -1) return;
                this.entries.splice(index, 1);
                this.notify();
            },
        };
    }

    /** Snapshot of the registered entries, in insertion order. */
    list(): TemporaryMultibindEntry[] {
        return this.entries.map(entry => ({ ...entry }));
    }

    /** Listen for any add/update/remove. Returns an unsubscribe function. */
    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** Drop every entry (tests). */
    clear(): void {
        if (this.entries.length === 0) return;
        this.entries = [];
        this.notify();
    }

    private notify() {
        this.listeners.forEach(listener => {
            try {
                listener();
            } catch (err) {
                console.error('Temporary multibind listener failed:', err);
            }
        });
    }
}

export const temporaryMultibinds = new TemporaryMultibindRegistry();

/**
 * Merge saved binds of a room with the temporary binds that apply to it.
 *
 * Temporaries are processed in insertion order:
 *  - a saved bind with the same (trimmed) action is reused - no new slot - and
 *    picks up the temporary's highlight;
 *  - an earlier temporary with the same action is reused the same way;
 *  - otherwise the lowest index 1..maxBinds free of saved binds and earlier
 *    temporaries is taken; with no free index the temporary is not shown.
 */
export function resolveMultibindSlots(
    saved: ReadonlyMap<number, string> | undefined,
    roomId: number | null,
    temporaries: readonly TemporaryMultibindEntry[],
    maxBinds: number,
): Map<number, ResolvedMultibindSlot> {
    const slots = new Map<number, ResolvedMultibindSlot>();
    saved?.forEach((action, index) => {
        slots.set(index, { action });
    });

    for (const temp of temporaries) {
        if (temp.roomId !== undefined && temp.roomId !== roomId) continue;
        const action = temp.action.trim();
        if (!action) continue;

        const existing = Array.from(slots.values()).find(slot => slot.action.trim() === action);
        if (existing) {
            if (temp.highlight) existing.highlight = true;
            if (existing.temporary && !existing.name && temp.label) existing.name = temp.label;
            continue;
        }

        for (let index = 1; index <= maxBinds; index += 1) {
            if (slots.has(index)) continue;
            const slot: ResolvedMultibindSlot = { action, temporary: true };
            if (temp.label) slot.name = temp.label;
            if (temp.highlight) slot.highlight = true;
            slots.set(index, slot);
            break;
        }
    }

    return slots;
}
