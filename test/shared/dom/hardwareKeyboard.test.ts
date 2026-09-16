import {
    hasHardwareKeyboard,
    subscribeHardwareKeyboard,
    resetHardwareKeyboardDetection,
} from "@shared/dom/hardwareKeyboard";

/**
 * The guess behind the bind row's shortcut hints. A phone is assumed to have no
 * keyboard until it proves otherwise; anything with a fine pointer is assumed to
 * have one from the start.
 */
describe("hardware keyboard detection", () => {
    let pointers: { coarse: boolean; fine: boolean };

    const press = (init: KeyboardEventInit) =>
        document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, ...init}));

    beforeEach(() => {
        pointers = {coarse: true, fine: false};
        document.body.innerHTML = '<input id="cmd"><div id="plain"></div>';
        window.matchMedia = ((query: string) => ({
            media: query,
            matches: query.includes("coarse") ? pointers.coarse : pointers.fine,
            addEventListener: () => {},
            removeEventListener: () => {},
        })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
        resetHardwareKeyboardDetection();
        document.body.innerHTML = "";
    });

    test("a device with a fine pointer has a keyboard from the start", () => {
        pointers = {coarse: false, fine: true};
        expect(hasHardwareKeyboard()).toBe(true);
    });

    // A touch-screen laptop reports both; it comes with a keyboard, so it must
    // not be lumped in with the phones.
    test("a device with both pointers has a keyboard from the start", () => {
        pointers = {coarse: true, fine: true};
        expect(hasHardwareKeyboard()).toBe(true);
    });

    test("a touch-only device is assumed to have none", () => {
        expect(hasHardwareKeyboard()).toBe(false);
    });

    test("a modifier keystroke proves one, and tells subscribers", () => {
        const seen: boolean[] = [];
        subscribeHardwareKeyboard((present) => seen.push(present));
        expect(hasHardwareKeyboard()).toBe(false);

        document.getElementById("cmd")!.focus();
        press({key: "1", altKey: true});

        expect(hasHardwareKeyboard()).toBe(true);
        expect(seen).toEqual([true]);
    });

    test.each(["Tab", "Escape", "F5", "Control"])("%s proves one", (key) => {
        // Reading the guess is what starts detection, so nothing is watching
        // until somebody asks - which in the app is the bind row mounting.
        expect(hasHardwareKeyboard()).toBe(false);
        document.getElementById("cmd")!.focus();
        press({key});
        expect(hasHardwareKeyboard()).toBe(true);
    });

    // An on-screen keyboard only exists over a focused field, so a plain letter
    // arriving with nothing focused came from something physical.
    test("a keystroke with no field focused proves one", () => {
        expect(hasHardwareKeyboard()).toBe(false);
        press({key: "a"});
        expect(hasHardwareKeyboard()).toBe(true);
    });

    test("typing into a field proves nothing by itself", () => {
        expect(hasHardwareKeyboard()).toBe(false);
        document.getElementById("cmd")!.focus();
        press({key: "a"});
        expect(hasHardwareKeyboard()).toBe(false);
    });
});
