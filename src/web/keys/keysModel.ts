/**
 * The Klawisze window's view of every key binding: the keymap's slots and own
 * shortcuts (`BindSettings`) and the helper's hotkeys (`arkadia.helperBinds`)
 * flattened into one list of entries, each on one keystroke.
 *
 * Everything here is pure, so the window (Keys.tsx) only holds state and draws.
 */

import type { Bind, BindSettings, DirectionBinds, WalkModifiers } from "@modules/core/keymapTypes";
import { directionModifiers, hasWalkModifier, sameWalkModifiers } from "@modules/core/walkModeRegistry";
import type { StoredBind } from "@modules/helper/helperBinds";
import type { BindMode } from "@modules/helper/helperProtocol";
import { KEYBOARD, keyDistance } from "./keyboardLayout";
import { IS_MAC } from "./platform";

// ── Keystrokes ──────────────────────────────────────────────────────────

/** One keystroke: a `KeyboardEvent.code` and the modifiers held with it. */
export interface Combo {
    code: string;
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
}

/** A modifier set, e.g. `""` (none), `"ctrl"`, `"ctrl+alt"`. */
export type Layer = string;

/** The layers the window always offers, in tab order. Others appear when used. */
export const BASE_LAYERS: readonly Layer[] = ["", "ctrl", "alt", "shift", "ctrl+alt"];

const ALT_LABEL = IS_MAC ? "⌥" : "Alt";

/**
 * Stored keys are usually a `code` (`KeyQ`), but older binds and imports hold
 * the bare character (`q`). Both mean the same physical key.
 */
export function normalizeCode(key: string): string {
    if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
    if (/^[0-9]$/.test(key)) return `Digit${key}`;
    return key;
}

export function comboOf(bind: Bind | undefined | null): Combo | null {
    if (!bind || !bind.key) return null;
    return { code: normalizeCode(bind.key), ctrl: !!bind.ctrl, alt: !!bind.alt, shift: !!bind.shift };
}

export function bindOf(combo: Combo): Bind {
    const bind: Bind = { key: combo.code };
    if (combo.ctrl) bind.ctrl = true;
    if (combo.alt) bind.alt = true;
    if (combo.shift) bind.shift = true;
    return bind;
}

export function layerOf(combo: Pick<Combo, "ctrl" | "alt" | "shift">): Layer {
    const parts: string[] = [];
    if (combo.ctrl) parts.push("ctrl");
    if (combo.alt) parts.push("alt");
    if (combo.shift) parts.push("shift");
    return parts.join("+");
}

export function comboInLayer(code: string, layer: Layer): Combo {
    const mods = layer.split("+");
    return { code, ctrl: mods.includes("ctrl"), alt: mods.includes("alt"), shift: mods.includes("shift") };
}

export function comboId(combo: Combo): string {
    const layer = layerOf(combo);
    return layer ? `${layer}+${combo.code}` : combo.code;
}

export function sameCombo(a: Combo | null, b: Combo | null): boolean {
    return !!a && !!b && comboId(a) === comboId(b);
}

export function layerLabel(layer: Layer, short = false): string {
    if (!layer) return short ? "Bez" : "Bez modyfikatora";
    return layer.split("+").map(m => m === "ctrl" ? "Ctrl" : m === "alt" ? ALT_LABEL : "Shift").join("+");
}

const KEY_LABELS: Record<string, string> = {
    Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
    Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", IntlBackslash: "\\",
    Space: "Spacja", Escape: "Esc", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", CapsLock: "Caps",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Insert: "Ins", Delete: "Del", Home: "Home", End: "End", PageUp: "PgUp", PageDown: "PgDn",
    NumpadMultiply: "Num*", NumpadDivide: "Num/", NumpadAdd: "Num+", NumpadSubtract: "Num-",
    NumpadDecimal: "Num.", NumpadEnter: "NumEnter", NumLock: "Num",
    ControlLeft: "Ctrl", ControlRight: "Ctrl", AltLeft: "Alt", AltRight: "Alt",
    ShiftLeft: "Shift", ShiftRight: "Shift", MetaLeft: "Win", MetaRight: "Win", ContextMenu: "Menu",
};

