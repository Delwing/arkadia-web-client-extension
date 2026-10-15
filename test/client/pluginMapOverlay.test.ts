import { describe, expect, it, vi } from "vitest";
import { PluginMapOverlay } from "@client/pluginMapOverlay";
import {
  getMapOverlays,
  mirrorMapOverlay,
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
    settings: { lineWidth: 0.05, roomSize: 0.8 } as never,
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
        expect([view.settings.lineWidth, view.settings.roomSize]).toEqual([0.05, 0.8]);
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

  it("serves a second renderer through a mirror without disturbing the first", () => {
    const mainState = makeState({ 1: { id: 1, x: 3, y: 4 } });
    const staticState = makeState({ 1: { id: 1, x: 3, y: 4 } });
    const mainInvalidate = vi.fn();
    const staticInvalidate = vi.fn();
    const overlay = new PluginMapOverlay("test/mirror", {
      render: (view) => ({ type: "circle", cx: view.getRoom(1)!.x, cy: 0, radius: 1, paint: {} }),
    });
    overlay.attach({ state: mainState, invalidate: mainInvalidate, onViewportChange: () => () => {} } as never);
    const mirror = overlay.mirror();
    mirror.attach!({ state: staticState, invalidate: staticInvalidate, onViewportChange: () => () => {} } as never);

    expect((mirror.render(staticState as never) as Array<{ cx: number }>)[0].cx).toBe(3);
    overlay.invalidate();
    staticState.handlers.area.forEach((h) => h());
    expect(mainInvalidate).toHaveBeenCalledTimes(1);
    expect(staticInvalidate).toHaveBeenCalledTimes(2);

    // Closing the static window leaves the main map attached.
    mirror.detach!();
    overlay.invalidate();
    expect(mainInvalidate).toHaveBeenCalledTimes(2);
    expect(staticInvalidate).toHaveBeenCalledTimes(2);
    expect(staticState.handlers.area).toHaveLength(0);
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

  it("mirrors overlays for another renderer, drawing-only when they cannot copy themselves", () => {
    const plain = { render: vi.fn(() => undefined), attach: vi.fn() };
    const copy = mirrorMapOverlay(plain);

    expect(copy).not.toBe(plain);
    expect(copy.attach).toBeUndefined();
    copy.render({} as never);
    expect(plain.render).toHaveBeenCalledTimes(1);

    const plugin = new PluginMapOverlay("test/p", { render: () => undefined });
    expect(typeof mirrorMapOverlay(plugin).attach).toBe("function");
  });
});
