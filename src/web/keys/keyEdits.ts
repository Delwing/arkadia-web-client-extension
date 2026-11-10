/**
 * What the Klawisze window does to the stored binds, as pure functions.
 *
 * Each edit takes the current binds (the keymap's and the helper's hotkeys)
 * and returns what changed: new binds, new helper hotkeys, a notice for the
 * player, or the row that should take the caret. Nothing here stores
 * anything; `Keys.tsx` applies the result.
 */
import type { BindSettings, WalkModifiers } from "@modules/core/keymapTypes";
import { defaultBinds } from "@modules/core/keymapStorage";
import type { StoredBind } from "@modules/helper/helperBinds";
import {
    bindOf,
    comboLabel,
    FOCUS_HELPER_TARGET,
    isBrowserReserved,
    modeOfReach,
    slotDef,
    toHelperKey,
    writeSlot,
    type Combo,
    type KeyEntry,
    type Reach,
    type SlotList,
} from "./keysModel";

export interface KeysData {
    binds: BindSettings;
    helperBinds: readonly StoredBind[];
    /** Id for a new helper hotkey; defaults to one from the clock. */
    newId?: () => string;
}

export interface KeysEdit {
    binds?: BindSettings;
    helperBinds?: StoredBind[];
    notice?: string;
    /** The entry id whose command field should take the caret. */
    newRow?: string;
}

export type HelperAction = Pick<StoredBind, "action" | "command" | "targetBind">;
export type HelperReach = Exclude<Reach, "client">;

export const WALK_MODIFIERS = ["ctrl", "alt", "shift"] as const;
export type WalkModifier = typeof WALK_MODIFIERS[number];

const defaultId = () => `helper_${Date.now()}`;

/** Empty own shortcuts (no key or no command) are kept on screen but never stored. */
export function sanitize(binds: BindSettings): BindSettings {
    return { ...binds, custom: binds.custom.filter(b => b.command.trim() !== "" && b.key !== "") };
}

const unsupported = (combo: Combo) => `Helper nie obsługuje klawisza ${comboLabel(combo)}.`;

/** A new helper hotkey on `combo`, or null when the helper cannot register that key. */
export function makeHelperBind(data: KeysData, combo: Combo, action: HelperAction, reach: HelperReach): StoredBind | null {
    const key = toHelperKey(combo);
    if (!key) return null;
    const mode = modeOfReach(reach);
    return { id: (data.newId ?? defaultId)(), key, mode, focusBrowser: mode === "global_focus", ...action };
}

/** Adds a helper hotkey, or says why the helper cannot take that key. */
function addHelperBind(data: KeysData, combo: Combo, action: HelperAction, reach: HelperReach): KeysEdit & { added?: StoredBind } {
    const hb = makeHelperBind(data, combo, action, reach);
    if (!hb) return { notice: unsupported(combo) };
    return { helperBinds: [...data.helperBinds, hb], added: hb };
}

/**
 * Keeps a binding's helper twin on the same key as the binding, since the
 * two only make sense together. A key the helper cannot register (a numpad
 * key, say) means the binding simply stops working outside the client.
 */
function followWithTwin(data: KeysData, twinId: string | undefined, combo: Combo | null): KeysEdit {
    if (!twinId) return {};
    const key = combo ? toHelperKey(combo) : null;
    if (!key) {
        return {
            helperBinds: data.helperBinds.filter(b => b.id !== twinId),
            notice: combo ? `Helper nie obsługuje klawisza ${comboLabel(combo)}: „poza klientem” wyłączone.` : undefined,
        };
    }
    return { helperBinds: data.helperBinds.map(b => b.id === twinId ? { ...b, key } : b) };
}