/** What an Apple keyboard prints instead. */
const MAC_KEY_LABELS: Record<string, string> = {
    Backspace: "⌫", Enter: "return", CapsLock: "⇪", NumpadEnter: "NumEnter", NumpadEqual: "Num=",
    AltLeft: "⌥", AltRight: "⌥", MetaLeft: "⌘", MetaRight: "⌘", NumLock: "Clear", Fn: "fn",
};

/** The key alone, as printed on a keycap: `KeyQ` → `Q`, `Numpad8` → `Num8`. */
export function keyLabel(code: string): string {
    return keyLabelFor(code, IS_MAC);
}

export function keyLabelFor(code: string, mac: boolean): string {
    if (mac && MAC_KEY_LABELS[code]) return MAC_KEY_LABELS[code];
    if (KEY_LABELS[code]) return KEY_LABELS[code];
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Numpad")) return `Num${code.slice(6)}`;
    return code;
}

/** The whole keystroke: `Ctrl+Alt+=`. */
export function comboLabel(combo: Combo): string {
    const layer = layerOf(combo);
    return layer ? `${layerLabel(layer)}+${keyLabel(combo.code)}` : keyLabel(combo.code);
}

/** Codes that are modifiers themselves; a capture waits for the real key. */
export const MODIFIER_CODES = new Set([
    "ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight", "AltGraph",
]);

/**
 * Keystrokes the browser keeps for itself: a page never sees them, so a bind on
 * one only works when the helper catches it first.
 */
const BROWSER_RESERVED = new Set([
    "ctrl+KeyW", "ctrl+KeyT", "ctrl+KeyN", "ctrl+Tab", "ctrl+F4",
    "ctrl+shift+KeyW", "ctrl+shift+KeyT", "ctrl+shift+KeyN", "ctrl+shift+Tab",
    "alt+F4",
]);

export function isBrowserReserved(combo: Combo): boolean {
    return BROWSER_RESERVED.has(comboId(combo));
}

// ── Helper key names ────────────────────────────────────────────────────
// The helper names keys its own way (`ctrl+shift+w`, `f9`, `left`) and knows
// only letters, digits, F1-F12 and a handful of named keys.

const HELPER_NAMED: Record<string, string> = {
    Backspace: "backspace", Tab: "tab", Enter: "enter", Escape: "escape", Space: "space", Delete: "delete",
    ArrowLeft: "left", ArrowUp: "up", ArrowRight: "right", ArrowDown: "down",
    // The keys this client leans on: "]" for the functional bind, the numpad for
    // the directions. Named rather than spelled, because a combo is split on "+".
    BracketLeft: "lbracket", BracketRight: "rbracket", Semicolon: "semicolon", Quote: "quote",
    Comma: "comma", Period: "period", Slash: "slash", Backslash: "backslash",
    Backquote: "grave", Minus: "minus", Equal: "equal",
    Numpad0: "num0", Numpad1: "num1", Numpad2: "num2", Numpad3: "num3", Numpad4: "num4",
    Numpad5: "num5", Numpad6: "num6", Numpad7: "num7", Numpad8: "num8", Numpad9: "num9",
    NumpadMultiply: "nummul", NumpadDivide: "numdiv", NumpadSubtract: "numsub",
    NumpadAdd: "numadd", NumpadDecimal: "numdec",
};
const HELPER_NAMED_BACK: Record<string, string> = {
    ...Object.fromEntries(Object.entries(HELPER_NAMED).map(([code, name]) => [name, code])),
    return: "Enter", esc: "Escape", del: "Delete",
};

/** The helper's name for a keystroke, or null when the helper can't register that key. */
export function toHelperKey(combo: Combo): string | null {
    let key: string | null = null;
    if (/^Key[A-Z]$/.test(combo.code)) key = combo.code.slice(3).toLowerCase();
    else if (/^Digit[0-9]$/.test(combo.code)) key = combo.code.slice(5);
    else if (/^F([1-9]|1[0-2])$/.test(combo.code)) key = combo.code.toLowerCase();
    else if (HELPER_NAMED[combo.code]) key = HELPER_NAMED[combo.code];
    if (!key) return null;
    const layer = layerOf(combo);
    return layer ? `${layer}+${key}` : key;
}

