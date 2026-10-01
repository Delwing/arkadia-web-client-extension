import { describe, expect, it } from "vitest";
import { highlightHtml } from "@ui/logViewer/components/highlightHtml";
import { splitMatches } from "@ui/logViewer/model/search";

const segmentsOf = (text: string, pattern: RegExp) => splitMatches(text, pattern).segments;

describe("highlightHtml", () => {
    it("marks a hit inside the coloured markup", () => {
        const html = '<span style="color: red">Ork</span> atakuje <span style="color: blue">cie</span>';
        const result = highlightHtml(html, segmentsOf("Ork atakuje cie", /atakuje/g), 0);
        expect(result).toBe(
            '<span style="color: red">Ork</span> <mark data-occurrence="0" data-current="true">atakuje</mark> <span style="color: blue">cie</span>',
        );
    });

    it("splits a hit across a colour change and keeps one occurrence", () => {
        const html = '<span style="color: red">Or</span><span style="color: blue">k</span>';
        const result = highlightHtml(html, segmentsOf("Ork", /Ork/g), -1)!;
        const holder = document.createElement("div");
        holder.innerHTML = result;
        const marks = [...holder.querySelectorAll("mark")];
        expect(marks.map((mark) => mark.textContent)).toEqual(["Or", "k"]);
        expect(marks.every((mark) => mark.dataset.occurrence === "0" && mark.dataset.current === "false")).toBe(true);
        expect(marks[0].parentElement?.style.color).toBe("red");
    });

    it("flags only the current occurrence", () => {
        const result = highlightHtml("a b a", segmentsOf("a b a", /a/g), 1)!;
        expect(result).toBe(
            '<mark data-occurrence="0" data-current="false">a</mark> b <mark data-occurrence="1" data-current="true">a</mark>',
        );
    });

    it("gives up when the markup's text is not the line's", () => {
        expect(highlightHtml("<span>inny tekst</span>", segmentsOf("Ork", /Ork/g), 0)).toBeNull();
    });
});
