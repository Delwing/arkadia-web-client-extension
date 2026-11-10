import { createContext, useContext, type MutableRefObject } from "react";
import { matchesSearch, type Combo, type KeyEntry, type Reach } from "./keysModel";
import type { KeysData, KeysEdit } from "./keyEdits";
import type { CaptureTarget } from "./useKeyCapture";
import type { Size } from "./useKeysSize";

/** What every part of the Klawisze window reads and does. */
export interface KeysContextValue {
    data: KeysData;
    /** One row per binding (see `mergeEntries`). */
    entries: readonly KeyEntry[];
    byCombo: Map<string, KeyEntry[]>;
    helperConnected: boolean;
    /** No helper builds for phones and tablets: no tab, section or helper-only shortcut. */
    helperSupported: boolean;
    size: Size;
    search: string;
    searching: boolean;
    /** The entry whose key is being captured. */
    capturingId: string | null;
    startCapture: (target: CaptureTarget) => void;
    cancelCapture: () => void;
    /** Stores an edit and shows its notice; typing passes `debounce`. */
    applyEdit: (edit: KeysEdit, debounce?: boolean) => void;
    /** Selects a binding's key on the drawing, where it can be sent through the helper. */
    selectEntry: (entry: KeyEntry) => void;
    /**
     * Adds an own shortcut and shows the list it lands in. The client's own
     * can be typed straight away and given a key after; the helper's needs
     * its key first, so without `combo` one is captured.
     */
    addOwnCommand: (reach: Reach, combo?: Combo) => void;
    /** The entry the next render should focus (a row just added). */
    newRowRef: MutableRefObject<string | null>;
}

export const KeysContext = createContext<KeysContextValue | null>(null);

export function useKeys(): KeysContextValue {
    const ctx = useContext(KeysContext);
    if (!ctx) throw new Error("useKeys outside <Keys>");
    return ctx;
}

/** The entry with `id`; the fixed slots always have one. */
export function entryById(entries: readonly KeyEntry[], id: string): KeyEntry {
    return entries.find(e => e.id === id)!;
}

/** Class of a list row: pickable when it has a key, hidden when the search passes it by. */
export function rowClass(entry: KeyEntry, search: string, extra = ""): string {
    return `keys-row${extra}${entry.combo ? " is-pickable" : ""}${matchesSearch(entry, search) ? "" : " is-hidden"}`;
}

/** "2 bindy", "5 bindów". */
export function bindsWord(n: number): string {
    return n >= 2 && n <= 4 ? `${n} bindy` : `${n} bindów`;
}
