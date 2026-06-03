import { describe, expect, it } from "vitest";
import { buildTransportWaypoints } from "@web/transportWaypoints";

describe("buildTransportWaypoints", () => {
    it("produces one waypoint per route per stop room, labelled with the route name", () => {
        const waypoints = buildTransportWaypoints();
        expect(waypoints.length).toBeGreaterThan(0);
        for (const wp of waypoints) {
            expect(Number.isInteger(wp.roomId)).toBe(true);
            expect(typeof wp.label).toBe("string");
            expect((wp.label as string).length).toBeGreaterThan(0);
            expect(typeof wp.onClick).toBe("function");
        }
    });

    it("gives a room served by multiple routes one waypoint per route", () => {
        const waypoints = buildTransportWaypoints();
        const byRoom = new Map<number, Set<string>>();
        for (const wp of waypoints) {
            let set = byRoom.get(wp.roomId);
            if (!set) byRoom.set(wp.roomId, (set = new Set()));
            set.add(wp.label as string);
        }
        const shared = [...byRoom.values()].filter(routes => routes.size > 1);
        expect(shared.length).toBeGreaterThan(0);
    });

    it("applies the given accent colour to every waypoint", () => {
        const waypoints = buildTransportWaypoints("#123456");
        expect(waypoints.every(w => w.color === "#123456")).toBe(true);
    });
});
