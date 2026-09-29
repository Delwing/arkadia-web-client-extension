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
import {getCoverTracker} from "@client/scripts/coverTracker.ts";
import {getRenderSettings} from "@modules/core/settings";

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
    /** Enemies covered against us / against teammates. Empty when the setting is off. */
    coverMarks: Map<number, CoverMark>;
    /** Cover markers are on: the list flavor reserves a column for the shield. */
    coverMarkers: boolean;
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
    const coverMarkers = getRenderSettings().objectListCoverMarkers === true;
    const coverMarks = buildCoverMarks(client, objects, tm);
    return { objects, tm, isLeader, teamAttacking, validNextQueuedId, descWidth, attackCommand, coverMarks, coverMarkers };
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

/** An enemy the cover tracker says is shielded against us, or only against teammates. */
export interface CoverMark {
    kind: 'us' | 'team';
    /** Who is blocked, for the tooltip. */
    blocked: string[];
}

/**
 * Cover state per enemy, for the marker after its name. Empty unless the setting
 * is on. "us" wins over "team": when we cannot hit it, that is the thing to see.
 */
export function buildCoverMarks(client: Client, objects: any[], tm: any): Map<number, CoverMark> {
    const marks = new Map<number, CoverMark>();
    const tracker = getCoverTracker();
    if (!tracker || getRenderSettings().objectListCoverMarkers !== true) return marks;
    const playerNum: number | undefined = client.TeamManager?.playerNum;
    const teammates = objects.filter((o: any) => o.shortcut !== '@' && tm?.isInTeam?.(o.desc || ""));
    for (const obj of objects) {
        if (obj.shortcut === '@' || tm?.isInTeam?.(obj.desc || "")) continue;
        const vsUs = playerNum !== undefined && tracker.isCoveredFor(obj.num, playerNum);
        const blocked = teammates.filter((t: any) => tracker.isCoveredFor(obj.num, t.num)).map((t: any) => t.desc);
        if (vsUs) marks.set(obj.num, { kind: 'us', blocked: ['ty', ...blocked] });
        else if (blocked.length) marks.set(obj.num, { kind: 'team', blocked });
    }
    return marks;
}

const COVER_SHIELD_PATH = 'M12 2.5 4 5.5v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10v-6z';

/** Class for the name element of a marked enemy ('' when unmarked). */
export function coverNameClass(obj: any, ctx: RenderContext): string {
    const mark = ctx.coverMarks.get(obj.num);
    return mark ? `is-covered-${mark.kind}` : '';
}

/**
 * The name content with the shield after it. The text gets its own span so card
 * names keep their ellipsis on the text and the shield never gets clipped.
 */
export function withCoverMark(obj: any, ctx: RenderContext, nameHtml: string): string {
    const mark = ctx.coverMarks.get(obj.num);
    if (!mark) return nameHtml;
    const title = `Zasłonięty przed: ${mark.blocked.join(', ')}`;
    return `<span class="cover-name">${nameHtml}</span><svg class="cover-mark cover-mark--${mark.kind}" viewBox="0 0 24 24"><title>${title}</title><path d="${COVER_SHIELD_PATH}"/></svg>`;
}
