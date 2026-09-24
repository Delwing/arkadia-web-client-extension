import { describe, expect, it, vi } from "vitest";
import { PluginMapOverlay } from "@client/pluginMapOverlay";
import {
  getMapOverlays,
  onMapOverlaysChange,
  registerMapOverlay,
  unregisterMapOverlay,
} from "@modules/core/mapOverlayRegistry";

function makeState(rooms: Record<number, { id: number; x: number; y: number }>) {
  const handlers: Record<string, Array<() => void>> = {};
  return {
    positionRoomId: 1,
    currentArea: 7,
    currentZIndex: 0,
    mapReader: { getRoom: (id: number) => rooms[id] },
    events: {
      on: (event: string, cb: () => void) => (handlers[event] ??= []).push(cb),
      off: (event: string, cb: () => void) => {
        handlers[event] = (handlers[event] ?? []).filter((h) => h !== cb);
      },
    },
    handlers,
  };
}

describe("PluginMapOverlay", () => {
  it("passes a plugin-facing state and defaults shapes to the overlay layer", () => {
    const state = makeState({ 1: { id: 1, x: 3, y: 4 } });
    const overlay = new PluginMapOverlay("test/radar", {
      render(view) {
        const room = view.getRoom(view.currentRoomId!)!;
        expect(view.areaId).toBe(7);
        expect(view.z).toBe(0);
        return [
          { type: "circle", cx: room.x, cy: room.y, radius: 1, paint: { fill: "red" } },
          { type: "circle", cx: 0, cy: 0, radius: 1, paint: {}, layer: "top" },
        ];
      },
    });

    const shapes = overlay.render(state as never) as Array<{ cx: number; layer: string }>;

    expect(shapes.map((s) => [s.cx, s.layer])).toEqual([[3, "overlay"], [0, "top"]]);
  });

  it("swallows render errors so the map keeps drawing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const overlay = new PluginMapOverlay("test/broken", {
      render() {
        throw new Error("boom");
      },
    });

    expect(overlay.render(makeState({}) as never)).toBeUndefined();
    expect(overlay.render(makeState({}) as never)).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("redraws on player move and stops after detach", () => {
    const state = makeState({});
    const invalidate = vi.fn();
    const overlay = new PluginMapOverlay("test/move", { render: () => undefined });

    overlay.attach({ state, invalidate, onViewportChange: () => () => {} } as never);
    state.handlers.position.forEach((h) => h());
    overlay.invalidate();
    expect(invalidate).toHaveBeenCalledTimes(2);

    overlay.detach();
    state.handlers.position.forEach((h) => h());
    overlay.invalidate();
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});

describe("mapOverlayRegistry", () => {
  it("notifies remove then add when an id is registered again", () => {
    const first = { render: () => undefined };
    const second = { render: () => undefined };
    const events: string[] = [];
    const off = onMapOverlaysChange(({ type, overlay }) => events.push(`${type}:${overlay === first ? 1 : 2}`));

    registerMapOverlay("plugin:x:radar", first);
    registerMapOverlay("plugin:x:radar", second);
    unregisterMapOverlay("plugin:x:radar");
    off();

    expect(events).toEqual(["add:1", "remove:1", "add:2", "remove:2"]);
    expect(getMapOverlays().has("plugin:x:radar")).toBe(false);
  });
});
