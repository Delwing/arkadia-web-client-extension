import { describe, expect, it } from "vitest";
import { defaultBinds } from "@modules/core/keymapStorage";
import type { BindSettings } from "@modules/core/keymapTypes";
import type { StoredBind } from "@modules/helper/helperBinds";
import {
    buildEntries,
    classifyKey,
    comboId,
    comboLabel,
    conflicts,
    entriesByCombo,
    entryWorks,
    freeKeysNear,
    mergeEntries,
    fromHelperKey,
    isBrowserReserved,
    normalizeCode,
    readSlot,
    toHelperKey,
    writeSlot,
    type Combo,
} from "@web/keys/keysModel.ts";

const combo = (code: string, mods: Partial<Omit<Combo, "code">> = {}): Combo =>
    ({ code, ctrl: false, alt: false, shift: false, ...mods });

const binds = (patch: Partial<BindSettings> = {}): BindSettings => ({ ...structuredClone(defaultBinds), ...patch });

const helper = (patch: Partial<StoredBind>): StoredBind => ({
    id: "h1", key: "ctrl+w", mode: "browser_only", action: "command", command: "wesprzyj druzyne", focusBrowser: false, ...patch,
});

describe("keys and labels", () => {
    it("treats a bare character as its key code", () => {
        expect(normalizeCode("q")).toBe("KeyQ");
        expect(normalizeCode("4")).toBe("Digit4");
        expect(normalizeCode("F5")).toBe("F5");
    });

    it("prints keystrokes the way keycaps read", () => {
        expect(comboLabel(combo("Equal", { ctrl: true, alt: true }))).toBe("Ctrl+Alt+=");
        expect(comboLabel(combo("Numpad8"))).toBe("Num8");
        expect(comboLabel(combo("NumpadMultiply"))).toBe("Num*");
        expect(comboLabel(combo("BracketRight"))).toBe("]");
    });

    it("knows the keystrokes the browser keeps", () => {
        expect(isBrowserReserved(combo("KeyW", { ctrl: true }))).toBe(true);
        expect(isBrowserReserved(combo("KeyT", { ctrl: true, shift: true }))).toBe(true);
        expect(isBrowserReserved(combo("KeyW"))).toBe(false);
        expect(isBrowserReserved(combo("KeyQ", { ctrl: true }))).toBe(false);
    });
});

describe("helper key names", () => {
    it("round-trips keys the helper knows", () => {
        for (const c of [combo("KeyW", { ctrl: true }), combo("F9", { ctrl: true, shift: true }), combo("Digit1", { ctrl: true, alt: true }), combo("ArrowLeft")]) {
            const key = toHelperKey(c);
            expect(key).not.toBeNull();
            expect(fromHelperKey(key!)).toEqual(c);
        }
        expect(toHelperKey(combo("KeyW", { ctrl: true }))).toBe("ctrl+w");
    });

    it("covers the keys this client actually binds", () => {
        // "]" is the functional bind and the numpad is the directions: without
        // these, the binds people most want everywhere could not go there.
        expect(toHelperKey(combo("BracketRight"))).toBe("rbracket");
        expect(toHelperKey(combo("Numpad8"))).toBe("num8");
        expect(toHelperKey(combo("NumpadAdd", { ctrl: true }))).toBe("ctrl+numadd");
        for (const code of ["BracketRight", "Numpad8", "NumpadAdd", "Backquote", "Slash", "Minus"]) {
            expect(fromHelperKey(toHelperKey(combo(code))!)).toEqual(combo(code));
        }
    });

    it("refuses keys nothing maps", () => {
        expect(toHelperKey(combo("NumpadEnter"))).toBeNull();
        expect(toHelperKey(combo("F13"))).toBeNull();
        expect(fromHelperKey("ctrl+wat")).toBeNull();
    });
});

describe("entries", () => {
    it("lists slots, own shortcuts and helper hotkeys", () => {
        const entries = buildEntries(
            binds({ custom: [{ key: "F7", command: "leczenie" }] }),
            [helper({}), helper({ id: "h2", key: "ctrl+alt+1", mode: "global", action: "bind", command: undefined, targetBind: "attack" })],
        );
        const attack = entries.find(e => e.id === "slot:attack")!;
        expect(attack.combo).toEqual(combo("Digit1", { ctrl: true }));
        expect(entries.find(e => e.id === "slot:mainGates")!.inherits).toBe(true);
        expect(entries.find(e => e.id === "custom:0")!.command).toBe("leczenie");
        const second = entries.find(e => e.id === "helper:h2")!;
        expect(second.group).toBe("basic");
        expect(second.targetLabel).toBe("Atakuj");
        expect(second.reach).toBe("global");
        expect(entries.find(e => e.id === "helper:h1")!.reach).toBe("helper");
    });

    it("finds two bindings on one key", () => {
        const entries = buildEntries(binds({ custom: [{ key: "F5", command: "zaslon sie" }] }), []);
        const byCombo = entriesByCombo(entries);
        expect(conflicts(byCombo, true)).toEqual(["F5"]);
        expect(byCombo.get("F5")!.map(e => e.id)).toEqual(["slot:temp[1]", "custom:0"]);
    });

    it("says a page bind on a browser key never fires, a helper one needs the helper", () => {
        const [own] = buildEntries(binds({ custom: [{ key: "KeyW", ctrl: true, command: "x" }] }), []).filter(e => e.ref.kind === "custom");
        expect(entryWorks(own, true)).toBe(false);
        const hot = buildEntries(binds(), [helper({})]).find(e => e.ref.kind === "helper")!;
        expect(entryWorks(hot, false)).toBe(false);
        expect(entryWorks(hot, true)).toBe(true);
    });
});

