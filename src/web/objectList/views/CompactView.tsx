// Compact views: one row per object. `compact` puts a vertical HP bar on the
// left; `compact-dots` shows HP as seven dots after the name instead.

import type { RenderContext } from "@web/objectList/context.ts";
import { entryKey, entryOf, objectData, type Entry } from "./entry.ts";
import { AttackerChips, CardName, NumberBadge, TargetDot } from "./cardParts.tsx";
import { cardClass, hasAttackers, hpBarProps, hpOf } from "./cardModel.ts";

function VerticalHpBar({ entry }: { entry: Entry }) {
    const hp = hpOf(entry);
    if (!hp) return null;
    return (
        <div {...hpBarProps(entry, 'object-card__hp-bar-vertical')}>
            <div className="object-card__hp-fill-vertical" style={{ height: `${hp.percent}%`, backgroundColor: hp.color }} />
        </div>
    );
}

/** Filled dots for the HP there is, smaller grey ones for the HP missing. */
function HpDots({ entry }: { entry: Entry }) {
    const hp = hpOf(entry);
    if (!hp) return null;
    return (
        <div {...hpBarProps(entry, 'object-card__hp-dots')}>
            {Array.from({ length: 7 }, (_, i) => i < hp.level
                ? <span key={i} className="object-card__hp-dot object-card__hp-dot--filled" style={{ backgroundColor: hp.color }} />
                : <span key={i} className="object-card__hp-dot object-card__hp-dot--empty" />)}
        </div>
    );
}

function CompactCard({ obj, ctx, dots }: { obj: any; ctx: RenderContext; dots: boolean }) {
    const entry = entryOf(obj, ctx);
    return (
        <div className={cardClass(entry, 'object-card--compact', dots && 'object-card--compact-dots')} {...objectData(entry)}>
            {!dots && <VerticalHpBar entry={entry} />}
            <div className="object-card__compact-content">
                <TargetDot entry={entry} ctx={ctx} />
                <NumberBadge entry={entry} />
                <CardName entry={entry} ctx={ctx} />
                {dots && <HpDots entry={entry} />}
                {hasAttackers(entry, ctx) && (
                    <span className="object-card__attackers-inline"><AttackerChips entry={entry} ctx={ctx} /></span>
                )}
            </div>
        </div>
    );
}

export function CompactView({ ctx, dots = false }: { ctx: RenderContext; dots?: boolean }) {
    return (
        <div className="objects-list-cards objects-list-cards--compact">
            {ctx.objects.map((obj: any, i: number) => <CompactCard key={entryKey(obj, i)} obj={obj} ctx={ctx} dots={dots} />)}
        </div>
    );
}

export function CompactDotsView({ ctx }: { ctx: RenderContext }) {
    return <CompactView ctx={ctx} dots />;
}