export function fromHelperKey(helperKey: string): Combo | null {
    const parts = helperKey.toLowerCase().split("+").map(p => p.trim()).filter(Boolean);
    const combo: Combo = { code: "", ctrl: false, alt: false, shift: false };
    for (const part of parts) {
        if (part === "ctrl" || part === "alt" || part === "shift") combo[part] = true;
        else if (/^[a-z]$/.test(part)) combo.code = `Key${part.toUpperCase()}`;
        else if (/^[0-9]$/.test(part)) combo.code = `Digit${part}`;
        else if (/^f([1-9]|1[0-2])$/.test(part)) combo.code = part.toUpperCase();
        else if (HELPER_NAMED_BACK[part]) combo.code = HELPER_NAMED_BACK[part];
        else return null;
    }
    return combo.code ? combo : null;
}

// ── Entries ─────────────────────────────────────────────────────────────

export type Group = "basic" | "enemy" | "temp" | "dir" | "own";

export const GROUPS: readonly { id: Group; label: string }[] = [
    { id: "basic", label: "Podstawowe" },
    { id: "enemy", label: "Wrogowie" },
    { id: "temp", label: "Tymczasowe" },
    { id: "dir", label: "Kierunki" },
    { id: "own", label: "Własne" },
];

/** Where a keystroke is heard: by the page, by the helper while the client is in front, or system-wide. */
export type Reach = "client" | "helper" | "global" | "global_focus";

export function reachOfMode(mode: BindMode): Reach {
    return mode === "browser_only" ? "helper" : mode;
}

export function modeOfReach(reach: Exclude<Reach, "client">): BindMode {
    return reach === "helper" ? "browser_only" : reach;
}

export const REACH_LABELS: Record<Reach, string> = {
    client: "w kliencie",
    helper: "w kliencie, przez helpera",
    global: "wszędzie",
    global_focus: "wszędzie, przywołuje okno",
};

/** What a helper hotkey can be set to, in the order the list offers them. */
export const HELPER_REACHES: readonly Exclude<Reach, "client">[] = ["helper", "global", "global_focus"];

/** The same, short enough for the choice in a hotkey's own row. */
export const HELPER_REACH_LABELS: Record<Exclude<Reach, "client">, string> = {
    helper: "w kliencie",
    global: "wszędzie",
    global_focus: "wszędzie + okno",
};

interface SlotDef {
    /** Dotted path into BindSettings: `attack`, `directions.n`, `enemy[0]`. */
    path: string;
    label: string;
    /** Name on the keycap. */
    short: string;
    group: Group;
    /**
     * The id a helper hotkey uses to trigger this bind, when the helper can.
     * These are the ids the client answers on the `helperBind` event
     * (KeyBindingManager, enemyBinds, directionBinds, functionalBind), so a new
     * one only works once something handles it.
     */
    helperId?: string;
    /** Optional slot that uses the Funkcyjny key until given its own. */
    inherits?: boolean;
}

const dir = (d: keyof DirectionBinds, label: string, short: string, helperId?: string): SlotDef =>
    ({ path: `directions.${d}`, label, short, group: "dir", helperId });

