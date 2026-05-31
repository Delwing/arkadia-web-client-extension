import {describe, expect, it} from "vitest";
import {isDirection, isPolishDirection} from "@shared/map/directions.ts";

describe("isPolishDirection", () => {
    it("accepts full Polish direction words", () => {
        expect(isPolishDirection("polnoc")).toBe(true);
        expect(isPolishDirection("zachod")).toBe(true);
        expect(isPolishDirection("polnocny-wschod")).toBe(true);
        expect(isPolishDirection("ZACHOD")).toBe(true);
    });

    it("rejects single-letter English short codes", () => {
        // "w" is the Polish preposition "into" in follow prose, not "west".
        expect(isPolishDirection("w")).toBe(false);
        expect(isPolishDirection("n")).toBe(false);
        expect(isPolishDirection("se")).toBe(false);
    });

    it("rejects arbitrary prose tokens", () => {
        expect(isPolishDirection("lesna")).toBe(false);
        expect(isPolishDirection("gestwine")).toBe(false);
        expect(isPolishDirection("Vesper")).toBe(false);
    });

    it("differs from isDirection, which still resolves short codes", () => {
        expect(isDirection("w")).toBe(true);
        expect(isPolishDirection("w")).toBe(false);
    });
});
