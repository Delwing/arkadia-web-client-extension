import { describe, expect, it } from "vitest";
import { htmlToText, recordedBackground } from "../../log-viewer/sessionAdapter";

describe("htmlToText", () => {
    it("drops tags and decodes the entities the logger writes", () => {
        expect(htmlToText('<span style="color: #f00">Ork</span> &lt;wrog&gt; &amp; &quot;on&quot;')).toBe('Ork <wrog> & "on"');
    });

    it("decodes numeric and other named entities", () => {
        expect(htmlToText("&#261;&#x107;&nbsp;&eacute;")).toBe("ąć é");
    });

    it("returns plain text untouched", () => {
        expect(htmlToText("zwykla linia")).toBe("zwykla linia");
    });

    it("does not run markup", () => {
        expect(htmlToText('<img src=x onerror="window.__ran=1">tekst')).toBe("tekst");
        expect((window as unknown as { __ran?: number }).__ran).toBeUndefined();
    });
});

describe("recordedBackground", () => {
    it("is the last background the log recorded", () => {
        expect(
            recordedBackground([
                { text: "a", timestamp: 1, background: "#111" },
                { text: "b", timestamp: 2 },
                { text: "c", timestamp: 3, background: "#eee" },
                { text: "d", timestamp: 4 },
            ]),
        ).toBe("#eee");
        expect(recordedBackground([{ text: "a", timestamp: 1 }])).toBeUndefined();
    });
});
