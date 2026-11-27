// Card view: one card per object, with the name and action icons on top, the
// attackers under them and a horizontal HP bar at the bottom.

import type { RenderContext } from "@web/objectList/context.ts";
import { entryKey, entryOf, objectData } from "./entry.ts";
import { Rich } from "./markup.tsx";
import { AttackerChips, CardIcons, CardName, HpFill, NumberBadge } from "./cardParts.tsx";
import { cardClass, hpBarProps } from "./cardModel.ts";

function Card({ obj, ctx }: { obj: any; ctx: RenderContext }) {
    const entry = entryOf(obj, ctx);
    const customHp = entry.filter.content?.hpBar;
    return (
        <div className={cardClass(entry)} {...objectData(entry)}>
            <div className="object-card__row1">
                <NumberBadge entry={entry} />
                <CardName entry={entry} ctx={ctx} />
                <span className="object-card__icons"><CardIcons entry={entry} ctx={ctx} /></span>
            </div>
            <div className="object-card__row2">
                <span className="object-card__attackers"><AttackerChips entry={entry} ctx={ctx} /></span>
            </div>
            <div {...hpBarProps(entry, 'object-card__hp-bar')}>
                {customHp !== undefined ? <Rich html={customHp} /> : <HpFill entry={entry} />}
            </div>
        </div>
    );
}

export function CardView({ ctx }: { ctx: RenderContext }) {
    return (
        <div className="objects-list-cards">
            {ctx.objects.map((obj: any, i: number) => <Card key={entryKey(obj, i)} obj={obj} ctx={ctx} />)}
        </div>
    );
}
