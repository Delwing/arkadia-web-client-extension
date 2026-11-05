import { AnsiAwareBuffer } from "@client/ansi/AnsiAwareBuffer.ts";
import { escapeHtml, segmentsToDom, segmentsToHtml } from "@client/ansi/renderSegments.ts";

describe("segmentsToHtml link ids", () => {
    it("names links that have a click, and only when asked", () => {
        const buffer = new AnsiAwareBuffer("zabij ogra");
        const onClick = () => {};
        buffer.createLink([0, 5], { onClick, title: "x" });
        buffer.createLink([6, 10], { title: "tylko podpowiedz" });
        expect(segmentsToHtml(buffer.getSegments())).not.toContain("data-link");
        const html = segmentsToHtml(buffer.getSegments(), link => link.onClick === onClick ? "k7" : null);
        expect(html).toContain('data-link="k7">zabij</span>');
        expect(html.match(/data-link=/g)).toHaveLength(1);
    });
});

describe("segmentsToHtml", () => {
    it("escapes the text and writes the colours as CSS", () => {
        const html = segmentsToHtml([
            { text: "<a>", state: { foreground: { space: "rgb", r: 255, g: 0, b: 16 } } },
            { text: " & " },
        ]);
        expect(html).toBe('<span style="color: #ff0010">&lt;a&gt;</span> &amp; ');
    });

    it("swaps the colours of inverse text", () => {
        const html = segmentsToHtml([{
            text: "x",
            state: { inverse: true, foreground: { space: "hex", color: "#111111" }, background: { space: "hex", color: "#222222" } },
        }]);
        expect(html).toBe('<span style="color: #222222; background-color: #111111">x</span>');
    });
});

describe("segmentsToDom", () => {
    it("runs a link's click and marks it clickable", () => {
        const onClick = jest.fn();
        const fragment = segmentsToDom([{ text: "klik", state: { hyperlink: { onClick, title: "t" } } }, { text: " dalej" }]);
        const span = fragment.querySelector("span")!;
        expect(span.dataset.outputClickable).toBe("true");
        expect(span.title).toBe("t");
        span.click();
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(fragment.textContent).toBe("klik dalej");
    });

    it("puts the dim effect in CSS variables and a class", () => {
        const fragment = segmentsToDom([{ text: "x", state: { dim: { startOpacity: 1, endOpacity: 0.2, duration: 500 } } }]);
        const span = fragment.querySelector("span")!;
        expect(span.className).toBe("ansi-dim");
        expect(span.style.getPropertyValue("--dim-easing")).toBe("ease-in-out");
    });
});

describe("escapeHtml", () => {
    it("escapes the five HTML characters", () => {
        expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    });
});
