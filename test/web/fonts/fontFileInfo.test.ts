import { describe, expect, it } from "vitest";
import { guessFromFileName, isFontFileName, readFontFileInfo } from "@web/fonts/fontFileInfo.ts";
import { buildTtf, buildWoff } from "./fontTestData";
import { DecompressionStream as NodeDecompressionStream } from "node:stream/web";

// jsdom has no Compression Streams; the browser does.
globalThis.DecompressionStream ??= NodeDecompressionStream as unknown as typeof DecompressionStream;

describe("readFontFileInfo", () => {
    it("reads family, weight and italic from a TTF", async () => {
        const info = await readFontFileInfo(buildTtf({ family: "Iosevka Term", weight: 700, italic: true }), "whatever.ttf");
        expect(info).toMatchObject({ family: "Iosevka Term", weight: 700, italic: true, format: "truetype", fromFile: true });
        expect(info.weightRange).toBeUndefined();
    });

    it("prefers the typographic family over the legacy one", async () => {
        const info = await readFontFileInfo(buildTtf({ family: "Iosevka Term Light", typographicFamily: "Iosevka Term", weight: 300 }), "a.ttf");
        expect(info.family).toBe("Iosevka Term");
        expect(info.weight).toBe(300);
    });

    it("reads the weight range of a variable font", async () => {
        const info = await readFontFileInfo(buildTtf({ family: "Fira Code", weight: 400, wght: [300, 400, 700] }), "FiraCode-VF.ttf");
        expect(info.weightRange).toEqual([300, 700]);
        expect(info.weight).toBe(400);
    });

    it("inflates WOFF tables", async () => {
        const info = await readFontFileInfo(buildWoff({ family: "Hack", weight: 400, italic: true }), "hack.woff");
        expect(info).toMatchObject({ family: "Hack", weight: 400, italic: true, format: "woff", fromFile: true });
    });

    it("falls back to the file name for WOFF2", async () => {
        const data = new Uint8Array(64);
        data.set([0x77, 0x4f, 0x46, 0x32]);
        const info = await readFontFileInfo(data.buffer, "JetBrainsMono-BoldItalic.woff2");
        expect(info).toMatchObject({ family: "JetBrainsMono", weight: 700, italic: true, format: "woff2", fromFile: false });
    });
});

describe("guessFromFileName", () => {
    it.each([
        ["Iosevka-Term-Regular.ttf", "Iosevka Term", 400, false],
        ["RobotoMono-SemiBoldItalic.ttf", "RobotoMono", 600, true],
        ["vera-sans-mono-bold.woff2", "vera sans mono", 700, false],
        ["SourceCodePro-It.otf", "SourceCodePro", 400, true],
        ["FiraCode[wght].ttf", "FiraCode", 400, false],
        ["Orbit.ttf", "Orbit", 400, false],
    ])("%s", (name, family, weight, italic) => {
        expect(guessFromFileName(name)).toEqual({ family, weight, italic });
    });
});

it("recognises font file names", () => {
    expect(isFontFileName("a.TTF")).toBe(true);
    expect(isFontFileName("a.woff2")).toBe(true);
    expect(isFontFileName("a.zip")).toBe(false);
});
