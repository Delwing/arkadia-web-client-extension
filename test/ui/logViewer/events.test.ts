import { describe, expect, it } from "vitest";
import { LOG_EVENT_KINDS, LOG_EVENT_META, detectEvent } from "@ui/logViewer/model/events";

describe("detectEvent", () => {
    it("marks a login from the message type, not the text", () => {
        expect(detectEvent("Polaczono z arkadia.pl:4000", "system.login")).toBe("login");
    });

    it("marks a death from the game's own post-death line", () => {
        expect(
            detectEvent(
                "Twoje cechy sa oslabione po ostatniej smierci. By je odbudowac potrzebujesz zdobyc jeszcze 4 postepy.",
                "system",
            ),
        ).toBe("death");
    });

    it("marks a trait advance", () => {
        expect(detectEvent("Twoja sila osiagnela nadludzki poziom.", "system")).toBe("trait");
        expect(detectEvent("Twoj refleks osiagnal nadludzki poziom.", "system")).toBe("trait");
    });

    it("leaves ordinary lines alone", () => {
        expect(detectEvent("Atakujesz goblina!", "combat.avatar")).toBeUndefined();
        expect(detectEvent("Rynek w Bandzie", "room.short")).toBeUndefined();
        // Near-misses matter: a line merely mentioning death is not a death.
        expect(detectEvent("Boisz sie smierci.", "system")).toBeUndefined();
    });

    it("gives every kind a label, glyph and colour", () => {
        for (const kind of LOG_EVENT_KINDS) {
            expect(LOG_EVENT_META[kind].label).toBeTruthy();
            expect(LOG_EVENT_META[kind].tag).toMatch(/^[A-Z]{3,8}$/);
            expect(LOG_EVENT_META[kind].glyph).toHaveLength(1);
            expect(LOG_EVENT_META[kind].colorToken).toMatch(/^var\(--ark-/);
        }
    });
});
