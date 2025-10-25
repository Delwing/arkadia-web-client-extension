import {Renderer, Settings} from "mudlet-map-renderer";

type KonvaNode = {
    visible(value?: boolean): boolean;
    getClientRect(options?: {relativeTo?: unknown}): {x: number; y: number; width: number; height: number};
};

type KonvaLayer = {
    batchDraw(): void;
};

type ExitNodeEntry = {
    node: KonvaNode;
    bounds: {x: number; y: number; width: number; height: number};
};

type RendererInternals = Renderer & {
    standaloneExitNodes: ExitNodeEntry[] | KonvaNode[];
    linkLayer: KonvaLayer;
    roomLayer: KonvaLayer;
    roomNodes: Map<number, {room: {x: number; y: number}; group: KonvaNode; linkNodes: KonvaNode[]}>;
    stage: {
        scaleX(): number;
        position(): {x: number; y: number};
        width(): number;
        height(): number;
    };
    __exitBoundsRoomSize?: number;
};

const isExitNodeEntry = (value: unknown): value is ExitNodeEntry => {
    return typeof value === "object" && value !== null && "node" in value && "bounds" in value;
};

const computeBounds = (renderer: RendererInternals, node: KonvaNode) => {
    return node.getClientRect({relativeTo: renderer.linkLayer});
};

const ensureStandaloneExitCache = (renderer: RendererInternals) => {
    if (!Array.isArray(renderer.standaloneExitNodes)) {
        renderer.standaloneExitNodes = [];
    }

    const entries = renderer.standaloneExitNodes as (ExitNodeEntry | KonvaNode)[];

    if (entries.length === 0) {
        renderer.__exitBoundsRoomSize = Settings.roomSize;
        return;
    }

    const needsNormalization = !isExitNodeEntry(entries[0]);
    const needsRefresh = renderer.__exitBoundsRoomSize !== Settings.roomSize;

    if (!needsNormalization && !needsRefresh) {
        return;
    }

    renderer.standaloneExitNodes = entries.map((value) => {
        const node = isExitNodeEntry(value) ? value.node : value;
        return {
            node,
            bounds: computeBounds(renderer, node)
        } satisfies ExitNodeEntry;
    });

    renderer.__exitBoundsRoomSize = Settings.roomSize;
};

const patchRenderer = () => {
    const prototype = Renderer.prototype as unknown as RendererInternals & {
        drawArea(id: number, zIndex: number): void;
        renderExits(exits: any[]): void;
        updateRoomCulling(): void;
        __exitBoundsCachingPatched?: boolean;
    };

    if (prototype.__exitBoundsCachingPatched) {
        return;
    }

    const originalDrawArea = prototype.drawArea;
    prototype.drawArea = function patchedDrawArea(id: number, zIndex: number) {
        const renderer = this as RendererInternals;
        renderer.standaloneExitNodes = [];
        renderer.__exitBoundsRoomSize = Settings.roomSize;
        originalDrawArea.call(this, id, zIndex);
        ensureStandaloneExitCache(renderer);
    };

    const originalRenderExits = prototype.renderExits;
    prototype.renderExits = function patchedRenderExits(exits: any[]) {
        const renderer = this as RendererInternals;
        renderer.standaloneExitNodes = [];
        originalRenderExits.call(this, exits);
        ensureStandaloneExitCache(renderer);
    };

    prototype.updateRoomCulling = function patchedUpdateRoomCulling() {
        const renderer = this as RendererInternals;

        if (renderer.roomNodes.size === 0 && renderer.standaloneExitNodes.length === 0) {
            return;
        }

        const scale = renderer.stage.scaleX();
        if (!scale) {
            return;
        }

        ensureStandaloneExitCache(renderer);

        const stagePosition = renderer.stage.position();
        const cullingBounds = Settings.cullingBounds;
        const rawMinX = cullingBounds ? cullingBounds.x : 0;
        const rawMaxX = cullingBounds ? cullingBounds.x + cullingBounds.width : renderer.stage.width();
        const rawMinY = cullingBounds ? cullingBounds.y : 0;
        const rawMaxY = cullingBounds ? cullingBounds.y + cullingBounds.height : renderer.stage.height();
        const minCanvasX = Math.min(rawMinX, rawMaxX);
        const maxCanvasX = Math.max(rawMinX, rawMaxX);
        const minCanvasY = Math.min(rawMinY, rawMaxY);
        const maxCanvasY = Math.max(rawMinY, rawMaxY);
        const minWorldX = (minCanvasX - stagePosition.x) / scale;
        const maxWorldX = (maxCanvasX - stagePosition.x) / scale;
        const minWorldY = (minCanvasY - stagePosition.y) / scale;
        const maxWorldY = (maxCanvasY - stagePosition.y) / scale;

        let roomsChanged = false;
        let exitsChanged = false;

        if (!Settings.cullingEnabled) {
            renderer.roomNodes.forEach(({group, linkNodes}) => {
                if (!group.visible()) {
                    group.visible(true);
                    roomsChanged = true;
                }
                linkNodes.forEach((node) => {
                    if (!node.visible()) {
                        node.visible(true);
                        exitsChanged = true;
                    }
                });
            });

            (renderer.standaloneExitNodes as ExitNodeEntry[]).forEach(({node}) => {
                if (!node.visible()) {
                    node.visible(true);
                    exitsChanged = true;
                }
            });

            if (roomsChanged) {
                renderer.roomLayer.batchDraw();
            }
            if (exitsChanged) {
                renderer.linkLayer.batchDraw();
            }
            return;
        }

        const halfRoom = Settings.roomSize / 2;

        renderer.roomNodes.forEach(({room, group, linkNodes}) => {
            const left = room.x - halfRoom;
            const right = room.x + halfRoom;
            const top = room.y - halfRoom;
            const bottom = room.y + halfRoom;
            const isVisible = right >= minWorldX && left <= maxWorldX && bottom >= minWorldY && top <= maxWorldY;

            if (group.visible() !== isVisible) {
                group.visible(isVisible);
                roomsChanged = true;
            }

            linkNodes.forEach((node) => {
                if (node.visible() !== isVisible) {
                    node.visible(isVisible);
                    exitsChanged = true;
                }
            });
        });

        (renderer.standaloneExitNodes as ExitNodeEntry[]).forEach(({node, bounds}) => {
            const left = bounds.x;
            const right = bounds.x + bounds.width;
            const top = bounds.y;
            const bottom = bounds.y + bounds.height;
            const isVisible = right >= minWorldX && left <= maxWorldX && bottom >= minWorldY && top <= maxWorldY;

            if (node.visible() !== isVisible) {
                node.visible(isVisible);
                exitsChanged = true;
            }
        });

        if (roomsChanged) {
            renderer.roomLayer.batchDraw();
        }
        if (exitsChanged) {
            renderer.linkLayer.batchDraw();
        }
    };

    prototype.__exitBoundsCachingPatched = true;
};

patchRenderer();

export type {ExitNodeEntry};