export const SLOTS: readonly SlotDef[] = [
    { path: "main", label: "Funkcyjny", short: "Funkcyjny", group: "basic", helperId: "functional" },
    { path: "mainGates", label: "Wrota", short: "Wrota", group: "basic", helperId: "functionalGates", inherits: true },
    { path: "mainTransport", label: "Transport", short: "Transport", group: "basic", helperId: "functionalTransport", inherits: true },
    { path: "mainLoot", label: "Zbieranie z ciał", short: "Zbieranie", group: "basic", helperId: "functionalLoot", inherits: true },
    { path: "attack", label: "Atakuj", short: "Atakuj", group: "basic", helperId: "attack" },
    { path: "support", label: "Wesprzyj", short: "Wesprzyj", group: "basic", helperId: "support" },
    { path: "lamp", label: "Napełnij lampę", short: "Lampa", group: "basic", helperId: "lamp" },
    { path: "moveMode", label: "Tryb ruchu", short: "Tryb ruchu", group: "basic", helperId: "moveMode" },
    { path: "roomBind", label: "Bind w lokacji", short: "Bind lok.", group: "basic", helperId: "roomBind" },
    { path: "drinkable", label: "Napij się wody", short: "Woda", group: "basic", helperId: "drinkable" },
    { path: "gateBind", label: "Zapukaj we wrota", short: "Zapukaj", group: "basic", helperId: "gateBind" },
    { path: "doubleK", label: "Dwukrotne +k", short: "+k ×2", group: "basic" },
    { path: "enemy[0]", label: "Atakuj wroga 1", short: "Wróg 1", group: "enemy", helperId: "enemy1" },
    { path: "enemy[1]", label: "Atakuj wroga 2", short: "Wróg 2", group: "enemy", helperId: "enemy2" },
    { path: "enemy[2]", label: "Atakuj wroga 3", short: "Wróg 3", group: "enemy", helperId: "enemy3" },
    { path: "enemyBlock[0]", label: "Blokuj wroga 1", short: "Blokuj 1", group: "enemy", helperId: "enemyBlock1" },
    { path: "enemyBlock[1]", label: "Blokuj wroga 2", short: "Blokuj 2", group: "enemy", helperId: "enemyBlock2" },
    { path: "enemyBlock[2]", label: "Blokuj wroga 3", short: "Blokuj 3", group: "enemy", helperId: "enemyBlock3" },
    { path: "temp[0]", label: "Tymczasowe 1", short: "Tymcz. 1", group: "temp", helperId: "temp1" },
    { path: "temp[1]", label: "Tymczasowe 2", short: "Tymcz. 2", group: "temp", helperId: "temp2" },
    dir("nw", "NW", "NW", "dir_nw"),
    dir("n", "N", "N", "dir_n"),
    dir("ne", "NE", "NE", "dir_ne"),
    dir("w", "W", "W", "dir_w"),
    dir("zerknij", "zerknij", "zerknij"),
    dir("e", "E", "E", "dir_e"),
    dir("sw", "SW", "SW", "dir_sw"),
    dir("s", "S", "S", "dir_s"),
    dir("se", "SE", "SE", "dir_se"),
    dir("u", "góra", "góra", "dir_u"),
    dir("d", "dół", "dół", "dir_d"),
    dir("special", "specjalny", "specjalny", "dir_special"),
];

export const SLOT_BY_PATH = new Map(SLOTS.map(s => [s.path, s]));
const SLOT_BY_HELPER_ID = new Map(SLOTS.filter(s => s.helperId).map(s => [s.helperId!, s]));

/** The helper's own action that only brings the client window to the front. */
export const FOCUS_HELPER_TARGET = "focus";

export type EntryRef =
    | { kind: "slot"; path: string }
    | { kind: "custom"; index: number }
    | { kind: "helper"; id: string };

export interface KeyEntry {
    /** Stable id: `slot:attack`, `custom:2`, `helper:helper_123`. */
    id: string;
    ref: EntryRef;
    group: Group;
    label: string;
    short: string;
    /** Null when the entry has no key of its own. */
    combo: Combo | null;
    reach: Reach;
    /** The command an own shortcut or a helper hotkey sends. */
    command?: string;
    /** A helper hotkey that triggers a built-in bind (a second key for it). */
    targetLabel?: string;
    /** For a helper hotkey: the bind id it triggers, or FOCUS_HELPER_TARGET. */
    helperTarget?: string;
    /**
     * The helper hotkey carrying this same binding on the same key, folded in
     * by {@link mergeEntries}. It is what makes the binding work outside the
     * client, and it is never shown as a binding of its own — the window has
     * one row per binding and one "where it works" for it.
     */
    twinId?: string;
    /** A Funkcyjny situation without its own key: it uses the Funkcyjny key. */
    inherits?: boolean;
}

