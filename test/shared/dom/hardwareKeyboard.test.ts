import {
    hasHardwareKeyboard,
    subscribeHardwareKeyboard,
    resetHardwareKeyboardDetection,
} from "@shared/dom/hardwareKeyboard";

/**
 * The guess behind the bind row's shortcut hints. A desktop has a keyboard from
 * the start; a mobile device has none until Alt, Ctrl or Tab proves otherwise.
 */
describe("hardware keyboard detection", () => {
    let pointers: { coarse: boolean; fine: boolean };
    let phoneScreen: boolean;

    const press = (init: KeyboardEventInit) =>
        document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, ...init}));

    beforeEach(() => {
        pointers = {coarse: true, fine: false};
        phoneScreen = true;
        document.body.innerHTML = '<input id="cmd"><div id="plain"></div>';
        window.matchMedia = ((query: string) => ({
            media: query,
            matches: query.includes("max-width") ? phoneScreen
                : query.includes("coarse") ? pointers.coarse : pointers.fine,
            addEventListener: () => {},
            removeEventListener: () => {},
        })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
        resetHardwareKeyboardDetection();
        document.body.innerHTML = "";
    });

    test("a desktop has a keyboard from the start", () => {
        pointers = {coarse: false, fine: true};
        phoneScreen = false;
        expect(hasHardwareKeyboard()).toBe(true);
    });

    // A touch-screen laptop reports both; it comes with a keyboard, so it must
    // not be lumped in with the phones.
    test("a wide screen with both pointers has a keyboard from the start", () => {
        pointers = {coarse: true, fine: true};
        phoneScreen = false;
        expect(hasHardwareKeyboard()).toBe(true);
    });

    test("a touch-only tablet is assumed to have none", () => {
        phoneScreen = false;
        expect(hasHardwareKeyboard()).toBe(false);
    });

    // Phones with a stylus report a fine pointer too; the screen gives them away.
    test("a phone that reports a fine pointer is still assumed to have none", () => {
        pointers = {coarse: true, fine: true};
        expect(hasHardwareKeyboard()).toBe(false);
    });

    test("an Alt shortcut proves one, and tells subscribers", () => {
        const seen: boolean[] = [];
        subscribeHardwareKeyboard((present) => seen.push(present));
        expect(hasHardwareKeyboard()).toBe(false);

        document.getElementById("cmd")!.focus();
        press({key: "1", altKey: true});

        expect(hasHardwareKeyboard()).toBe(true);
        expect(seen).toEqual([true]);
    });

    test.each(["Tab", "Control", "Alt"])("%s proves one", (key) => {
        // Reading the guess is what starts detection, so nothing is watching
        // until somebody asks - which in the app is the bind row mounting.
        expect(hasHardwareKeyboard()).toBe(false);
        document.getElementById("cmd")!.focus();
        press({key});
        expect(hasHardwareKeyboard()).toBe(true);
    });

    test.each(["Escape", "F5", "Meta", "Enter"])("%s proves nothing", (key) => {
        expect(hasHardwareKeyboard()).toBe(false);
        document.getElementById("cmd")!.focus();
        press({key});
        expect(hasHardwareKeyboard()).toBe(false);
    });

    // An Android on-screen keyboard can outlive the field's focus.
    test("a keystroke with no field focused proves nothing", () => {
        expect(hasHardwareKeyboard()).toBe(false);
        press({key: "Enter"});
        press({key: "a"});
        expect(hasHardwareKeyboard()).toBe(false);
    });

    test("typing into a field proves nothing", () => {
        expect(hasHardwareKeyboard()).toBe(false);
        document.getElementById("cmd")!.focus();
        press({key: "a"});
        expect(hasHardwareKeyboard()).toBe(false);
    });
});
