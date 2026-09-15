import { setupMobileFooter, isCompactFooterEnabled, MOBILE_FOOTER_QUERY } from "@web/mobileFooter";
import { globalStorage } from "@modules/core/storage";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The one piece of the phone footer that is not CSS: the expander that unfolds
 * its two scrolling rails.
 */
describe("mobile footer expander", () => {
    let listeners: Array<() => void>;
    let matches: boolean;
    let teardown: () => void = () => {};

    const charState = () => document.getElementById("char-state")!;
    const button = () => document.getElementById("footer-expand")!;

    beforeEach(() => {
        listeners = [];
        matches = true;
        document.body.innerHTML = `
            <div id="char-state">
                <div id="char-state-vitals"></div>
                <div id="footer-chips"></div>
                <button id="footer-expand" type="button" title="Rozwin stopke"></button>
            </div>`;
        window.matchMedia = ((query: string) => ({
            media: query,
            get matches() { return matches; },
            addEventListener: (_: string, listener: () => void) => { listeners.push(listener); },
            removeEventListener: (_: string, listener: () => void) => {
                listeners = listeners.filter((l) => l !== listener);
            },
        })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
        teardown();
        teardown = () => {};
        document.body.innerHTML = "";
    });

    test("starts collapsed and toggles on each click", () => {
        teardown = setupMobileFooter();
        expect(charState().dataset.footerExpanded).toBe("0");

        button().click();
        expect(charState().dataset.footerExpanded).toBe("1");
        expect(button().getAttribute("title")).toBe("Zwin stopke");

        button().click();
        expect(charState().dataset.footerExpanded).toBe("0");
        expect(button().getAttribute("title")).toBe("Rozwin stopke");
    });

    // An expanded footer left over from a phone-width layout would come back on
    // the next rotation, so widening the viewport folds it away.
    test("folds itself away once the viewport is no longer phone-width", () => {
        teardown = setupMobileFooter();
        button().click();
        expect(charState().dataset.footerExpanded).toBe("1");

        matches = false;
        listeners.forEach((listener) => listener());
        expect(charState().dataset.footerExpanded).toBe("0");
    });

    test("stops listening once torn down", () => {
        const stop = setupMobileFooter();
        stop();

        button().click();
        expect(charState().dataset.footerExpanded).toBe("0");
        expect(listeners).toHaveLength(0);
    });

    test("is a no-op without a footer to expand", () => {
        document.body.innerHTML = "";
        expect(() => setupMobileFooter()()).not.toThrow();
    });
});

describe("compact footer setting", () => {
    afterEach(() => {
        globalStorage.remove("uiSettings");
    });

    test("is on unless switched off", () => {
        expect(isCompactFooterEnabled()).toBe(true);
        globalStorage.set("uiSettings", { mobileFooterCompact: true } as never);
        expect(isCompactFooterEnabled()).toBe(true);
        globalStorage.set("uiSettings", { mobileFooterCompact: false } as never);
        expect(isCompactFooterEnabled()).toBe(false);
    });

    // footerMobile.css carries the same condition on its @media block; a change
    // to one without the other splits the compact meters from their rails.
    test("uses the same breakpoint the stylesheet does", () => {
        const css = readFileSync(resolve(__dirname, "../../src/web/footerMobile.css"), "utf8");
        expect(css).toContain(`@media ${MOBILE_FOOTER_QUERY} {`);
    });
});