export function entryId(ref: EntryRef): string {
    if (ref.kind === "slot") return `slot:${ref.path}`;
    if (ref.kind === "custom") return `custom:${ref.index}`;
    return `helper:${ref.id}`;
}

export function readSlot(binds: BindSettings, path: string): Bind | undefined {
    const indexed = /^(\w+)\[(\d+)\]$/.exec(path);
    if (indexed) {
        const list = (binds as unknown as Record<string, Bind[] | undefined>)[indexed[1]];
        return list?.[Number(indexed[2])];
    }
    if (path.startsWith("directions.")) {
        return binds.directions[path.slice(11) as keyof DirectionBinds];
    }
    return (binds as unknown as Record<string, Bind | undefined>)[path];
}

/** A copy of `binds` with the slot at `path` set to `bind` (undefined drops an optional slot). */
export function writeSlot(binds: BindSettings, path: string, bind: Bind | undefined): BindSettings {
    const next: BindSettings = { ...binds };
    const indexed = /^(\w+)\[(\d+)\]$/.exec(path);
    if (indexed) {
        const name = indexed[1] as "temp" | "enemy" | "enemyBlock";
        const list = [...next[name]];
        list[Number(indexed[2])] = bind ?? { key: "" };
        next[name] = list;
        return next;
    }
    if (path.startsWith("directions.")) {
        next.directions = { ...next.directions, [path.slice(11)]: bind ?? { key: "" } };
        return next;
    }
    const record = next as unknown as Record<string, Bind | undefined>;
    if (bind === undefined && SLOT_BY_PATH.get(path)?.inherits) delete record[path];
    else record[path] = bind ?? { key: "" };
    return next;
}

function helperEntry(b: StoredBind): KeyEntry {
    const ref: EntryRef = { kind: "helper", id: b.id };
    const combo = fromHelperKey(b.key);
    const reach = reachOfMode(b.mode);
    if (b.action === "bind") {
        if (b.targetBind === FOCUS_HELPER_TARGET) {
            return { id: entryId(ref), ref, group: "basic", label: "Przywołaj okno klienta", short: "Przywołaj", combo, reach, helperTarget: b.targetBind };
        }
        const slot = b.targetBind ? SLOT_BY_HELPER_ID.get(b.targetBind) : undefined;
        const name = slot?.label ?? b.targetBind ?? "?";
        return {
            id: entryId(ref), ref, group: slot?.group ?? "basic", label: name,
            short: slot?.short ?? name, combo, reach, targetLabel: name, helperTarget: b.targetBind,
        };
    }
    const command = b.command ?? "";
    return { id: entryId(ref), ref, group: "own", label: command, short: command, combo, reach, command };
}

/** Every binding the window shows, in list order: slots, own shortcuts, helper hotkeys. */
export function buildEntries(binds: BindSettings, helperBinds: readonly StoredBind[]): KeyEntry[] {
    const entries: KeyEntry[] = [];
    for (const slot of SLOTS) {
        const ref: EntryRef = { kind: "slot", path: slot.path };
        const bind = readSlot(binds, slot.path);
        entries.push({
            id: entryId(ref), ref, group: slot.group, label: slot.label, short: slot.short,
            combo: comboOf(bind), reach: "client", inherits: slot.inherits && !bind,
        });
    }
    binds.custom.forEach((b, index) => {
        const ref: EntryRef = { kind: "custom", index };
        entries.push({
            id: entryId(ref), ref, group: "own", label: b.command, short: b.command,
            combo: comboOf(b), reach: "client", command: b.command,
        });
    });
    for (const b of helperBinds) entries.push(helperEntry(b));
    return entries;
}

/**
 * One row per binding.
 *
 * A binding that also works outside the client is two registrations under the
 * hood — the client's own bind plus a helper hotkey on the same key — but that
 * is bookkeeping, not something to put on screen twice. Here the helper hotkey
 * is folded into the binding it mirrors, which then simply reports where it
 * works. What is left over is a binding in its own right: a shortcut on a key
 * the browser keeps (so it can only live in the helper), a second key for a
 * built-in, and the one that just summons the window.
 */
