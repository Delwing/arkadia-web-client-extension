import { beforeEach, describe, expect, it } from "vitest";
import {
    clearUploadedFont,
    getUploadedFontFiles,
    mergeFontFiles,
    removeUploadedFontSlot,
    setUploadedFontActive,
    slotFor,
    slotsCovered,
    uploadFontFiles,
    type StoredFontFile,
} from "@web/fonts/uploadedFont.ts";
import { resolveOutputFontFamily, selectedFontName } from "@web/fontLoader.ts";
import { buildTtf, type TestFontSpec } from "./fontTestData";

function candidate(fileName: string, family: string, weight: number, italic = false, weightRange?: [number, number]): StoredFontFile {
    return { fileName, family, weight, italic, weightRange, format: "truetype", fromFile: true, data: new ArrayBuffer(4), slot: slotFor(weight, italic, weightRange) };
}

function fontFile(name: string, spec: TestFontSpec): File {
    return new File([buildTtf(spec)], name);
}

describe("slotFor", () => {
    it("rounds static weights to regular or bold", () => {
        expect(slotFor(300, false)).toBe("regular");
        expect(slotFor(500, false)).toBe("regular");
        expect(slotFor(600, true)).toBe("boldItalic");
        expect(slotFor(900, false)).toBe("bold");
    });

    it("keeps a variable font in the regular slot", () => {
        expect(slotFor(700, false, [100, 900])).toBe("regular");
        expect(slotFor(400, true, [100, 900])).toBe("italic");
    });
});

describe("mergeFontFiles", () => {
    it("fills the four slots from one batch", () => {
        const { files, family, skipped } = mergeFontFiles([], [
            candidate("R.ttf", "Hack", 400),
            candidate("B.ttf", "Hack", 700),
            candidate("I.ttf", "Hack", 400, true),
            candidate("BI.ttf", "Hack", 700, true),
        ]);
        expect(family).toBe("Hack");
        expect(files.map(f => f.slot)).toEqual(["regular", "bold", "italic", "boldItalic"]);
        expect(skipped).toEqual([]);
    });

    it("picks the weight nearest 400 / 700 and skips the extras", () => {
        const { files, skipped } = mergeFontFiles([], [
            candidate("Light.ttf", "Hack", 300),
            candidate("Regular.ttf", "Hack", 400),
            candidate("Medium.ttf", "Hack", 500),
            candidate("Black.ttf", "Hack", 900),
            candidate("Bold.ttf", "Hack", 700),
        ]);
        expect(files.map(f => f.fileName)).toEqual(["Regular.ttf", "Bold.ttf"]);
        expect(skipped.sort()).toEqual(["Black.ttf", "Light.ttf", "Medium.ttf"]);
    });

    it("keeps the family most files belong to", () => {
        const { family, skipped } = mergeFontFiles([], [
            candidate("a.ttf", "Hack", 400),
            candidate("b.ttf", "Hack", 700),
            candidate("c.ttf", "Other", 400, true),
        ]);
        expect(family).toBe("Hack");
        expect(skipped).toEqual(["c.ttf"]);
    });

    it("adds to the stored family, and a new family replaces it", () => {
        const stored = [candidate("R.ttf", "Hack", 400)];
        expect(mergeFontFiles(stored, [candidate("B.ttf", "Hack", 700)]).files.map(f => f.fileName)).toEqual(["R.ttf", "B.ttf"]);
        expect(mergeFontFiles(stored, [candidate("X.ttf", "Other", 700)]).files.map(f => f.fileName)).toEqual(["X.ttf"]);
    });

    it("lets a variable font take over the bold slot it covers", () => {
        const stored = [candidate("R.ttf", "Hack", 400), candidate("B.ttf", "Hack", 700)];
        const { files } = mergeFontFiles(stored, [candidate("VF.ttf", "Hack", 400, false, [100, 900])]);
        expect(files.map(f => f.fileName)).toEqual(["VF.ttf"]);
        expect(slotsCovered(files[0])).toEqual(["regular", "bold"]);
    });
});

describe("uploaded font storage", () => {
    beforeEach(async () => {
        setUploadedFontActive(false);
        await clearUploadedFont();
    });

    it("stores, publishes and removes the faces", async () => {
        setUploadedFontActive(true);
        const result = await uploadFontFiles([
            fontFile("Hack-Regular.ttf", { family: "Hack", weight: 400 }),
            fontFile("Hack-Bold.ttf", { family: "Hack", weight: 700 }),
            new File(["x"], "readme.txt"),
        ]);
        expect(result.family).toBe("Hack");
        expect(result.skipped).toEqual(["readme.txt"]);
        expect((await getUploadedFontFiles()).map(f => f.slot)).toEqual(["regular", "bold"]);
        const css = document.head.querySelector("style[data-uploaded-font]")?.textContent ?? "";
        expect(css.match(/@font-face/g)).toHaveLength(2);
        expect(css).toContain("font-weight: 700");

        const left = await removeUploadedFontSlot("bold");
        expect(left.map(f => f.slot)).toEqual(["regular"]);
        expect(document.head.querySelector("style[data-uploaded-font]")?.textContent?.match(/@font-face/g)).toHaveLength(1);

        setUploadedFontActive(false);
        expect(document.head.querySelector("style[data-uploaded-font]")).toBeNull();
    });

    it("puts a file into the slot it was picked for", async () => {
        await uploadFontFiles([fontFile("Hack-Regular.ttf", { family: "Hack", weight: 400 })]);
        await uploadFontFiles([fontFile("odd-name.ttf", { family: "Something", weight: 400 })], "italic");
        const files = await getUploadedFontFiles();
        expect(files.map(f => [f.slot, f.family])).toEqual([["regular", "Hack"], ["italic", "Hack"]]);
    });
});

describe("resolveOutputFontFamily", () => {
    it("puts the uploaded faces before an installed copy", () => {
        expect(resolveOutputFontFamily("uploaded", "Hack")).toBe('"Arkadia Uploaded Font", "Hack", monospace');
        expect(resolveOutputFontFamily("uploaded", "")).toBe('"Arkadia Uploaded Font", monospace');
    });

    it("uses the installed family by name", () => {
        expect(resolveOutputFontFamily("system", "Consolas")).toBe('"Consolas", monospace');
        expect(resolveOutputFontFamily("system", " ")).toBeUndefined();
    });

    it("takes the name that goes with the selection", () => {
        const s = { customFontFamily: "A", systemFontFamily: "B", uploadedFontFamily: "C" };
        expect(selectedFontName({ ...s, fontFamily: "custom" })).toBe("A");
        expect(selectedFontName({ ...s, fontFamily: "system" })).toBe("B");
        expect(selectedFontName({ ...s, fontFamily: "uploaded" })).toBe("C");
        expect(selectedFontName({ ...s, fontFamily: "fira-code" })).toBe("");
    });
});
