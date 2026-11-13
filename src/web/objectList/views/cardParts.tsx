// The parts the card-family views (card, compact, compact-dots, raid) share:
// the card's classes, the number badge, the name, the action icons, the
// attacker chips and the HP fill.

import type { CSSProperties } from "react";
import { type RenderContext, coverNameClass, LEADER_NUM_CLASS } from "@web/objectList/context.ts";
import { objectData, type Entry } from "./entry.ts";
import { CoverMarked, NameText } from "./markup.tsx";
import { cls } from "./util.ts";
import { hpOf } from "./cardModel.ts";

/** The shortcut: click attacks; gold when next in the queue, crowned for the leader. */
export function NumberBadge({ entry }: { entry: Entry }) {
    return (
        <span
            className={cls('object-card__number', entry.isNextQueued && 'object-card__number--next-target', entry.leaderMark && LEADER_NUM_CLASS)}
            {...objectData(entry)}
            title={entry.leaderMark ? 'Prowadzi drużynę' : 'Zaatakuj'}
        >{entry.num}</span>
    );
}

/** The name: click guards; coloured by side and state, or by the filters. */
export function CardName({ entry, ctx }: { entry: Entry; ctx: RenderContext }) {
    const { obj, filter } = entry;
    const plainEnemy = !entry.isPlayer && !entry.isTeammate;
    const notAttacking = entry.isTeammate && ctx.teamAttacking && !entry.isAttacking;
    const style: CSSProperties = {};
    if (filter.style?.descriptionColor) style.color = filter.style.descriptionColor;
    if (filter.style?.descriptionBackgroundColor) style.backgroundColor = filter.style.descriptionBackgroundColor;
    return (
        <span
            className={cls(
                'object-card__name',
                coverNameClass(obj, ctx),
                entry.isTarget && plainEnemy && 'object-card__name--target',
                entry.isTeammate && 'object-card__name--teammate',
                entry.isAttacking && plainEnemy && !entry.isTarget && 'object-card__name--attacking',
                // The filters' italic switch reuses the "teammate not attacking" style.
                (notAttacking || filter.style?.italic) && 'object-card__name--teammate-not-attacking',
            )}
            {...objectData(entry)}
            title="Zasłoń"
            style={Object.keys(style).length ? style : undefined}
        >
            <CoverMarked obj={obj} ctx={ctx}><NameText entry={entry} /></CoverMarked>
        </span>
    );
}

/** Attack / guard / break icons on an enemy, guard on a teammate; the leader also marks targets. */
export function CardIcons({ entry, ctx }: { entry: Entry; ctx: RenderContext }) {
    const data = objectData(entry);
    const { obj } = entry;
    if (!entry.isPlayer && !entry.isTeammate) {
        return (
            <>
                <span className="object-card__icon object-card__icon--attack" data-action="attack" {...data} title="Zaatakuj" />
                <span className="object-card__icon object-card__icon--guard" data-action="guard" {...data} title="Zasłoń" />
                <span className="object-card__icon object-card__icon--przelam" data-action="przelam" {...data} title="Przełam" />
                {ctx.isLeader && (
                    <span
                        className={cls('object-card__icon object-card__icon--mark-attack', obj.attack_target && 'object-card__icon--mark-attack--active')}
                        data-action="mark-attack" {...data} title="Wyznacz cel ataku"
                    />
                )}
            </>
        );
    }
    if (entry.isTeammate) {
        return (
            <>
                <span className="object-card__icon object-card__icon--guard" data-action="guard" {...data} title="Zasłoń" />
                {ctx.isLeader && (
                    <span
                        className={cls('object-card__icon object-card__icon--mark-defense', obj.defense_target && 'object-card__icon--mark-defense--active')}
                        data-action="mark-defense" {...data} title="Wyznacz cel obrony"
                    />
                )}
            </>
        );
    }
    return null;
}

/** The leader's dot before the shortcut, for marking attack / defense targets. */
export function TargetDot({ entry, ctx }: { entry: Entry; ctx: RenderContext }) {
    if (!ctx.isLeader) return null;
    const { obj } = entry;
    return entry.isPlayer || entry.isTeammate
        ? <span className={cls('object-card__target-dot object-card__target-dot--defense', obj.defense_target && 'object-card__target-dot--active')} data-action="mark-defense" {...objectData(entry)} title="Wyznacz cel obrony" />
        : <span className={cls('object-card__target-dot object-card__target-dot--attack', obj.attack_target && 'object-card__target-dot--active')} data-action="mark-attack" {...objectData(entry)} title="Wyznacz cel ataku" />;
}

/** The shortcuts of whoever attacks this object. */
export function AttackerChips({ entry, ctx }: { entry: Entry; ctx: RenderContext }) {
    const attackers = ctx.allObjects.filter((o: any) => o.attack_num === entry.obj.num);
    return <>{attackers.map((o: any, i: number) => <span key={i} className="object-card__attacker">{o.shortcut}</span>)}</>;
}

/** The horizontal fill inside a card's HP bar. */
export function HpFill({ entry }: { entry: Entry }) {
    const hp = hpOf(entry);
    if (!hp) return null;
    return <div className="object-card__hp-fill" style={{ width: `${hp.percent}%`, backgroundColor: hp.color }} />;
}
