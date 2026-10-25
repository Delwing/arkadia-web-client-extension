import { beforeEach, describe, expect, it } from "vitest";
import { globalStorage } from "@modules/core/storage";
import { bindMatches, type BindSettings } from "@modules/core/keymapTypes";
import {
    bindCodeOf,
    isNumLockOffNumpad,
    isNumpadNotNavigation,
    numLockOffNavKey,
} from "@modules/core/numpadKeys";

const key = (code: string, key: string, mods: Partial<KeyboardEvent> = {}) =>
    new KeyboardEvent("keydown", { code, key, ...mods });

const num8On = () => key("Numpad8", "8");
const num8Off = () => key("Numpad8", "ArrowUp");

function setBinds(binds: Partial<BindSettings>): void {
    globalStorage.set("binds", binds as BindSettings);
}

describe("numpadKeys", () => {
    beforeEach(() => setBinds({}));

    it("reads NumLock off from the key the numpad reports", () => {
        expect(isNumLockOffNumpad(num8Off())).toBe(true);
        expect(isNumLockOffNumpad(num8On())).toBe(false);
        expect(isNumLockOffNumpad(key("NumpadDecimal", ","))).toBe(false);
        expect(isNumLockOffNumpad(key("NumpadDecimal", "Delete"))).toBe(true);
        // A real arrow, and numpad keys NumLock leaves alone.
        expect(isNumLockOffNumpad(key("ArrowUp", "ArrowUp"))).toBe(false);
        expect(isNumLockOffNumpad(key("NumpadEnter", "Enter"))).toBe(false);
    });

    it("keeps the numpad the numpad by default", () => {
        expect(bindCodeOf(num8Off())).toBe("Numpad8");
        expect(bindMatches(num8Off(), { key: "Numpad8" })).toBe(true);
        // The command line must not take it for history.
        expect(isNumpadNotNavigation(num8Off())).toBe(true);
        expect(isNumpadNotNavigation(num8On())).toBe(false);
        expect(isNumpadNotNavigation(key("ArrowUp", "ArrowUp"))).toBe(false);
    });

    it("tells NumLock off apart when the keymap asks", () => {
        setBinds({ numLockAware: true });
        expect(bindCodeOf(num8Off())).toBe("Numpad8Off");
        expect(bindCodeOf(num8On())).toBe("Numpad8");
        expect(bindMatches(num8Off(), { key: "Numpad8" })).toBe(false);
        expect(bindMatches(num8On(), { key: "Numpad8" })).toBe(true);
        expect(bindMatches(num8Off(), { key: "Numpad8Off" })).toBe(true);
        // Nothing on it: it acts as the arrow it reports.
        expect(isNumpadNotNavigation(num8Off())).toBe(false);
    });

    it("keeps a bound NumLock-off key away from the command line", () => {
        setBinds({ numLockAware: true, custom: [{ key: "Numpad8Off", command: "kiwnij" }] });
        expect(isNumpadNotNavigation(num8Off())).toBe(true);
        expect(isNumpadNotNavigation(key("Numpad2", "ArrowDown"))).toBe(false);
    });

    it("names the navigation key behind a NumLock-off code", () => {
        expect(numLockOffNavKey("Numpad8Off")).toBe("ArrowUp");
        expect(numLockOffNavKey("Numpad5Off")).toBe("Clear");
        expect(numLockOffNavKey("Numpad8")).toBeNull();
        expect(numLockOffNavKey("KeyQOff")).toBeNull();
    });
});
