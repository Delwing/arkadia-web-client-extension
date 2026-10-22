import { vi } from "vitest";
import { installLongPressContextMenu, LONG_PRESS_CONTEXT_MENU_MS } from "@shared/dom/longPressContextMenu";

/** iOS gives no contextmenu for a long press; the shim makes one. */
describe("long-press contextmenu", () => {
    let uninstall: () => void;
    let target: HTMLElement;

    const touch = (type: string, x = 10, y = 20, el: EventTarget = target) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        const touches = type === "touchend" || type === "touchcancel" ? [] : [{ clientX: x, clientY: y }];
        Object.defineProperty(event, "touches", { value: touches });
        el.dispatchEvent(event);
        return event;
    };

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '<span id="link">link</span>';
        target = document.getElementById("link")!;
        uninstall = installLongPressContextMenu();
    });

    afterEach(() => {
        uninstall();
        vi.useRealTimers();
    });

    it("fires contextmenu at the finger after a still hold", () => {
        const menu = vi.fn((e: MouseEvent) => [e.clientX, e.clientY]);
        target.addEventListener("contextmenu", menu);
        touch("touchstart", 30, 40);
        vi.advanceTimersByTime(LONG_PRESS_CONTEXT_MENU_MS - 1);
        expect(menu).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(menu).toHaveBeenCalledTimes(1);
        expect(menu.mock.results[0].value).toEqual([30, 40]);
    });

    it("does nothing for a tap or a scroll", () => {
        const menu = vi.fn();
        target.addEventListener("contextmenu", menu);
        touch("touchstart");
        touch("touchend");
        vi.advanceTimersByTime(LONG_PRESS_CONTEXT_MENU_MS);
        touch("touchstart", 10, 20);
        touch("touchmove", 10, 60);
        vi.advanceTimersByTime(LONG_PRESS_CONTEXT_MENU_MS);
        expect(menu).not.toHaveBeenCalled();
    });

    it("swallows the lift and its click once a handler took the hold", () => {
        target.addEventListener("contextmenu", (e) => e.preventDefault());
        const click = vi.fn();
        target.addEventListener("click", click);
        touch("touchstart");
        vi.advanceTimersByTime(LONG_PRESS_CONTEXT_MENU_MS);
        expect(touch("touchend").defaultPrevented).toBe(true);
        target.click();
        expect(click).not.toHaveBeenCalled();
        target.click();
        expect(click).toHaveBeenCalledTimes(1);
    });

    it("leaves the lift alone when nobody took the hold", () => {
        const click = vi.fn();
        target.addEventListener("click", click);
        touch("touchstart");
        vi.advanceTimersByTime(LONG_PRESS_CONTEXT_MENU_MS);
        expect(touch("touchend").defaultPrevented).toBe(false);
        target.click();
        expect(click).toHaveBeenCalledTimes(1);
    });
});