export interface MergedEntries {
    /** Bindings, in the order the lists show them. */
    list: KeyEntry[];
    /** The hotkey that only brings the client window to the front, if set. */
    focus?: KeyEntry;
}

export function mergeEntries(entries: readonly KeyEntry[]): MergedEntries {
    const helpers = entries.filter(e => e.ref.kind === "helper");
    const taken = new Set<string>();
    let focus: KeyEntry | undefined;

    const twinFor = (entry: KeyEntry): KeyEntry | undefined => {
        if (!entry.combo) return undefined;
        const twin = helpers.find(h => {
            if (taken.has(h.id) || !sameCombo(h.combo, entry.combo)) return false;
            if (entry.ref.kind === "slot") {
                const helperId = SLOT_BY_PATH.get(entry.ref.path)?.helperId;
                return !!helperId && h.helperTarget === helperId;
            }
            return h.helperTarget === undefined && h.command === entry.command;
        });
        if (twin) taken.add(twin.id);
        return twin;
    };

    const list = entries
        .filter(e => e.ref.kind !== "helper")
        .map(entry => {
            const twin = twinFor(entry);
            return twin ? { ...entry, reach: twin.reach, twinId: (twin.ref as { id: string }).id } : entry;
        });

    // Helper hotkeys that mirror nothing stand on their own.
    for (const h of helpers) {
        if (taken.has(h.id)) continue;
        if (h.helperTarget === FOCUS_HELPER_TARGET) focus = h;
        else list.push(h);
    }
    return { list, focus };
}

/** Entries grouped by the keystroke they sit on. */
export function entriesByCombo(entries: readonly KeyEntry[]): Map<string, KeyEntry[]> {
    const map = new Map<string, KeyEntry[]>();
    for (const e of entries) {
        if (!e.combo) continue;
        const id = comboId(e.combo);
        const list = map.get(id);
        if (list) list.push(e);
        else map.set(id, [e]);
    }
    return map;
}

/**
 * Whether an entry on a keystroke actually works: page binds on a key the
 * browser keeps never fire, helper hotkeys need the helper.
 */
export function entryWorks(entry: KeyEntry, helperConnected: boolean): boolean {
    if (!entry.combo) return entry.inherits ?? false;
    if (entry.reach === "client") return !isBrowserReserved(entry.combo);
    return helperConnected;
}

/**
 * What a keystroke does right now.
 *
 * A helper hotkey and a page bind on the same key are not a clash: the helper's
 * hook swallows the key before the page ever sees it, so exactly one of them
 * fires — the helper's while it is running, the page's otherwise. That is the
 * point of putting a built-in bind "also outside the client": the same key then
 * works everywhere, and calling it a conflict would be a lie. A real conflict is
 * two bindings on the *same* side, which do fire together.
 */
export interface KeyState {
    /** What a press does now. */
    active: KeyEntry[];
    /** What the other side holds, waiting. */
    shadowed: KeyEntry[];
    /** True when the helper is the one in charge of this key. */
    helperTakesOver: boolean;
    /** Two or more bindings fire at once. */
    conflict: boolean;
}

export function classifyKey(entries: readonly KeyEntry[], helperConnected: boolean): KeyState {
    const viaHelper = entries.filter(e => e.reach !== "client");
    const inPage = entries.filter(e => e.reach === "client");
    const helperTakesOver = viaHelper.length > 0 && helperConnected;
    const active = helperTakesOver ? viaHelper : inPage;
    const shadowed = helperTakesOver ? inPage : viaHelper;
    return { active, shadowed, helperTakesOver, conflict: active.length > 1 };
}

/** Keystrokes where more than one binding fires at once. */
export function conflicts(byCombo: Map<string, KeyEntry[]>, helperConnected: boolean): string[] {
    return [...byCombo.entries()]
        .filter(([, list]) => classifyKey(list, helperConnected).conflict)
        .map(([id]) => id);
}


export function matchesSearch(entry: KeyEntry, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = [entry.label, entry.short, entry.command ?? "", entry.combo ? comboLabel(entry.combo) : ""]
        .join(" ").toLowerCase();
    return hay.includes(q);
}

