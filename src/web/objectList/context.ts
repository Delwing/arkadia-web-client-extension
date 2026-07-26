// Shared render context + helpers for the object-list view strategies.
//
// Every flavor (list / card / compact / compact-dots / raid / nearby) renders the
// SAME object set with the SAME derived facts — who's a teammate, who's the next
// queued enemy, whether the team is attacking, the leader flag. Historically each
// render method recomputed all of that inline; the strategy seam hoists it here
// once (`buildRenderContext`) and each strategy consumes it, so the shell just
// builds the context and delegates to the active strategy.
//
// The per-row markup still lives in each strategy (they diverge wildly): this is
// only the context that is genuinely identical across flavors.

import type Client from "@client/Client";

export type ObjectListViewMode =
    | 'list'
    | 'card'
    | 'compact'
    | 'compact-dots'
    | 'raid'
    | 'nearby';

/** The facts shared by every flavor for a single render pass. */
export interface RenderContext {
    /** The objects on the current location (already fetched by the shell). */
    objects: any[];
    /** TeamManager (may be undefined in headless/early states). */
    tm: any;
    /** Whether the local character currently leads the team. */
    isLeader: boolean;
    /** True when any teammate is attacking — drives the "not attacking" italic. */
    teamAttacking: boolean;
    /** The next enemy in the attack queue, IF it exists in the current objects. */
    validNextQueuedId: number | undefined;
    /** Widest description, for the monospace list view's padding column. */
    descWidth: number;
    /** The active attack command (from the attack controller) for filter context. */
    attackCommand: string;
}

/**
 * Compute the shared context once per render. `attackCommand` is passed in from
 * the shell (it owns the attack controller); everything else derives from the
 * objects + TeamManager.
 */
export function buildRenderContext(
    client: Client,
    objects: any[],
    attackCommand: string,
): RenderContext {
    const tm = client.TeamManager;
    const nextQueuedId = tm?.getEnemyQueue?.()?.[0];
    // Only highlight the queued enemy if it's actually present in this location.
    const queuedEnemyExists =
        nextQueuedId !== undefined &&
        objects.some((o: any) => typeof o.num !== "undefined" && o.num === nextQueuedId);
    const validNextQueuedId = queuedEnemyExists ? nextQueuedId : undefined;
    const teamAttacking = objects.some(
        (o: any) => tm?.isInTeam?.(o.desc) && o.attack_num !== false && o.attack_num !== undefined,
    );
    const isLeader = !!tm?.isLeader?.();
    const descWidth = Math.max(0, ...objects.map((o: any) => (o.desc || "").length));
    return { objects, tm, isLeader, teamAttacking, validNextQueuedId, descWidth, attackCommand };
}

/** Is this object currently attacking someone (numeric or `true` attack_num)? */
export function isAttackingObj(obj: any): boolean {
    return obj.attack_num !== false && obj.attack_num !== undefined;
}

/** Is this object the (validated) next queued enemy? */
export function isNextQueuedObj(obj: any, ctx: RenderContext, isPlayer: boolean): boolean {
    return (
        !isPlayer &&
        ctx.validNextQueuedId !== undefined &&
        typeof obj.num !== "undefined" &&
        ctx.validNextQueuedId === obj.num
    );
}

/** The shortcuts of the objects attacking `obj` (used by the card/list arrows). */
export function attackerShortcutsOf(obj: any, objects: any[]): string[] {
    return objects.filter((o: any) => o.attack_num === obj.num).map((o: any) => o.shortcut);
}

/** The objects attacking `obj` (nearby view needs each attacker's allegiance). */
export function attackerObjectsOf(obj: any, objects: any[]): any[] {
    return objects.filter((o: any) => o.attack_num === obj.num);
}

/** Card-family HP colour ramp: 1-2 dark red … 7 green (0-6 hp → level 1-7). */
export const CARD_HP_COLORS: Record<number, string> = {
    1: '#dc2626',
    2: '#dc2626',
    3: '#ef4444',
    4: '#f97316',
    5: '#eab308',
    6: '#84cc16',
    7: '#22c55e',
};

/** hp (0-6, clamped) → level 1-7 used by every flavor's HP visuals. */
export function hpLevelOf(hp: number): number {
    return Math.max(0, Math.min(6, hp)) + 1;
}
