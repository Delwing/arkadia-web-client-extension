// What the card-family views compute per card: its classes, its HP, and the
// HP bar's click target.

import { type RenderContext, CARD_HP_COLORS, hpLevelOf } from "@web/objectList/context.ts";
import { objectData, type Entry } from "./entry.ts";
import { cls } from "./util.ts";

/** The card's classes: its flavor's, then its state, then the filters'. */
export function cardClass(entry: Entry, ...flavor: (string | false)[]): string {
    const { obj } = entry;
    return cls(
        'object-card', ...flavor,
        entry.isPlayer && 'object-card--player',
        entry.isTeammate && 'object-card--teammate',
        entry.isTarget && !entry.isPlayer && 'object-card--target',
        entry.isNextQueued && 'object-card--next-queued',
        obj.attack_target && 'object-card--attack-target',
        obj.defense_target && 'object-card--defense-target',
        ...(entry.filter.style?.cssClasses ?? []),
    );
}

export function hasAttackers(entry: Entry, ctx: RenderContext): boolean {
    return ctx.allObjects.some((o: any) => o.attack_num === entry.obj.num);
}

/** HP as level 1–7 and its colour (the filters may recolour it); null without HP. */
export function hpOf(entry: Entry): { level: number; percent: number; color: string } | null {
    if (typeof entry.obj.hp !== 'number') return null;
    const level = hpLevelOf(entry.obj.hp);
    const color = entry.filter.style?.hpBarColor || CARD_HP_COLORS[level] || '#22c55e';
    return { level, percent: (level / 7) * 100, color };
}

/** The HP bar's click: break an enemy's guard, or pull a teammate back. */
export function hpBarProps(entry: Entry, base: string): { className: string; title: string } & ReturnType<typeof objectData> {
    return {
        className: entry.isTeammate ? `${base}--teammate` : base,
        title: entry.isTeammate ? 'Wycofaj się' : 'Przełam',
        ...objectData(entry),
    };
}