/** Puts `entry` on `combo`, or clears its key when `combo` is null. */
export function assignKey(data: KeysData, entry: KeyEntry, combo: Combo | null): KeysEdit {
    const { binds, helperBinds } = data;
    const ref = entry.ref;
    const reserved = combo ? isBrowserReserved(combo) : false;

    if (ref.kind === "plugin") {
        // A plugin action runs in the page, so a key the browser keeps cannot reach it.
        if (combo && reserved) return { notice: `${comboLabel(combo)} zajmuje przeglądarka, a akcje pluginów działają tylko w kliencie.` };
        return { binds: { ...binds, pluginKeys: { ...binds.pluginKeys, [ref.id]: combo ? bindOf(combo) : { key: "" } } } };
    }

    if (ref.kind === "helper") {
        if (!combo) return { helperBinds: helperBinds.filter(b => b.id !== ref.id) };
        const key = toHelperKey(combo);
        if (!key) return { notice: unsupported(combo) };
        return { helperBinds: helperBinds.map(b => b.id === ref.id ? { ...b, key } : b) };
    }

    if (ref.kind === "custom") {
        if (combo && reserved) {
            // The page never hears this key: hand the shortcut to the helper. A
            // twin already carries it there, so it just moves along, keeping
            // where it works.
            const custom = binds.custom.filter((_, i) => i !== ref.index);
            if (entry.twinId) {
                const key = toHelperKey(combo);
                if (!key) return { notice: unsupported(combo) };
                return { binds: { ...binds, custom }, helperBinds: helperBinds.map(b => b.id === entry.twinId ? { ...b, key } : b) };
            }
            const added = addHelperBind(data, combo, { action: "command", command: binds.custom[ref.index].command }, "helper");
            if (!added.helperBinds) return added;
            return { binds: { ...binds, custom }, helperBinds: added.helperBinds };
        }
        const custom = binds.custom.map((b, i) => i === ref.index
            ? { command: b.command, ...(combo ? bindOf(combo) : { key: "" }) }
            : b);
        return { ...followWithTwin(data, entry.twinId, combo), binds: { ...binds, custom } };
    }

    if (combo && reserved) {
        // The built-in bind keeps its key; the helper gets this one as a second key.
        const helperId = slotDef(ref.path)?.helperId;
        if (!helperId) return { notice: `${comboLabel(combo)} zajmuje przeglądarka, a tej funkcji helper nie obsłuży.` };
        const added = addHelperBind(data, combo, { action: "bind", targetBind: helperId }, "helper");
        if (!added.helperBinds) return added;
        return { helperBinds: added.helperBinds, notice: `${comboLabel(combo)} zajmuje przeglądarka: dodany jako drugi klawisz przez helpera.` };
    }
    return { ...followWithTwin(data, entry.twinId, combo), binds: writeSlot(binds, ref.path, combo ? bindOf(combo) : undefined) };
}

/**
 * Where a binding works — the one setting behind all of this.
 *
 * "w kliencie" is the client's own bind and nothing else. The other two add
 * a helper hotkey on the *same* key, aimed at the same thing, which is what
 * lets it fire outside the client; going back removes it again. A binding
 * whose key the browser keeps has no client side at all, so it lives in the
 * helper alone and only moves between its two helper modes.
 */
export function setReach(data: KeysData, entry: KeyEntry, reach: Reach): KeysEdit {
    const { helperBinds } = data;
    if (!entry.combo || entry.reach === reach) return {};
    const ref = entry.ref;
    if (ref.kind === "plugin") return {};

    const withMode = (id: string, r: HelperReach) => {
        const mode = modeOfReach(r);
        return helperBinds.map(b => b.id === id ? { ...b, mode, focusBrowser: mode === "global_focus" } : b);
    };

    // A helper-only binding (a key the browser keeps, or a second key).
    if (ref.kind === "helper") {
        if (reach === "client") return {};
        return { helperBinds: withMode(ref.id, reach) };
    }

    if (reach === "client") {
        return entry.twinId ? { helperBinds: helperBinds.filter(b => b.id !== entry.twinId) } : {};
    }

    const action: HelperAction = ref.kind === "custom"
        ? { action: "command", command: entry.command ?? "" }
        : { action: "bind", targetBind: slotDef(ref.path)?.helperId };
    if (action.action === "bind" && !action.targetBind) return { notice: `Helper nie obsługuje funkcji „${entry.label}”.` };
    if (entry.twinId) return { helperBinds: withMode(entry.twinId, reach) };
    const { added: _added, ...edit } = addHelperBind(data, entry.combo, action, reach);
    return edit;
}

/** An own shortcut goes altogether; a built-in bind or a plugin action only loses its key. */
export function removeEntry(data: KeysData, entry: KeyEntry): KeysEdit {
    const { binds, helperBinds } = data;
    const ref = entry.ref;
    if (ref.kind === "custom") {
        return {
            binds: { ...binds, custom: binds.custom.filter((_, i) => i !== ref.index) },
            ...(entry.twinId ? { helperBinds: helperBinds.filter(b => b.id !== entry.twinId) } : {}),
        };
    }
    if (ref.kind === "helper") return { helperBinds: helperBinds.filter(b => b.id !== ref.id) };
    return assignKey(data, entry, null);
}

/** A plugin action goes back to the key its plugin suggests. */
export function resetPluginKey(data: KeysData, entry: KeyEntry): KeysEdit {
    const { binds } = data;
    if (entry.ref.kind !== "plugin" || !binds.pluginKeys) return {};
    const { [entry.ref.id]: _dropped, ...rest } = binds.pluginKeys;
    return { binds: { ...binds, pluginKeys: rest } };
}

