import { MapRenderer, type Style } from "mudlet-map-renderer";
import eventBus from "@modules/core/eventBus";
import { getEmbeddedMap } from "@web/embedRegistry";

/**
 * The map, reframed as a Word figure.
 *
 * A MUD map is already a node-link diagram -- boxes joined by lines -- which is
 * exactly what a Word document contains when it holds an org chart or a process
 * schematic. So the map needs no disguising, only a frame, a caption and a
 * paper palette; the game's own map is dark, and a dark rectangle in the middle
 * of a white page is the one thing that would give the document away.
 *
 * This spawns its OWN `MapRenderer` over the shared reader, the same way the
 * static-map popup does, rather than relocating the live `#map` node. Borrowing
 * that node was tried first and was the wrong shape: the singleton is sized and
 * centred for wherever it normally lives, so moving it into a small figure left
 * the player's room outside the view, and every fix meant mutating renderer
 * state that then had to be restored. An independent renderer with its own
 * settings object has no such coupling -- the user's real map is never touched.
 */

/** Settings this figure overrides on its private copy. */
const PAPER_SETTINGS: Record<string, unknown> = {
    backgroundColor: "#ffffff",
    lineColor: "rgba(90, 90, 90, 0.55)",
    borders: true,
    gridEnabled: false,
    emboss: false,
};

/** Word's blue, for the current room. */
const PAPER_MARKER: Record<string, unknown> = {
    strokeColor: "#2b579a",
    fillColor: "#2b579a",
    strokeAlpha: 1,
    fillAlpha: 0.18,
    sizeFactor: 1.35,
    dashEnabled: false,
    matchRoomShape: true,
};

/** Small figure, so the surrounding rooms still fit around the player. */
const FIGURE_ZOOM = 0.42;

/**
 * Paint every room white.
 *
 * The game colours rooms by environment, which is the single most game-like
 * thing about the map: a grid of saturated green and brown boxes does not
 * appear in a quarterly report. White boxes with a grey outline read as an
 * ordinary flowchart. Only room *fills* are touched -- labels and exit lines
 * keep their own paint, so the diagram stays legible.
 */
const PaperRooms: Style = {
    transform(shape) {
        if (shape.type !== "rect" && shape.type !== "circle" && shape.type !== "polygon") return shape;
        // `layer` defaults to "room" when omitted; `hit.kind` distinguishes a
        // room box from an exit stub drawn on the same layer.
        if ((shape.layer ?? "room") !== "room") return shape;
        if (shape.hit?.kind && shape.hit.kind !== "room") return shape;
        return {
            ...shape,
            paint: { ...shape.paint, fill: "#ffffff", stroke: shape.paint.stroke ?? "#6b6b6b" },
        };
    },
};

/** The renderer's own settings type, derived so it cannot drift from it. */
type RendererSettings = NonNullable<ReturnType<typeof getEmbeddedMap>>["settings"];

/**
 * A private copy of the live settings.
 *
 * Shallow-cloned, with `playerMarker` cloned separately because it is the one
 * nested object we override -- without that, the marker changes would write
 * straight through to the shared settings and recolour the user's own map.
 */
function paperSettings(source: RendererSettings): RendererSettings {
    return {
        ...source,
        ...PAPER_SETTINGS,
        playerMarker: { ...source.playerMarker, ...PAPER_MARKER },
    } as RendererSettings;
}

/**
 * Render the map into `frame`, following the player, until the returned
 * teardown is called.
 *
 * Returns a no-op teardown when the map has not loaded yet; the overlay simply
 * shows an empty figure in that case, which is what an unloaded diagram
 * placeholder looks like anyway.
 */
export function mountMapFigure(frame: HTMLElement): () => void {
    const embedded = getEmbeddedMap();
    if (!embedded?.reader) return () => {};

    const container = document.createElement("div");
    container.style.cssText = "position:absolute;inset:0;";
    frame.appendChild(container);

    const renderer = new MapRenderer(embedded.reader, paperSettings(embedded.settings), container);
    // The figure never resizes while it is up, and re-centring on resize would
    // fight the explicit centring below.
    renderer.setStyle(PaperRooms);
    renderer.centerOnResize = false;
    renderer.setZoom(FIGURE_ZOOM);

    /** Draw the player's current area/level and centre the view on their room. */
    const drawPlayer = () => {
        const roomId = embedded.currentRoom;
        if (!roomId) return;
        const room = embedded.reader.getRoom(roomId);
        if (!room) return;
        renderer.drawArea(room.area, room.z);
        // setPosition centres the view; updatePositionMarker paints the marker.
        renderer.setPosition(roomId);
        renderer.updatePositionMarker(roomId);
    };

    // The frame has no laid-out size until after the mounting effect runs, and
    // centring against a zero-size box puts the player off screen -- the one
    // thing this figure exists to avoid.
    const firstDraw = requestAnimationFrame(drawPlayer);
    const offMove = eventBus.on("enterLocation", drawPlayer);

    return () => {
        cancelAnimationFrame(firstDraw);
        offMove();
        renderer.destroy?.();
        container.remove();
    };
}
