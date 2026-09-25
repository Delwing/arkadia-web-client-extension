import { AnsiAwareBuffer, formatStatesEqual } from "@client/ansi/FormatState.ts";

/**
 * Appending at the end normalizes only the seam and the new tail (see
 * AnsiAwareBuffer.appendNormalized) and `length` is cached. These pin down that
 * both give exactly what a full re-normalization and a fresh count would.
 */
describe("AnsiAwareBuffer append", () => {
    const LINES = [
        "\u001b[1;33mKrasnolud\u001b[0m mowi do ciebie: \u001b[36mNiech cie gory strzega.\u001b[0m",
        "\u001b[31mRudy ork\u001b[0m zadaje ci \u001b[1;31mbardzo ciezkie\u001b[0m obrazenia.",
        "Jestes w waskim przejsciu miedzy skalami.",
        "\u001b[32mWidoczne wyjscia:\u001b[0m polnoc i gora.\u001b[32m",
        "\u001b[32mzielony\u001b[0m\u001b[0m zwykly",
    ];

    const merge = (parts: AnsiAwareBuffer[]): AnsiAwareBuffer => {
        const merged = new AnsiAwareBuffer();
        parts.forEach((part, i) => {
            merged.appendBuffer(part);
            if (i < parts.length - 1) merged.append("\n");
        });
        return merged;
    };

    it("merges lines into the same segments a full normalization produces", () => {
        const parts = LINES.map(line => new AnsiAwareBuffer(line));
        const merged = merge(parts);

        expect(merged.text).toBe(parts.map(p => p.text).join("\n"));
        expect(merged.length).toBe(merged.text.length);
        // Normalizing again changes nothing: the segments are already normalized.
        expect(merged.getSegments()).toEqual(new AnsiAwareBuffer(merged.getSegments()).getSegments());

        // Every character keeps the state it had in its source line.
        let offset = 0;
        for (const part of parts) {
            for (let i = 0; i < part.length; i++) {
                expect(formatStatesEqual(merged.getStateAt(offset + i), part.getStateAt(i))).toBe(true);
            }
            offset += part.length + 1;
        }
    });

    it("joins equal states across the seam into one segment", () => {
        const merged = new AnsiAwareBuffer("\u001b[31mA");
        merged.appendBuffer(new AnsiAwareBuffer("\u001b[31mB"));
        const segments = merged.getSegments();
        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe("AB");
    });

    it("gives the newline the state of the text before it", () => {
        const merged = new AnsiAwareBuffer("\u001b[31mred");
        merged.append("\n");
        merged.appendBuffer(new AnsiAwareBuffer("plain"));
        const segments = merged.getSegments();
        expect(segments.map(s => s.text)).toEqual(["red\n", "plain"]);
        expect(segments[1].state).toBeUndefined();
    });

    it("normalizes when appending to an empty buffer", () => {
        // "a" and "b" are parsed as two default-state segments; appending merges them.
        const source = new AnsiAwareBuffer([{ text: "a" }, { text: "" }, { text: "b", state: {} }]);
        const merged = new AnsiAwareBuffer();
        merged.appendBuffer(source);
        expect(merged.getSegments()).toEqual([{ text: "ab", state: undefined }]);

        const fromText = new AnsiAwareBuffer();
        fromText.append("a\u001b[0mb");
        expect(fromText.getSegments()).toEqual([{ text: "ab", state: undefined }]);
    });

    it("does not share state with the appended buffer", () => {
        const source = new AnsiAwareBuffer("\u001b[31mred\u001b[0m");
        const merged = new AnsiAwareBuffer("x");
        merged.appendBuffer(source);
        source.color([0, 3], 2);
        source.getSegments()[0].state!.bold = true;
        expect(merged.getStateAt(1)?.foreground).toEqual({ space: "hex", color: "#bb0000" });
        expect(merged.getStateAt(1)?.bold).toBeUndefined();
    });

    it("keeps length in step with text through every kind of edit", () => {
        const buffer = new AnsiAwareBuffer("\u001b[31mred\u001b[0m plain");
        const check = () => expect(buffer.length).toBe(buffer.text.length);
        check();
        buffer.append(" tail"); check();
        buffer.appendBuffer(new AnsiAwareBuffer("\u001b[32mgreen")); check();
        buffer.appendBuffer(new AnsiAwareBuffer("")); check();
        buffer.append(""); check();
        buffer.insert(2, "++"); check();
        buffer.prepend(">> "); check();
        buffer.prependBuffer(new AnsiAwareBuffer("\u001b[33m!")); check();
        buffer.remove([1, 4]); check();
        buffer.replace([0, 2], "longer text"); check();
        buffer.replaceBuffer([0, 3], new AnsiAwareBuffer("\u001b[34mb")); check();
        buffer.color([0, 4], 5); check();
        buffer.colorWords("green", 3); check();
        buffer.applyFormat([0, 2], { bold: true }); check();
        buffer.suffix("!"); check();
        buffer.prefix("?"); check();
        buffer.clear(); check();
        buffer.append("again"); check();
        expect(buffer.text).toBe("again");
    });
});
