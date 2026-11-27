// "W poblizu" view: a compact key / HP / name row per object with who attacks
// it pushed right. The shared click handlers drive .obj__key (attack),
// .obj__name (guard) and .obj__hp (break / pull back), and the row's
// data-object-id lets the right-click menu find the object.

import type { CSSProperties } from "react";
import { type RenderContext, attackerObjectsOf, coverNameClass, hpLevelOf, LEADER_NUM_CLASS } from "@web/objectList/context.ts";
import { entryKey, entryOf, objectData, type Entry } from "./entry.ts";
import { CoverMarked, NameText, Rich } from "./markup.tsx";
import { cls } from "./util.ts";

type Allegiance = 'you' | 'ally' | 'enemy';

function allegianceOf(obj: any, tm: any): Allegiance {
    if (obj.shortcut === '@') return 'you';
    if (tm?.isInTeam?.(obj.desc || "")) return 'ally';
    return 'enemy';
}

function nameClass(entry: Entry): string | undefined {
    const { obj } = entry;
    if (entry.isPlayer) return undefined;
    if (obj.avatar_target) return 'target';
    if (entry.isTeammate) return 'ally';
    if (typeof obj.hp === 'number' && entry.isAttacking) return 'enemy';
    if (typeof obj.hp !== 'number') return 'item';
    return undefined;
}

function Hp({ entry }: { entry: Entry }) {
    const { obj, filter } = entry;
    const hasHp = typeof obj.hp === 'number';
    const clickable = hasHp && !entry.isPlayer;
    const attrs = clickable
        ? { ...objectData(entry), 'data-teammate': entry.isTeammate ? 'true' : 'false', title: entry.isTeammate ? 'Wycofaj się' : 'Przełam' }
        : {};
    if (filter.content?.hpBar !== undefined) {
        // Custom HP markup keeps the clickable wrapper; the modifier class
        // drops the built-in gradient so the plugin's own bar is what shows.
        return (
            <span className={cls('obj__hp obj__hp--custom', clickable && 'is-clickable')} {...attrs}>
                <Rich html={filter.content.hpBar} />
            </span>
        );
    }
    if (!hasHp) return null;
    const style = { '--hp': `${Math.round((hpLevelOf(obj.hp) / 7) * 100)}%` } as CSSProperties;
    if (filter.style?.hpBarColor) (style as any)['--hue'] = filter.style.hpBarColor;
    return <span className={cls('obj__hp', clickable && 'is-clickable')} style={style} {...attrs} />;
}

function Row({ obj, ctx }: { obj: any; ctx: RenderContext }) {
    const entry = entryOf(obj, ctx);
    const { filter } = entry;
    const isEnemy = !entry.isPlayer && !entry.isTeammate;
    const markFg = filter.style?.descriptionColor;
    const markBg = filter.style?.descriptionBackgroundColor;
    // A filter-supplied background is a status mark (ogluch, przelamana obrona,
    // plugin flags). It washes the whole row the way the next-target gold does,
    // so the colours ride on the row as vars and each UI decides how strong the
    // wash and the name lift should be.
    const rowStyle = markBg
        ? ({ '--mark-bg': markBg, ...(markFg ? { '--mark-fg': markFg } : {}) } as CSSProperties)
        : undefined;
    const attackers = attackerObjectsOf(obj, ctx.allObjects);
    const numberHtml = filter.content?.numberLabel;
    return (
        <div
            className={cls(
                'obj',
                obj.attack_target && 'obj--attack-target',
                obj.defense_target && 'obj--defense-target',
                entry.isNextQueued && 'obj--next-queued',
                markBg && 'obj--marked',
                ...(filter.style?.cssClasses ?? []),
            )}
            style={rowStyle}
            {...objectData(entry)}
        >
            <div className="obj__main">
                {/* Gold key = next enemy in the attack queue; click attacks an enemy. */}
                <span
                    className={cls('obj__key', entry.isPlayer && 'you', entry.isNextQueued && 'next-target', isEnemy && 'is-clickable', entry.leaderMark && LEADER_NUM_CLASS)}
                    {...(isEnemy ? { ...objectData(entry), title: 'Zaatakuj' } : entry.leaderMark ? { title: 'Prowadzi drużynę' } : {})}
                >
                    {numberHtml !== undefined ? <Rich html={numberHtml} /> : <i>{entry.num}</i>}
                </span>
                <Hp entry={entry} />
                <span
                    className={cls('obj__name', nameClass(entry), filter.style?.italic && 'is-italic', !entry.isPlayer && 'is-clickable', coverNameClass(obj, ctx))}
                    {...(!entry.isPlayer ? { ...objectData(entry), 'data-teammate': entry.isTeammate ? 'true' : 'false', title: 'Zasłoń' } : {})}
                    // A colour with no mark recolours the name; with a mark the row
                    // owns it (the filter's colour was picked against its own background).
                    style={!markBg && markFg ? { color: markFg } : undefined}
                >
                    <CoverMarked obj={obj} ctx={ctx}><NameText entry={entry} /></CoverMarked>
                </span>
                {attackers.length > 0 && (
                    <span className="obj__atks" title="Atakowany przez">
                        {attackers.map((a: any, i: number) => (
                            <span key={i} className={`atk atk--${allegianceOf(a, ctx.tm)}`}>{a.shortcut}</span>
                        ))}
                    </span>
                )}
            </div>
        </div>
    );
}

export function NearbyView({ ctx }: { ctx: RenderContext }) {
    return (
        <div className="objects-list-nearby">
            {ctx.objects.map((obj: any, i: number) => <Row key={entryKey(obj, i)} obj={obj} ctx={ctx} />)}
        </div>
    );
}
