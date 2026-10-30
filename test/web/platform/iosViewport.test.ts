import { describe, it, expect, beforeEach } from "vitest";
import { installMapLayoutOffsets } from "@web/platform/iosViewport";

class FakeViewport extends EventTarget {
    height = 800;
}

function makeWindow(userAgent: string) {
    const target = new EventTarget();
    const viewport = new FakeViewport();
    const win = Object.assign(target, {
        document,
        navigator: { userAgent },
        visualViewport: viewport,
        outerHeight: 900,
    });
    return { win: win as unknown as Window, viewport };
}

describe("installMapLayoutOffsets", () => {
    let map: HTMLElement;
    let main: HTMLElement;

    beforeEach(() => {
        map = document.createElement("div");
        main = document.createElement("div");
        document.body.dataset.mapPosition = "top-overlay";
    });

    it("pins the top-overlay map at the top initially", () => {
        const { win } = makeWindow("Mozilla/5.0 (X11; Linux x86_64)");
        installMapLayoutOffsets(map, main, win);
        expect(map.style.top).toBe("0px");
        expect(main.style.paddingTop).toBe("2px");
    });

    it("follows the iOS keyboard as the visual viewport shrinks", () => {
        const { win, viewport } = makeWindow("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)");
        installMapLayoutOffsets(map, main, win);
        viewport.height = 500;
        viewport.dispatchEvent(new Event("resize"));
        expect(map.style.top).toBe("300px");
        expect(main.style.paddingTop).toBe("302px");
    });

    it("ignores viewport resizes off iOS", () => {
        const { win, viewport } = makeWindow("Mozilla/5.0 (X11; Linux x86_64)");
        installMapLayoutOffsets(map, main, win);
        viewport.height = 500;
        viewport.dispatchEvent(new Event("resize"));
        expect(map.style.top).toBe("0px");
    });

    it("clears the offsets when the map moves out of the top overlay", () => {
        const { win } = makeWindow("Mozilla/5.0 (X11; Linux x86_64)");
        installMapLayoutOffsets(map, main, win);
        document.body.dataset.mapPosition = "dock";
        win.dispatchEvent(new Event("map-position-change"));
        expect(map.style.top).toBe("");
        expect(main.style.paddingTop).toBe("");
    });
});
