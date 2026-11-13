// The object-list views, one React component per view mode.
//
// Each turns the shared RenderContext into the list's contents. The shell
// (ObjectList) owns everything else (the window, the data subscription, the
// click and context-menu handlers, the pop-out window, dragging) and mounts
// <ObjectListView> with the chosen mode.
//
// Clicks stay central (ObjectListEventHandlers): every view tags its clickable
// parts with the same `data-object-num` / `data-object-id` (+ `data-action`)
// attributes, so one delegated handler serves them all; the views only differ
// in which element carries them.

import type { ComponentType } from "react";
import type { ObjectListViewMode, RenderContext } from "@web/objectList/context.ts";
import { ListView } from "./ListView.tsx";
import { CardView } from "./CardView.tsx";
import { CompactDotsView, CompactView } from "./CompactView.tsx";
import { RaidView } from "./RaidView.tsx";
import { NearbyView } from "./NearbyView.tsx";
import { EmptyList } from "./markup.tsx";

export { ListView, ListLine } from "./ListView.tsx";
export { EmptyList } from "./markup.tsx";

const VIEWS: Record<ObjectListViewMode, ComponentType<{ ctx: RenderContext }>> = {
    list: ListView,
    card: CardView,
    compact: CompactView,
    'compact-dots': CompactDotsView,
    raid: RaidView,
    nearby: NearbyView,
};

/** The list's contents in the given mode, or the placeholder when there is nothing. */
export function ObjectListView({ mode, ctx }: { mode: ObjectListViewMode; ctx: RenderContext }) {
    if (ctx.objects.length === 0) return <EmptyList />;
    const View = VIEWS[mode] ?? ListView;
    return <View ctx={ctx} />;
}
