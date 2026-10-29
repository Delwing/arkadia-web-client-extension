import { describe, expect, it, vi } from "vitest";

vi.mock("@web/modals/pageWindows", () => ({ openWindow: vi.fn() }));

import { openWindow } from "@web/modals/pageWindows";
import { locationLink, shareLocation } from "@web/locationShare/locationShare";

describe("locationShare", () => {
    it("links the page to the room", () => {
        expect(locationLink(123, { origin: "https://example.org", pathname: "/client/" }))
            .toBe("https://example.org/client/?locationId=123");
    });

    it("opens its window only for a known room", () => {
        shareLocation(undefined);
        expect(openWindow).not.toHaveBeenCalled();
        shareLocation(5);
        expect(openWindow).toHaveBeenCalledWith("locationShare");
    });
});
