import { beforeEach, describe, expect, it, vi } from "vitest";
import { HELPER_WINDOW_MATCH_PATTERNS, setupHelperResync, windowMatchPatterns } from "@modules/helper/helperResync";
import type { HelperConnection } from "@modules/helper/HelperConnection";

function fakeHelper() {
    let listener: ((state: string) => void) | null = null;
    const sent: unknown[] = [];
    const helper = {
        send: (msg: unknown) => { sent.push(msg); },
        getState: () => "connected",
        onStateChange: (fn: (state: string) => void) => {
            listener = fn;
            return () => { listener = null; };
        },
    };
    return { helper: helper as unknown as HelperConnection, sent, connect: () => listener?.("connected") };
}

const patternsOf = (sent: unknown[]) =>
    sent.filter((m): m is { type: string; patterns: string[] } => (m as { type: string }).type === "set_window_match");

describe("helper window match patterns", () => {
    beforeEach(() => {
        document.title = "ㅤ Arkadia";
    });

    it("sends only this tab's own title", () => {
        // Anything generic matches a chat window in a channel named after the
        // game, or an editor with the repository open — raising one of those is
        // worse than raising nothing.
        expect(windowMatchPatterns()).toEqual(["ㅤ Arkadia"]);
    });

    it("falls back to the generic patterns when the tab has no title", () => {
        document.title = "";
        expect(windowMatchPatterns()).toEqual(HELPER_WINDOW_MATCH_PATTERNS);
    });

    it("sends the patterns and the binds on every connect", () => {
        const { helper, sent, connect } = fakeHelper();
        setupHelperResync(helper);

        connect();

        expect(patternsOf(sent)[0].patterns[0]).toBe("ㅤ Arkadia");
        expect(sent.some(m => (m as { type: string }).type === "register_binds")).toBe(true);
    });

    it("re-sends them when the tab title changes, and stops after unsubscribing", async () => {
        const { helper, sent, connect } = fakeHelper();
        const stop = setupHelperResync(helper);
        connect();

        document.title = "⚔ Arkadia";
        await vi.waitFor(() => expect(patternsOf(sent)).toHaveLength(2));
        expect(patternsOf(sent)[1].patterns[0]).toBe("⚔ Arkadia");

        stop();
        document.title = "ㅤ Arkadia [5/7]";
        await new Promise(r => setTimeout(r, 20));
        expect(patternsOf(sent)).toHaveLength(2);
    });
});
