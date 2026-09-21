import { describe, expect, it } from "vitest";
import { buildLogHtml, escapeHtml, type HtmlPalette } from "@ui/logViewer/export/logHtml";
import type { RenderedRow } from "@ui/logViewer/model/viewerState";

const PALETTE: HtmlPalette = {
    background: "#111110",
    text: "#eeeeec",
    secondary: "#b5b3ad",
    faint: "#7c7b74",
    border: "#3b3a37",
    accent: "#ffc53d",
};

function row(overrides: Partial<RenderedRow> = {}): RenderedRow {
    return {
        lineIndex: 0,
        number: 1,
        timestamp: new Date(2026, 8, 19, 20, 41, 3).getTime(),
        channel: "combat",
        text: "uderzasz trolla",
        segments: [{ text: "uderzasz trolla", match: false }],
        matchCount: 0,
        ...overrides,
    };
}

const options = {
    title: "Kethra",
    meta: "sob 19 wrz 2026",
    showTimestamps: true,
    showMeta: true,
    showColors: true,
    palette: PALETTE,
};

describe("escapeHtml", () => {
    it("escapes the characters that would break out of a text node", () => {
        expect(escapeHtml('<b>&"x"</b>')).toBe("&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;");
    });

    it("leaves ordinary text alone", () => {
        expect(escapeHtml("uderzasz trolla")).toBe("uderzasz trolla");
    });
});

describe("buildLogHtml", () => {
    it("produces a standalone document", () => {
        const html = buildLogHtml([row()], options);
        expect(html.startsWith("<!doctype html>")).toBe(true);
        expect(html).toContain("<style>");
        // Self-contained: no reference back to the client's own stylesheets.
        expect(html).not.toContain("<link");
    });

    it("keeps the game's own colours when colours are on", () => {
        const html = buildLogHtml(
            [row({ html: '<span style="color:#e06666">uderzasz</span> trolla' })],
            options,
        );
        expect(html).toContain('style="color:#e06666"');
    });

    it("falls back to escaped plain text when colours are off", () => {
        const html = buildLogHtml(
            [row({ text: "a < b", html: '<span style="color:#e06666">a &lt; b</span>' })],
            { ...options, showColors: false },
        );
        expect(html).not.toContain("#e06666");
        expect(html).toContain("a &lt; b");
    });

    it("escapes plain text even when a row has no stored html", () => {
        const html = buildLogHtml([row({ text: "<script>alert(1)</script>" })], options);
        expect(html).not.toContain("<script>alert(1)</script>");
        expect(html).toContain("&lt;script&gt;");
    });

    it("matches its grid to the columns it actually writes", () => {
        // The same trap the on-screen pane has: a grid that does not match the
        // cells collapses the text column.
        const all = buildLogHtml([row()], options);
        expect(all).toContain("grid-template-columns: 5.5em 3.5em 4em minmax(0, 1fr)");
        expect((all.match(/<span class="/g) ?? []).length).toBe(4);

        const noMeta = buildLogHtml([row()], { ...options, showMeta: false });
        expect(noMeta).toContain("grid-template-columns: 5.5em minmax(0, 1fr)");
        expect((noMeta.match(/<span class="/g) ?? []).length).toBe(2);

        const bare = buildLogHtml([row()], { ...options, showMeta: false, showTimestamps: false });
        expect(bare).toContain("grid-template-columns: minmax(0, 1fr)");
        expect((bare.match(/<span class="/g) ?? []).length).toBe(1);
    });

    it("escapes the title and meta line", () => {
        const html = buildLogHtml([row()], { ...options, title: "a<b", meta: "x&y" });
        expect(html).toContain("<title>a&lt;b</title>");
        expect(html).toContain("x&amp;y");
    });

    it("writes one block per row", () => {
        const html = buildLogHtml([row({ number: 1 }), row({ number: 2 })], options);
        expect((html.match(/class="l"/g) ?? []).length).toBe(2);
    });
});
