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

    describe("toAnsi", () => {
        it("round-trips a coloured segment through 24-bit SGR codes", () => {
            const buffer = new AnsiAwareBuffer("\u001b[31mRed\u001b[0mPlain");
            const ansi = buffer.toAnsi();
            // #bb0000 -> 187,0,0
            expect(ansi).toBe("\u001b[0m\u001b[38;2;187;0;0mRed\u001b[0mPlain\u001b[0m");
        });

        it("reflects bold/underline/strikethrough as SGR attribute codes", () => {
            const buffer = new AnsiAwareBuffer();
            buffer.append("hi", { bold: true, underline: true, strikethrough: true });
            expect(buffer.toAnsi()).toBe("\u001b[0m\u001b[1;4;9mhi\u001b[0m");
        });

        it("swaps foreground/background when inverse is set", () => {
            const buffer = new AnsiAwareBuffer();
            buffer.append("hi", {
                inverse: true,
                foreground: { space: "rgb", r: 1, g: 2, b: 3 },
                background: { space: "rgb", r: 4, g: 5, b: 6 },
            });
            expect(buffer.toAnsi()).toBe("\u001b[0m\u001b[38;2;4;5;6;48;2;1;2;3mhi\u001b[0m");
        });

        it("drops hyperlink metadata (no ANSI equivalent) but keeps the text", () => {
            const buffer = new AnsiAwareBuffer("Look here");
            buffer.createLink([0, 4], { title: "look" });
            expect(buffer.toAnsi()).toBe("\u001b[0mLook\u001b[0m here\u001b[0m");
        });
    });
});
