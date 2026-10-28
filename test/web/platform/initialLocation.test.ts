import { describe, it, expect, vi } from "vitest";
import { applyInitialLocation } from "@web/platform/initialLocation";

function makeClient() {
    let listener: (() => void) | null = null;
    const unsubscribe = vi.fn(() => { listener = null; });
    const client = {
        Map: { setMapRoomById: vi.fn() },
        on: vi.fn((_event: 'gmcp.room.info', fn: () => void) => { listener = fn; return unsubscribe; }),
    };
    return { client, unsubscribe, fireRoomInfo: () => listener?.() };
}

function makeWindow(search: string) {
    return {
        location: { search, origin: "https://example.test", pathname: "/app/" },
        history: { replaceState: vi.fn() },
    } as unknown as Pick<Window, 'location' | 'history'>;
}

describe("applyInitialLocation", () => {
    it("does nothing without a locationId", () => {
        const { client } = makeClient();
        applyInitialLocation(client, makeWindow("?foo=1"));
        expect(client.on).not.toHaveBeenCalled();
    });

    it("moves the map on the first room info and strips only that parameter", () => {
        const { client, unsubscribe, fireRoomInfo } = makeClient();
        const win = makeWindow("?locationId=123&foo=1");
        applyInitialLocation(client, win);

        expect(client.Map.setMapRoomById).not.toHaveBeenCalled();
        fireRoomInfo();
        expect(client.Map.setMapRoomById).toHaveBeenCalledWith(123);
        expect(win.history.replaceState).toHaveBeenCalledWith({}, '', "https://example.test/app/?foo=1");
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("leaves a bare address when locationId was the only parameter", () => {
        const { client, fireRoomInfo } = makeClient();
        const win = makeWindow("?locationId=5");
        applyInitialLocation(client, win);
        fireRoomInfo();
        expect(win.history.replaceState).toHaveBeenCalledWith({}, '', "https://example.test/app/");
    });

    it("ignores a non-numeric locationId", () => {
        const { client } = makeClient();
        applyInitialLocation(client, makeWindow("?locationId=abc"));
        expect(client.on).not.toHaveBeenCalled();
    });
});
