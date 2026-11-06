import { parseAnsiSegments } from "@client/ansi/AnsiParser.ts";

describe("parseAnsiSegments", () => {
    it("parses ANSI colour codes into metadata segments", () => {
        const segments = parseAnsiSegments("\u001b[31mRed\u001b[0mPlain");
        expect(segments).toHaveLength(2);
        expect(segments[0].text).toBe("Red");
        expect(segments[0].state?.foreground).toEqual({ space: "hex", color: "#bb0000" });
        expect(segments[1].text).toBe("Plain");
        expect(segments[1].state).toBeUndefined();
    });

    it("ignores bold from the game but keeps italic", () => {
        const [segment] = parseAnsiSegments("\u001b[1;3;31mBold Italic Red\u001b[0m");
        expect(segment.state?.foreground).toEqual({ space: "hex", color: "#bb0000" });
        expect(segment.state?.bold).toBeUndefined();
        expect(segment.state?.italic).toBe(true);
    });

    it("reads 256-colour and true-colour codes", () => {
        const [indexed, rgb] = parseAnsiSegments("\u001b[38;5;196ma\u001b[48;2;1;2;3mb");
        expect(indexed.state?.foreground?.space).toBe("hex");
        expect(rgb.state?.background).toEqual({ space: "rgb", r: 1, g: 2, b: 3 });
    });

    it("starts from the base state and keeps text after an unfinished escape", () => {
        const segments = parseAnsiSegments("abc\u001b[31", { italic: true });
        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe("abc\u001b[31");
        expect(segments[0].state?.italic).toBe(true);
    });

    it("leaves plain text without a state", () => {
        expect(parseAnsiSegments("plain")).toEqual([{ text: "plain", state: undefined }]);
    });
});
