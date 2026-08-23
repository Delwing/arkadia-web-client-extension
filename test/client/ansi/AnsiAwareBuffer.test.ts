import {
    AnsiAwareBuffer,
    FormatStateSnapshot,
    formatStatesEqual,
} from "../../../src/client/ansi/FormatState";

describe("AnsiAwareBuffer", () => {
    const extractStates = (buffer: AnsiAwareBuffer): (FormatStateSnapshot | undefined)[] =>
        buffer.getSegments().map(segment => segment.state);

    it("parses ANSI colour codes into metadata segments", () => {
        const buffer = new AnsiAwareBuffer("\u001b[31mRed\u001b[0mPlain");
        const segments = buffer.getSegments();
        expect(segments).toHaveLength(2);
        expect(segments[0].text).toBe("Red");
        expect(segments[0].state?.foreground).toEqual({ space: "hex", color: "#bb0000" });
        expect(segments[1].text).toBe("Plain");
        expect(segments[1].state).toBeUndefined();
    });

    it("preserves metadata when inserting within a formatted region", () => {
        const buffer = new AnsiAwareBuffer("\u001b[34mBlue\u001b[0m");
        buffer.insert(2, "++");
        const segments = buffer.getSegments();
        expect(buffer.text).toBe("Bl++ue");
        expect(segments.length).toBeGreaterThan(0);
        expect(segments[0].state?.foreground).toEqual({ space: "hex", color: "#0000bb" });
    });

    it("keeps surrounding metadata intact after replace operations", () => {
        const buffer = new AnsiAwareBuffer("\u001b[31mRed\u001b[0m and \u001b[32mGreen\u001b[0m");
        const beforeStates = extractStates(buffer);
        const start = buffer.text.indexOf("and");
        buffer.replace([start, start + 3], "or");
        const afterStates = extractStates(buffer);
        expect(afterStates[0]).not.toBe(beforeStates[0]);
        expect(formatStatesEqual(afterStates[0], beforeStates[0])).toBe(true);
        expect(formatStatesEqual(afterStates[afterStates.length - 1], beforeStates[beforeStates.length - 1])).toBe(true);
    });

    it("retains hyperlink metadata across edits", () => {
        // Create buffer and add hyperlink using modern API
        const buffer = new AnsiAwareBuffer("Look here");
        const onClick = jest.fn();
        buffer.createLink([0, 9], { onClick, title: "look" });

        // Append text
        buffer.append(" around");

        // Replace within the hyperlinked area
        buffer.replace([0, 4], "Inspect");

        // Verify the hyperlink is retained
        const segments = buffer.getSegments();
        expect(segments.length).toBeGreaterThan(0);

        // Find the segment with hyperlink
        const hyperlinkSegment = segments.find(seg => seg.state?.hyperlink);
        expect(hyperlinkSegment).toBeDefined();
        expect(hyperlinkSegment?.state?.hyperlink?.title).toBe("look");
        expect(hyperlinkSegment?.state?.hyperlink?.onClick).toBe(onClick);

        expect(buffer.text).toBe("Inspect here around");
    });

    describe("getStateAt", () => {
        it("returns color at specific character index in colored text", () => {
            const buffer = new AnsiAwareBuffer("\u001b[31mRed\u001b[0m");
            const state = buffer.getStateAt(0);
            expect(state?.foreground).toEqual({ space: "hex", color: "#bb0000" });
        });

        it("returns undefined for plain text without formatting", () => {
            const buffer = new AnsiAwareBuffer("Plain text");
            const state = buffer.getStateAt(0);
            expect(state).toBeUndefined();
        });

        it("returns correct state for different segments", () => {
            const buffer = new AnsiAwareBuffer("\u001b[31mRed\u001b[0m and \u001b[32mGreen\u001b[0m");
            const redState = buffer.getStateAt(0);
            expect(redState?.foreground).toEqual({ space: "hex", color: "#bb0000" });

            const plainState = buffer.getStateAt(4);
            expect(plainState).toBeUndefined();

            const greenState = buffer.getStateAt(9);
            expect(greenState?.foreground).toEqual({ space: "hex", color: "#00bb00" });
        });

        it("returns all formatting attributes at index", () => {
            // Note: bold from ANSI input is intentionally ignored (only programmatic bold is supported)
            const buffer = new AnsiAwareBuffer("\u001b[1;3;31mBold Italic Red\u001b[0m");
            const state = buffer.getStateAt(0);
            expect(state?.foreground).toEqual({ space: "hex", color: "#bb0000" });
            expect(state?.bold).toBeUndefined(); // bold from ANSI is ignored
            expect(state?.italic).toBe(true);
        });

        it("throws error for out of bounds index", () => {
            const buffer = new AnsiAwareBuffer("Test");
            expect(() => buffer.getStateAt(-1)).toThrow(RangeError);
            expect(() => buffer.getStateAt(4)).toThrow(RangeError);
        });

        it("returns state at each character in multi-segment buffer", () => {
            const buffer = new AnsiAwareBuffer("\u001b[31mAB\u001b[0mCD\u001b[32mEF\u001b[0m");
            // "AB" is red, "CD" is plain, "EF" is green
            expect(buffer.getStateAt(0)?.foreground).toEqual({ space: "hex", color: "#bb0000" });
            expect(buffer.getStateAt(1)?.foreground).toEqual({ space: "hex", color: "#bb0000" });
            expect(buffer.getStateAt(2)).toBeUndefined();
            expect(buffer.getStateAt(3)).toBeUndefined();
            expect(buffer.getStateAt(4)?.foreground).toEqual({ space: "hex", color: "#00bb00" });
            expect(buffer.getStateAt(5)?.foreground).toEqual({ space: "hex", color: "#00bb00" });
        });
    });

    it("applies slow blink to half of red colored text creating correct segments", () => {
        // Start with plain text
        const buffer = new AnsiAwareBuffer("Hello World");

        // First color the entire text red
        buffer.color([0, 11], { foreground: { space: "hex", color: "#bb0000" } });

        // Then apply slow blink to first half (5 characters: "Hello")
        buffer.applyFormat([0, 5], { slowBlink: true });

        const segments = buffer.getSegments();

        // Should have 2 segments
        expect(segments).toHaveLength(2);

        // First segment: "Hello" with red foreground AND slow blink
        expect(segments[0].text).toBe("Hello");
        expect(segments[0].state?.foreground).toEqual({ space: "hex", color: "#bb0000" });
        expect(segments[0].state?.slowBlink).toBe(true);

        // Second segment: " World" with only red foreground (no slow blink)
        expect(segments[1].text).toBe(" World");
        expect(segments[1].state?.foreground).toEqual({ space: "hex", color: "#bb0000" });
        expect(segments[1].state?.slowBlink).toBeUndefined();
    });
});

