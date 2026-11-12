// Object-list view strategies.
//
// Each flavor is a strategy that turns the shared RenderContext into the panel
// body's innerHTML. The shell (ObjectList) owns everything else — the dock
// window, data subscription, click / context-menu delegation, PiP, drag — and
// just picks a strategy by viewMode and delegates. One file per flavor (list /
// card / compact / compact-dots / raid, and `nearby`, the "W poblizu" flavor);
// this file is the registry the shell picks from.
//
// Click handling stays central (ObjectListEventHandlers): every flavor tags its clickable
// parts with the same `data-object-num` / `data-object-id` (+ `data-action`)
// attributes, so one delegated handler serves them all — the only per-flavor
// difference is which element carries them.

import type { ObjectListViewMode } from "@web/objectList/context.ts";
import type { ObjectListStrategy } from "./types.ts";
import { listStrategy } from "./list.ts";
import { cardStrategy } from "./card.ts";
import { compactStrategy } from "./compact.ts";
import { compactDotsStrategy } from "./compactDots.ts";
import { raidStrategy } from "./raid.ts";
import { nearbyStrategy } from "./nearby.ts";

export type { ObjectListStrategy } from "./types.ts";
export { renderListLines } from "./list.ts";

export const STRATEGIES: Record<ObjectListViewMode, ObjectListStrategy> = {
    list: listStrategy,
    card: cardStrategy,
    compact: compactStrategy,
    'compact-dots': compactDotsStrategy,
    raid: raidStrategy,
    nearby: nearbyStrategy,
};

export function getStrategy(mode: ObjectListViewMode): ObjectListStrategy {
    return STRATEGIES[mode] ?? listStrategy;
}
