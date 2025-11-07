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
        expect(segments[0].state?.foreground).toEqual({ space: "hex", color: "#ff5555" });
        expect(segments[1].text).toBe("Plain");
        expect(segments[1].state).toBeUndefined();
    });

    it("preserves metadata when inserting within a formatted region", () => {
        const buffer = new AnsiAwareBuffer("\u001b[34mBlue\u001b[0m");
        buffer.insert(2, "++");
        const segments = buffer.getSegments();
        expect(buffer.text).toBe("Bl++ue");
        expect(segments.length).toBeGreaterThan(0);
        expect(segments[0].state?.foreground).toEqual({ space: "hex", color: "#5555ff" });
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
            expect(state?.foreground).toEqual({ space: "hex", color: "#ff5555" });
        });

        it("returns undefined for plain text without formatting", () => {
            const buffer = new AnsiAwareBuffer("Plain text");
            const state = buffer.getStateAt(0);
            expect(state).toBeUndefined();
        });

        it("returns correct state for different segments", () => {
            const buffer = new AnsiAwareBuffer("\u001b[31mRed\u001b[0m and \u001b[32mGreen\u001b[0m");
            const redState = buffer.getStateAt(0);
            expect(redState?.foreground).toEqual({ space: "hex", color: "#ff5555" });

            const plainState = buffer.getStateAt(4);
            expect(plainState).toBeUndefined();

            const greenState = buffer.getStateAt(9);
            expect(greenState?.foreground).toEqual({ space: "hex", color: "#55ff55" });
        });

        it("returns all formatting attributes at index", () => {
            const buffer = new AnsiAwareBuffer("\u001b[1;3;31mBold Italic Red\u001b[0m");
            const state = buffer.getStateAt(0);
            expect(state?.foreground).toEqual({ space: "hex", color: "#ff5555" });
            expect(state?.bold).toBe(true);
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
            expect(buffer.getStateAt(0)?.foreground).toEqual({ space: "hex", color: "#ff5555" });
            expect(buffer.getStateAt(1)?.foreground).toEqual({ space: "hex", color: "#ff5555" });
            expect(buffer.getStateAt(2)).toBeUndefined();
            expect(buffer.getStateAt(3)).toBeUndefined();
            expect(buffer.getStateAt(4)?.foreground).toEqual({ space: "hex", color: "#55ff55" });
            expect(buffer.getStateAt(5)?.foreground).toEqual({ space: "hex", color: "#55ff55" });
        });
    });
});