describe("a key the helper takes over", () => {
    // F1 attacks enemy 1 in the client; the same key handed to the helper makes
    // it work from any window. The helper swallows the key, so only one of the
    // two ever fires — that is not a conflict.
    const sameKeyEntries = () => buildEntries(
        binds(),
        [helper({ id: "h1", key: "f1", mode: "global", action: "bind", command: undefined, targetBind: "enemy1" })],
    ).filter(e => e.id === "slot:enemy[0]" || e.id === "helper:h1");

    it("is not a conflict, and the helper is what fires while it runs", () => {
        const state = classifyKey(sameKeyEntries(), true);
        expect(state.conflict).toBe(false);
        expect(state.helperTakesOver).toBe(true);
        expect(state.active.map(e => e.id)).toEqual(["helper:h1"]);
        expect(state.shadowed.map(e => e.id)).toEqual(["slot:enemy[0]"]);
    });

    it("falls back to the bind in the client when the helper is not running", () => {
        const state = classifyKey(sameKeyEntries(), false);
        expect(state.conflict).toBe(false);
        expect(state.helperTakesOver).toBe(false);
        expect(state.active.map(e => e.id)).toEqual(["slot:enemy[0]"]);
    });

    it("still reports two bindings on the same side as a conflict", () => {
        const entries = buildEntries(binds({ custom: [{ key: "F5", command: "zaslon sie" }] }), []);
        const state = classifyKey(entriesByCombo(entries).get("F5")!, true);
        expect(state.conflict).toBe(true);
        expect(conflicts(entriesByCombo(entries), true)).toEqual(["F5"]);
    });

    it("folds the helper hotkey into the binding it mirrors", () => {
        const { list } = mergeEntries(sameKeyEntries());
        expect(list).toHaveLength(1);
        expect(list[0].id).toBe("slot:enemy[0]");
        expect(list[0].reach).toBe("global");
        expect(list[0].twinId).toBe("h1");
    });

    it("leaves a helper hotkey that mirrors nothing as a binding of its own", () => {
        // A shortcut on a key the browser keeps has no client side at all.
        const { list } = mergeEntries(buildEntries(binds(), [helper({ id: "hw" })]));
        const own = list.filter(e => e.group === "own");
        expect(own.map(e => e.command)).toEqual(["wesprzyj druzyne"]);
        expect(own[0].reach).toBe("helper");
    });

    it("keeps the window-summoning hotkey out of the lists", () => {
        const entries = buildEntries(binds(), [helper({ id: "hf", key: "ctrl+f12", mode: "global_focus", action: "bind", command: undefined, targetBind: "focus" })]);
        const { list, focus } = mergeEntries(entries);
        expect(focus?.label).toBe("Przywołaj okno klienta");
        expect(list.some(e => e.ref.kind === "helper")).toBe(false);
    });
});

describe("writing slots", () => {
    it("sets and clears plain, listed and direction slots", () => {
        let b = writeSlot(binds(), "lamp", { key: "F9" });
        expect(b.lamp).toEqual({ key: "F9" });
        b = writeSlot(b, "enemy[1]", { key: "F6", shift: true });
        expect(b.enemy[1]).toEqual({ key: "F6", shift: true });
        expect(b.enemy[0]).toEqual(defaultBinds.enemy[0]);
        b = writeSlot(b, "directions.n", undefined);
        expect(readSlot(b, "directions.n")).toEqual({ key: "" });
    });

    it("drops a Funkcyjny situation's own key so it follows Funkcyjny again", () => {
        const b = writeSlot(binds({ mainGates: { key: "KeyG", alt: true } }), "mainGates", undefined);
        expect("mainGates" in b).toBe(false);
    });

    it("does not touch the original", () => {
        const original = binds();
        writeSlot(original, "directions.n", { key: "ArrowUp" });
        expect(original.directions.n).toEqual(defaultBinds.directions.n);
    });
});

describe("free keys", () => {
    it("offers F-keys near an F-key and Shift on the same key", () => {
        const byCombo = entriesByCombo(buildEntries(binds({ custom: [{ key: "F5", command: "zaslon sie" }, { key: "F7", command: "a" }, { key: "F8", command: "b" }] }), []));
        const free = freeKeysNear(combo("F5"), byCombo).map(comboId);
        expect(free[0]).toBe("F6");
        expect(free).toContain("shift+F5");
        expect(free.every(id => /F\d+$/.test(id))).toBe(true);
    });

    it("never offers a bare typing key", () => {
        const byCombo = entriesByCombo(buildEntries(binds(), []));
        const free = freeKeysNear(combo("Backquote"), byCombo, 8).map(c => c.code);
        expect(free.some(code => /^(Key|Digit)/.test(code))).toBe(false);
    });
});
