// Raid view: a grid of cards, the team (player first, then the leader) apart
// from the enemies.

import { type RenderContext, isTeamLeaderObj } from "@web/objectList/context.ts";
import { entryKey, entryOf, objectData } from "./entry.ts";
import { Rich } from "./markup.tsx";
import { AttackerChips, CardIcons, CardName, HpFill, NumberBadge } from "./cardParts.tsx";
import { cardClass, hasAttackers, hpBarProps } from "./cardModel.ts";

function RaidCard({ obj, ctx }: { obj: any; ctx: RenderContext }) {
    const entry = entryOf(obj, ctx);
    const customHp = entry.filter.content?.hpBar;
    const bar = hpBarProps(entry, 'object-card__hp-bar');
    return (
        <div className={cardClass(entry, 'object-card--raid')} {...objectData(entry)}>
            <div {...bar} className={`${bar.className} object-card__hp-bar--raid`}>
                {customHp !== undefined ? <Rich html={customHp} /> : <HpFill entry={entry} />}
            </div>
            <div className="object-card__raid-content">
                <div className="object-card__raid-row object-card__raid-row--main">
                    <NumberBadge entry={entry} />
                    <CardName entry={entry} ctx={ctx} />
                </div>
                <div className="object-card__raid-row object-card__raid-row--attackers">
                    {hasAttackers(entry, ctx) && (
                        <span className="object-card__attackers-inline"><AttackerChips entry={entry} ctx={ctx} /></span>
                    )}
                </div>
            </div>
            <span className="object-card__icons object-card__icons--raid"><CardIcons entry={entry} ctx={ctx} /></span>
        </div>
    );
}

export function RaidView({ ctx }: { ctx: RenderContext }) {
    const team: any[] = [];
    const enemies: any[] = [];
    for (const obj of ctx.objects) {
        if (obj.shortcut === '@' || ctx.tm?.isInTeam?.(obj.desc || "")) team.push(obj);
        else enemies.push(obj);
    }
    team.sort((a: any, b: any) => {
        if (a.shortcut === '@') return -1;
        if (b.shortcut === '@') return 1;
        // The leader comes right after the player.
        if (isTeamLeaderObj(a, ctx)) return -1;
        if (isTeamLeaderObj(b, ctx)) return 1;
        return 0;
    });
    return (
        <div className="objects-list-raid-wrapper">
            {team.length > 0 && (
                <div className="objects-list-cards objects-list-cards--raid objects-list-cards--raid-team">
                    {team.map((obj, i) => <RaidCard key={entryKey(obj, i)} obj={obj} ctx={ctx} />)}
                </div>
            )}
            {enemies.length > 0 && (
                <div className="objects-list-cards objects-list-cards--raid objects-list-cards--raid-enemies">
                    {enemies.map((obj, i) => <RaidCard key={entryKey(obj, i)} obj={obj} ctx={ctx} />)}
                </div>
            )}
        </div>
    );
}
