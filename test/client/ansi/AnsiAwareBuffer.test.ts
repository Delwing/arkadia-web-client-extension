import {
    AnsiAwareBuffer,
    FormatStateSnapshot,
    formatStatesEqual,
} from "../../src/ansi/FormatState";

describe("AnsiAwareBuffer", () => {
    const extractStates = (buffer: AnsiAwareBuffer): (FormatStateSnapshot | undefined)[] =>
        buffer.getSegments().map(segment => segment.state);

    it("parses ANSI colour codes into metadata segments", () => {
        const buffer = new AnsiAwareBuffer("\u001b[31mRed\u001b[0mPlain");
        const segments = buffer.getSegments();
        expect(segments).toHaveLength(2);
        expect(segments[0].text).toBe("Red");
        expect(segments[0].state?.foreground).toEqual({ space: "indexed", index: 1 });
        expect(segments[1].text).toBe("Plain");
        expect(segments[1].state).toBeUndefined();
    });

    it("preserves metadata when inserting within a formatted region", () => {
        const buffer = new AnsiAwareBuffer("\u001b[34mBlue\u001b[0m");
        buffer.insert(2, "++");
        const segments = buffer.getSegments();
        expect(buffer.text).toBe("Bl++ue");
        expect(segments).toHaveLength(1);
        expect(segments[0].state?.foreground).toEqual({ space: "indexed", index: 4 });
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
        const buffer = new AnsiAwareBuffer("{clickOpen:42:look}Look here{clickClose}");
        buffer.append(" around");
        buffer.replace([0, 4], "Inspect");
        const segments = buffer.getSegments();
        expect(segments).toHaveLength(1);
        expect(segments[0].state?.hyperlink).toEqual({ id: 42, title: "look" });
        expect(buffer.text).toBe("Inspect here around");
    });
});
