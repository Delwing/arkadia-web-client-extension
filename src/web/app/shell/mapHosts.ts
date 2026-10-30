import { MovableHost } from "@web/layout/movableHost.ts";

/*
The elements whose contents belong to an engine rather than to React, shown in
their default spot or in a layout panel (see MovableHost). Created here, not in
index.html, so React never owns a node that moves.
*/

/** The map's drawing surface; EmbeddedMap renders into it. */
export const mapHost = MovableHost.create("map");

/** Kondycje and its non-team window; ObjectList fills them. */
export const objectListHost = MovableHost.create("objects-list", { "data-mobile-command-radial-ignore": "" });
export const objectListOthersHost = MovableHost.create("objects-list-others", { "data-mobile-command-radial-ignore": "" });
