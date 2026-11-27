// What every view needs to know about one object before drawing it: its side,
// its combat state, and what the plugin filters (objectListFilters) say about it.
// Each view used to work this out inline, six times over.

import { objectListFilters, type FilterResult } from "@web/objectListFilters.ts";
import {
    type RenderContext,
    isAttackingObj,
    isNextQueuedObj,
    showsLeaderMark,
} from "@web/objectList/context.ts";

export interface Entry {
    obj: any;
    /** The shortcut as shown ("1", "A", "@"); carried in `data-object-num`. */
    num: string;
    isPlayer: boolean;
    /** A teammate other than the player. */
    isTeammate: boolean;
    isAttacking: boolean;
    /** The next enemy in the attack queue. */
    isNextQueued: boolean;
    /** Our avatar's current target. */
    isTarget: boolean;
    /** The leader crown goes on this object's shortcut. */
    leaderMark: boolean;
    filter: FilterResult;
}

export function entryOf(obj: any, ctx: RenderContext): Entry {
    const num = String(obj.shortcut);
    const isPlayer = obj.shortcut === '@';
    const rawDesc = obj.desc || "";
    const isTeammate = !isPlayer && !!ctx.tm?.isInTeam?.(rawDesc);
    const isAttacking = isAttackingObj(obj);
    const isNextQueued = isNextQueuedObj(obj, ctx, isPlayer);
    const isTarget = !!obj.avatar_target;
    const filter = objectListFilters.apply({
        object: obj,
        displayNum: parseInt(num, 10),
        isTarget,
        isNextTarget: isNextQueued,
        // The player is never in its own team, so this matches what filters always got.
        isTeammate: !!ctx.tm?.isInTeam?.(rawDesc),
        rawDescription: rawDesc,
        isAttacking,
        attackCommand: ctx.attackCommand,
    });
    return {
        obj,
        num,
        isPlayer,
        isTeammate,
        isAttacking,
        isNextQueued,
        isTarget,
        leaderMark: showsLeaderMark(obj, ctx),
        filter,
    };
}

/** React key for an object's row: its id, or the shortcut when there is none. */
export function entryKey(obj: any, index: number): string {
    return obj.num !== undefined ? `n${obj.num}` : `s${obj.shortcut ?? index}`;
}

/** The `data-object-num` / `data-object-id` pair the click handlers read. */
export function objectData(entry: Entry): { 'data-object-num': string; 'data-object-id': string } {
    return { 'data-object-num': entry.num, 'data-object-id': String(entry.obj.num) };
}
