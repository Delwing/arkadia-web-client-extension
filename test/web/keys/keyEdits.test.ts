import { describe, expect, it } from "vitest";
import { defaultBinds } from "@modules/core/keymapStorage";
import type { BindSettings } from "@modules/core/keymapTypes";
import type { StoredBind } from "@modules/helper/helperBinds";
import { buildEntries, mergeEntries, type Combo, type KeyEntry } from "@web/keys/keysModel.ts";
import {
    addCapturedHelperBind,
    addListSlot,
    addOwnCommand,
    assignKey,
    commandOf,
    editCommand,
    removeEntry,
    removeLastListSlot,
    restoreDefaults,
    sanitize,
    setReach,
    type KeysData,
} from "@web/keys/keyEdits.ts";

const combo = (code: string, mods: Partial<Omit<Combo, "code">> = {}): Combo =>
    ({ code, ctrl: false, alt: false, shift: false, ...mods });

const binds = (patch: Partial<BindSettings> = {}): BindSettings => ({ ...structuredClone(defaultBinds), ...patch });

const helper = (patch: Partial<StoredBind>): StoredBind => ({
    id: "h1", key: "f5", mode: "global", action: "command", command: "wesprzyj", focusBrowser: false, ...patch,
});

const data = (b: BindSettings, helperBinds: StoredBind[] = []): KeysData => ({ binds: b, helperBinds, newId: () => "new" });

/** The window's rows for `d`, as the lists show them. */
const entriesOf = (d: KeysData): KeyEntry[] => mergeEntries(buildEntries(d.binds, [...d.helperBinds], [])).list;
const entry = (d: KeysData, id: string): KeyEntry => entriesOf(d).find(e => e.id === id)!;

describe("assignKey", () => {
    it("moves a built-in bind, and its helper twin along with it", () => {
        const d = data(binds({ attack: { key: "F5" } }), [helper({ action: "bind", targetBind: "attack", command: undefined })]);
        const e = entry(d, "slot:attack");
        expect(e.twinId).toBe("h1");
        const edit = assignKey(d, e, combo("F6"));
        expect(edit.binds?.attack).toEqual({ key: "F6" });
        expect(edit.helperBinds).toEqual([expect.objectContaining({ id: "h1", key: "f6" })]);
    });

    it("drops the twin when the helper cannot take the new key", () => {
        const d = data(binds({ attack: { key: "F5" } }), [helper({ action: "bind", targetBind: "attack", command: undefined })]);
        const edit = assignKey(d, entry(d, "slot:attack"), combo("Home"));
        expect(edit.helperBinds).toEqual([]);
        expect(edit.notice).toMatch(/poza klientem/);
    });

    it("gives a key the browser keeps to the helper as a second key, leaving the bind where it was", () => {
        const d = data(binds());
        const edit = assignKey(d, entry(d, "slot:attack"), combo("KeyW", { ctrl: true }));
        expect(edit.binds).toBeUndefined();
        expect(edit.helperBinds).toEqual([expect.objectContaining({ id: "new", key: "ctrl+w", mode: "browser_only", action: "bind", targetBind: "attack" })]);
    });

    it("refuses a key the browser keeps for a bind the helper cannot run, changing nothing", () => {
        const d = data(binds({ doubleK: { key: "F5" } }), []);
        const edit = assignKey(d, entry(d, "slot:doubleK"), combo("KeyW", { ctrl: true }));
        expect(edit).toEqual({ notice: expect.stringMatching(/helper nie obsłuży/) });
    });

    it("hands an own shortcut on a key the browser keeps to the helper", () => {
        const d = data(binds({ custom: [{ key: "F5", command: "kondycja" }] }));
        const edit = assignKey(d, entry(d, "custom:0"), combo("KeyW", { ctrl: true }));
        expect(edit.binds?.custom).toEqual([]);
        expect(edit.helperBinds).toEqual([expect.objectContaining({ key: "ctrl+w", mode: "browser_only", command: "kondycja" })]);
    });

    it("moves the twin of an own shortcut handed to the helper, instead of leaving it behind", () => {
        const d = data(binds({ custom: [{ key: "F5", command: "wesprzyj" }] }), [helper({})]);
        const e = entry(d, "custom:0");
        expect(e.twinId).toBe("h1");
        const edit = assignKey(d, e, combo("KeyW", { ctrl: true }));
        expect(edit.binds?.custom).toEqual([]);
        expect(edit.helperBinds).toEqual([expect.objectContaining({ id: "h1", key: "ctrl+w", mode: "global", command: "wesprzyj" })]);
    });

    it("keeps a plugin action off keys the browser keeps", () => {
        const d = data(binds());
        const pluginEntry = { id: "plugin:p1", ref: { kind: "plugin", id: "p1" }, combo: null } as unknown as KeyEntry;
        expect(assignKey(d, pluginEntry, combo("KeyW", { ctrl: true })).notice).toMatch(/pluginów/);
        expect(assignKey(d, pluginEntry, combo("F7")).binds?.pluginKeys).toEqual({ p1: { key: "F7" } });
    });
});

