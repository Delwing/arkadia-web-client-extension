import type { ObjectListViewMode, RenderContext } from "@web/objectList/context.ts";

export interface ObjectListStrategy {
    mode: ObjectListViewMode;
    /** Build the panel body innerHTML for this flavor. */
    render(ctx: RenderContext): string;
    /** When true the shell attaches its card context-menu handler to every
     *  `.objects-list-cards` container after render (card-family flavors). */
    cardContextMenu?: boolean;
}