// ── Free keys ───────────────────────────────────────────────────────────

const keyKind = (code: string) => /^F\d/.test(code) ? "f" : code.startsWith("Numpad") ? "num" : code.startsWith("Arrow") ? "arrow" : "main";

const NEVER_SUGGESTED = new Set(["Escape", "Tab", "Enter", "Backspace", "Space", "NumpadEnter"]);

/**
 * Free keystrokes to move a binding to: keys of the same kind first (F-keys
 * for an F-key), then the nearest. A bare key is only offered where it can't
 * get in the way of typing. The same key with Shift comes last, when free.
 */
export function freeKeysNear(combo: Combo, byCombo: Map<string, KeyEntry[]>, limit = 4): Combo[] {
    const layer = layerOf(combo);
    const free = (c: Combo) => !byCombo.has(comboId(c)) && !isBrowserReserved(c);
    const kind = keyKind(combo.code);
    const near = KEYBOARD
        .filter(k => !k.inert && k.code !== combo.code && !NEVER_SUGGESTED.has(k.code))
        .filter(k => layer || keyKind(k.code) !== "main")
        .map(k => comboInLayer(k.code, layer))
        .filter(free)
        .sort((a, b) =>
            (keyKind(a.code) === kind ? 0 : 1) - (keyKind(b.code) === kind ? 0 : 1)
            || keyDistance(combo.code, a.code) - keyDistance(combo.code, b.code));
    const shifted = combo.shift ? null : { ...combo, shift: true };
    const withShift = !!shifted && free(shifted);
    const out = near.slice(0, withShift ? limit - 1 : limit);
    if (withShift) out.push(shifted!);
    return out;
}

// ── Walk modes ──────────────────────────────────────────────────────────

/** The direction slots a walk mode rides on (zerknij is a look, not a step). */
const WALK_DIRECTIONS: readonly (keyof DirectionBinds)[] = ["nw", "n", "ne", "w", "e", "sw", "s", "se", "u", "d", "special"];

/**
 * The modifiers a walk mode cannot use because the direction keys already hold
 * them (Shift+arrows, say): Klawisze greys them out, and the client ignores them.
 */
export function takenWalkModifiers(binds: BindSettings): WalkModifiers {
    return directionModifiers(Object.values(binds.directions ?? {}).filter(b => !!b?.key));
}

/** macOS keeps Ctrl+arrows for Mission Control and Spaces: the page never hears them. */
function macReserved(combo: Combo): boolean {
    return combo.ctrl && !combo.alt && !combo.shift && combo.code.startsWith("Arrow");
}

/**
 * What else a walk mode's modifier collides with: another walk mode on the
 * same modifier (only one of them ever runs), a binding sitting on a direction
 * key with that modifier held (both run on the one press, or the binding wins
 * when it is itself a direction), or - on a Mac - a combo the system keeps.
 * `mods` are the effective ones (see effectiveWalkModifiers). Labels, for the
 * row's warning; empty when the mode is clear or has no modifier.
 */
export function walkModeClashes(
    mode: { id: string; mods: WalkModifiers },
    modes: readonly { id: string; label: string; mods: WalkModifiers }[],
    binds: BindSettings,
    byCombo: Map<string, KeyEntry[]>,
    mac = IS_MAC,
): string[] {
    const { mods } = mode;
    if (!hasWalkModifier(mods)) return [];
    const clashes = new Set<string>();
    for (const other of modes) {
        if (other.id !== mode.id && sameWalkModifiers(other.mods, mods)) clashes.add(other.label);
    }
    for (const dir of WALK_DIRECTIONS) {
        const base = comboOf(binds.directions[dir]);
        if (!base) continue;
        const walked: Combo = { code: base.code, ctrl: base.ctrl || !!mods.ctrl, alt: base.alt || !!mods.alt, shift: base.shift || !!mods.shift };
        if (mac && macReserved(walked)) clashes.add("macOS (Ctrl+strzałki zajmuje Mission Control)");
        for (const e of byCombo.get(comboId(walked)) ?? []) clashes.add(`${e.label} (${comboLabel(walked)})`);
    }
    return [...clashes];
}