describe("replaceWith", () => {
    it("carries the deleted mark onto the replacement", () => {
        const old = new AnsiAwareBuffer("gagged").markAsDeleted();

        const next = old.replaceWith(new AnsiAwareBuffer("rebuilt"));

        // Without this a gag is undone by the next script that rebuilds the
        // buffer, and the line it suppressed is rendered after all.
        expect(next.deleted).toBe(true);
        expect(next.text).toBe("rebuilt");
    });

    it("does not un-delete a replacement that was already deleted", () => {
        const old = new AnsiAwareBuffer("kept");

        const next = old.replaceWith(new AnsiAwareBuffer("rebuilt").markAsDeleted());

        expect(next.deleted).toBe(true);
    });

    it("carries the flair onto the replacement", () => {
        const old = new AnsiAwareBuffer("body");
        old.flair = "lup";

        const next = old.replaceWith(new AnsiAwareBuffer("rebuilt"));

        expect(next.flair).toBe("lup");
    });

    it("lets the replacement keep a flair it set for itself", () => {
        const old = new AnsiAwareBuffer("body");
        old.flair = "lup";
        const rebuilt = new AnsiAwareBuffer("rebuilt");
        rebuilt.flair = "ekwipunek";

        expect(old.replaceWith(rebuilt).flair).toBe("ekwipunek");
    });

    it("carries originalText, which tideSystem reads back", () => {
        const old = new AnsiAwareBuffer("shortened");
        old.originalText = "the full exits line";

        expect(old.replaceWith(new AnsiAwareBuffer("rebuilt")).originalText).toBe("the full exits line");
    });

    it("does not carry onRender, which is bound to content that is now gone", () => {
        const old = new AnsiAwareBuffer("clickable").onRender(() => {
            throw new Error("the old buffer's hook must not fire for new content");
        });

        const next = old.replaceWith(new AnsiAwareBuffer("rebuilt"));

        expect(() => next.notifyRender(document.createElement("div"))).not.toThrow();
    });

    it("is a no-op when a trigger returns the buffer it was given", () => {
        const same = new AnsiAwareBuffer("unchanged").markAsDeleted();

        expect(same.replaceWith(same)).toBe(same);
        expect(same.deleted).toBe(true);
    });
});