/** The command an own shortcut sends, whether the page or the helper hears it. */
export function commandOf(data: KeysData, entry: KeyEntry): string {
    const ref = entry.ref;
    if (ref.kind === "custom") return data.binds.custom[ref.index]?.command ?? "";
    if (ref.kind === "helper") return data.helperBinds.find(b => b.id === ref.id)?.command ?? "";
    return "";
}

/** Typing in a row's field: the twin follows, so both halves stay one binding. */
export function editCommand(data: KeysData, entry: KeyEntry, command: string): KeysEdit {
    const { binds, helperBinds } = data;
    const edit: KeysEdit = {};
    if (entry.ref.kind === "custom") {
        const index = entry.ref.index;
        edit.binds = { ...binds, custom: binds.custom.map((b, i) => i === index ? { ...b, command } : b) };
    }
    const helperId = entry.ref.kind === "helper" ? entry.ref.id : entry.twinId;
    if (helperId) edit.helperBinds = helperBinds.map(b => b.id === helperId ? { ...b, command } : b);
    return edit;
}

/**
 * Adds an own shortcut. The client's own can be typed straight away and given
 * a key after; the helper's needs its key, since a hotkey is registered by it
 * (without one in hand, the window captures it first and calls
 * {@link addCapturedHelperBind}).
 */
export function addOwnCommand(data: KeysData, reach: Reach, combo: Combo): KeysEdit;
export function addOwnCommand(data: KeysData, reach: "client", combo?: Combo): KeysEdit;
export function addOwnCommand(data: KeysData, reach: Reach, combo?: Combo): KeysEdit {
    const { binds } = data;
    if (reach === "client") {
        return {
            binds: { ...binds, custom: [...binds.custom, { command: "", ...(combo ? bindOf(combo) : { key: "" }) }] },
            newRow: `custom:${binds.custom.length}`,
        };
    }
    const { added, ...edit } = addHelperBind(data, combo!, { action: "command", command: "" }, reach);
    return added ? { ...edit, newRow: `helper:${added.id}` } : edit;
}

/**
 * A key captured for something that is not yet a binding: a second key for a
 * built-in bind (or the window-summoning hotkey), or a new own shortcut the
 * helper hears.
 */
export function addCapturedHelperBind(data: KeysData, combo: Combo, target: { kind: "new-helper"; target: string } | { kind: "new-helper-command" }): KeysEdit {
    const reach: HelperReach = target.kind === "new-helper" && target.target === FOCUS_HELPER_TARGET
        ? "global_focus"
        : isBrowserReserved(combo) ? "helper" : "global";
    const action: HelperAction = target.kind === "new-helper"
        ? { action: "bind", targetBind: target.target }
        : { action: "command", command: "" };
    const { added, ...edit } = addHelperBind(data, combo, action, reach);
    return added && target.kind === "new-helper-command" ? { ...edit, newRow: `helper:${added.id}` } : edit;
}

/** A new, keyless slot at the end of a growable list. */
export function addListSlot(data: KeysData, list: SlotList): KeysEdit {
    return { binds: { ...data.binds, [list]: [...(data.binds[list] ?? []), { key: "" }] } };
}

/** Drops the last slot of a list (only the last can go, so the others keep their numbers), with its twin. */
export function removeLastListSlot(data: KeysData, list: SlotList, entries: readonly KeyEntry[]): KeysEdit {
    const keys = data.binds[list] ?? [];
    const last = keys.length - 1;
    const twinId = entries.find(x => x.id === `slot:${list}[${last}]`)?.twinId;
    return {
        binds: { ...data.binds, [list]: keys.slice(0, last) },
        ...(twinId ? { helperBinds: data.helperBinds.filter(b => b.id !== twinId) } : {}),
    };
}

/** Flips one modifier and keeps the rest as stored, so a locked one comes back once the directions free it. */
export function toggleWalkModifier(data: KeysData, id: string, stored: WalkModifiers, current: WalkModifiers, m: WalkModifier): KeysEdit {
    const { binds } = data;
    return { binds: { ...binds, walkModes: { ...binds.walkModes, [id]: { ...stored, [m]: !current[m] } } } };
}

/** Off: the numpad is the numpad either way. On: with NumLock off its keys can be bound apart (Num↑, NumHome…). */
export function toggleNumLockAware(data: KeysData): KeysEdit {
    return { binds: { ...data.binds, numLockAware: data.binds.numLockAware ? undefined : true } };
}

/** The standard binds back to their defaults; own shortcuts stay. */
export function restoreDefaults(data: KeysData): KeysEdit {
    const restored: BindSettings = { ...structuredClone(defaultBinds), custom: data.binds.custom };
    delete restored.mainGates;
    delete restored.mainTransport;
    delete restored.mainLoot;
    return { binds: restored };
}