describe("setReach", () => {
    it("adds a helper twin on the same key to make a bind work everywhere, and removes it to go back", () => {
        const d = data(binds({ attack: { key: "F5" } }));
        const added = setReach(d, entry(d, "slot:attack"), "global");
        expect(added.helperBinds).toEqual([expect.objectContaining({ key: "f5", mode: "global", targetBind: "attack" })]);

        const withTwin = data(d.binds, added.helperBinds);
        expect(setReach(withTwin, entry(withTwin, "slot:attack"), "client").helperBinds).toEqual([]);
    });

    it("switches the twin's mode rather than adding another", () => {
        const d = data(binds({ attack: { key: "F5" } }), [helper({ action: "bind", targetBind: "attack", command: undefined })]);
        const edit = setReach(d, entry(d, "slot:attack"), "global_focus");
        expect(edit.helperBinds).toEqual([expect.objectContaining({ id: "h1", mode: "global_focus", focusBrowser: true })]);
    });
});

describe("own shortcuts", () => {
    it("adds a client shortcut and points the caret at it", () => {
        const edit = addOwnCommand(data(binds()), "client");
        expect(edit.binds?.custom).toEqual([{ command: "", key: "" }]);
        expect(edit.newRow).toBe("custom:0");
    });

    it("adds a helper shortcut on a key in hand", () => {
        const edit = addOwnCommand(data(binds()), "global", combo("F8"));
        expect(edit.helperBinds).toEqual([expect.objectContaining({ id: "new", key: "f8", action: "command", command: "" })]);
        expect(edit.newRow).toBe("helper:new");
    });

    it("types a command into both halves of a binding", () => {
        const d = data(binds({ custom: [{ key: "F5", command: "wesprzyj" }] }), [helper({})]);
        const e = entry(d, "custom:0");
        const edit = editCommand(d, e, "zabij");
        expect(edit.binds?.custom[0].command).toBe("zabij");
        expect(edit.helperBinds?.[0].command).toBe("zabij");
        expect(commandOf(d, e)).toBe("wesprzyj");
    });

    it("removes an own shortcut together with its twin", () => {
        const d = data(binds({ custom: [{ key: "F5", command: "wesprzyj" }] }), [helper({})]);
        const edit = removeEntry(d, entry(d, "custom:0"));
        expect(edit.binds?.custom).toEqual([]);
        expect(edit.helperBinds).toEqual([]);
    });

    it("never stores an empty own shortcut", () => {
        const b = binds({ custom: [{ key: "", command: "x" }, { key: "F5", command: " " }, { key: "F6", command: "y" }] });
        expect(sanitize(b).custom).toEqual([{ key: "F6", command: "y" }]);
    });
});

describe("captured helper hotkeys", () => {
    it("makes the window-summoning hotkey global and focusing", () => {
        const edit = addCapturedHelperBind(data(binds()), combo("F9"), { kind: "new-helper", target: "focus" });
        expect(edit.helperBinds).toEqual([expect.objectContaining({ key: "f9", mode: "global_focus", targetBind: "focus" })]);
        expect(edit.newRow).toBeUndefined();
    });

    it("keeps a new helper command to the client window on a key the browser keeps", () => {
        const edit = addCapturedHelperBind(data(binds()), combo("KeyW", { ctrl: true }), { kind: "new-helper-command" });
        expect(edit.helperBinds).toEqual([expect.objectContaining({ mode: "browser_only", action: "command" })]);
        expect(edit.newRow).toBe("helper:new");
    });
});

describe("slot lists and defaults", () => {
    it("grows a list by a keyless slot and drops the last one with its twin", () => {
        const d = data(binds({ temp: [{ key: "F5" }] }));
        expect(addListSlot(d, "temp").binds?.temp).toEqual([{ key: "F5" }, { key: "" }]);

        const twin = helper({ action: "bind", targetBind: "temp_1", command: undefined });
        const withTwin = data(d.binds, [twin]);
        const entries = entriesOf(withTwin);
        const edit = removeLastListSlot(withTwin, "temp", entries);
        expect(edit.binds?.temp).toEqual([]);
        if (entries.find(e => e.id === "slot:temp[0]")?.twinId) expect(edit.helperBinds).toEqual([]);
    });

    it("restores the standard binds but keeps own shortcuts", () => {
        const custom = [{ key: "F5", command: "x" }];
        const restored = restoreDefaults(data(binds({ attack: { key: "F12" }, custom }))).binds!;
        expect(restored.attack).toEqual(defaultBinds.attack);
        expect(restored.custom).toBe(custom);
        expect(restored.mainGates).toBeUndefined();
    });
});
