import { describe, it, expect, vi, beforeEach } from "vitest";

const loader = vi.hoisted(() => ({
    loadMapData: vi.fn(),
    loadColors: vi.fn(),
    subscribeToMapData: vi.fn(),
}));
const registry = vi.hoisted(() => ({ current: null as any }));
const settings = vi.hoisted(() => ({ pathFindingAlgorithm: undefined as string | undefined }));

vi.mock("@web/mapDataLoader", () => loader);
vi.mock("@web/embedRegistry", () => ({
    getEmbeddedMap: () => registry.current,
    setEmbeddedMap: (map: any) => { registry.current = map; },
}));
vi.mock("@web/embed", () => ({
    EmbeddedMap: vi.fn(function (this: any, reader: any, startId: number) {
        this.reader = reader;
        this.startId = startId;
        this.pathFinder = null;
        this.reload = vi.fn((next: any) => { this.reader = next; });
        this.refreshAreas = vi.fn();
    }),
}));
vi.mock("@modules/core/settings", () => ({
    getMapSettings: () => settings,
}));

import { bootstrapMap } from "@web/map/mapBootstrap";

function makeMapHelper() {
    let reader: any = { id: "reader-1" };
    let areasChanged: ((ids: number[]) => void) | null = null;
    const pathFinder = { setAlgorithm: vi.fn() };
    const Map = {
        initialize: vi.fn((_data: any, _colors: any) => ({ startId: 7, reader, pathFinder })),
        onAreasChanged: vi.fn((cb: (ids: number[]) => void) => { areasChanged = cb; return () => undefined; }),
        tryGetMapReader: () => reader,
        getPathFinder: () => pathFinder,
    };
    return {
        client: { Map } as any,
        pathFinder,
        swapReader: (next: any) => { reader = next; },
        fireAreasChanged: (ids: number[]) => areasChanged?.(ids),
    };
}

describe("bootstrapMap", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        registry.current = null;
        settings.pathFindingAlgorithm = undefined;
        loader.loadMapData.mockResolvedValue({ map: true });
        loader.loadColors.mockResolvedValue({ colors: true });
    });

    it("reports download progress, then hides the bar once loaded", async () => {
        let reportProgress: (p: number, loaded?: number) => void = () => undefined;
        loader.loadMapData.mockImplementation((onProgress: any) => {
            reportProgress = onProgress;
            return new Promise(() => undefined);
        });
        const { client } = makeMapHelper();
        const boot = bootstrapMap(client);
        const seen: any[] = [];
        boot.subscribeProgress((p) => seen.push(p));

        reportProgress(-1, 2048);
        reportProgress(42.5);
        expect(seen).toEqual([
            { visible: true, percent: null, loadedBytes: 2048 },
            { visible: true, percent: 42.5 },
        ]);
        expect(boot.getProgress()).toEqual({ visible: true, percent: 42.5 });
    });

    it("initialises the map and registers the embedded view", async () => {
        const { client, pathFinder } = makeMapHelper();
        settings.pathFindingAlgorithm = "astar";

        const boot = bootstrapMap(client);
        await boot.ready;

        expect(client.Map.initialize).toHaveBeenCalledWith({ map: true }, { colors: true });
        expect(registry.current.startId).toBe(7);
        expect(registry.current.pathFinder).toBe(pathFinder);
        expect(pathFinder.setAlgorithm).toHaveBeenCalledWith("astar");
        expect(boot.getProgress().visible).toBe(false);
    });

    it("redraws changed areas in place, and reloads the view when the reader is swapped", async () => {
        const fx = makeMapHelper();
        await bootstrapMap(fx.client).ready;
        const embedded = registry.current;

        fx.fireAreasChanged([3, 4]);
        expect(embedded.refreshAreas).toHaveBeenCalledWith([3, 4]);
        expect(embedded.reload).not.toHaveBeenCalled();

        const next = { id: "reader-2" };
        fx.swapReader(next);
        fx.fireAreasChanged([1]);
        expect(embedded.reload).toHaveBeenCalledWith(next);
        expect(embedded.pathFinder).toBe(fx.pathFinder);
    });

    it("re-initialises from new map data, keeping the loaded colours", async () => {
        const { client } = makeMapHelper();
        await bootstrapMap(client).ready;
        const [onData, opts] = loader.subscribeToMapData.mock.calls[0];
        expect(opts).toEqual({ emitInitial: false });

        onData(null);
        expect(client.Map.initialize).toHaveBeenCalledTimes(1);
        onData({ map: 2 });
        expect(client.Map.initialize).toHaveBeenLastCalledWith({ map: 2 }, { colors: true });
    });

    it("hides the bar and rejects ready when loading fails", async () => {
        loader.loadColors.mockRejectedValue(new Error("offline"));
        const { client } = makeMapHelper();
        const boot = bootstrapMap(client);

        await expect(boot.ready).rejects.toThrow("offline");
        expect(boot.getProgress().visible).toBe(false);
        expect(client.Map.initialize).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalled();
    });
});
