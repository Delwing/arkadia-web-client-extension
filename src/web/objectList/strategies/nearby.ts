import { objectListFilters, type EntryContext } from "@web/objectListFilters.ts";
import {
    hpLevelOf,
    isAttackingObj,
    isNextQueuedObj,
    attackerObjectsOf,
    coverNameClass,
    withCoverMark,
    LEADER_NUM_CLASS,
    showsLeaderMark,
} from "@web/objectList/context.ts";
import type { ObjectListStrategy } from "./types.ts";

// ── Nearby ("W poblizu") ────────────────────────────────────
// A compact key/name/HP row with an attacker "fray" line underneath; the
// shell's click delegation drives .obj__key (attack), .obj__name
// (guard) and .obj__hp (break / pull-back), and the row's data-object-id lets
// the shared right-click menu resolve the object.

type NearbyAllegiance = 'you' | 'ally' | 'enemy';

function nearbyAllegianceOf(obj: any, tm: any): NearbyAllegiance {
    if (obj.shortcut === '@') return 'you';
    if (tm?.isInTeam?.(obj.desc || "")) return 'ally';
    return 'enemy';
}

function nearbyNameClass(obj: any, allegiance: NearbyAllegiance): string | undefined {
    if (allegiance === 'you') return undefined;
    if (obj.avatar_target) return 'target';
    if (allegiance === 'ally') return 'ally';
    if (typeof obj.hp === 'number' && isAttackingObj(obj)) return 'enemy';
    if (typeof obj.hp !== 'number') return 'item';
    return undefined;
}

export const nearbyStrategy: ObjectListStrategy = {
    mode: 'nearby',
    render(ctx) {
        const { objects, tm } = ctx;
        const rows = objects.map((obj: any) => {
            const num = String(obj.shortcut);
            const allegiance = nearbyAllegianceOf(obj, tm);
            const isPlayer = allegiance === 'you';
            const isTeammate = allegiance === 'ally';
            const hasHp = typeof obj.hp === 'number';
            const isNextQueued = isNextQueuedObj(obj, ctx, isPlayer);
            const rawDesc = obj.desc ?? '';

            // Same filter pass as every other flavor, so plugin overrides
            // (colors, description, prefix/suffix, HP bar, css classes) apply here too.
            const filterContext: EntryContext = {
                object: obj,
                displayNum: parseInt(num, 10),
                isTarget: obj.avatar_target || false,
                isNextTarget: isNextQueued,
                isTeammate,
                rawDescription: rawDesc,
                isAttacking: isAttackingObj(obj),
                attackCommand: ctx.attackCommand,
            };
            const filterResult = objectListFilters.apply(filterContext);

            // Match the stock affordances: number attacks enemies, name guards any
            // non-player, HP bar breaks (enemy) / pulls back (teammate).
            const keyClickable = allegiance === 'enemy';
            const nameClickable = !isPlayer;
            const hpClickable = hasHp && !isPlayer;

            const nameClass = nearbyNameClass(obj, allegiance);

            // Who is attacking THIS object, colored by their side.
            const attackerObjs = attackerObjectsOf(obj, ctx.allObjects);
            // Left edge marks the leader's chosen targets (same as the other
            // flavors): red = marked attack target, green = marked defense target.
            const markFg = filterResult.style?.descriptionColor;
            const markBg = filterResult.style?.descriptionBackgroundColor;
            const rowCls =
                'obj' +
                (obj.attack_target ? ' obj--attack-target' : '') +
                (obj.defense_target ? ' obj--defense-target' : '') +
                (isNextQueued ? ' obj--next-queued' : '') +
                (markBg ? ' obj--marked' : '') +
                (filterResult.style?.cssClasses?.length ? ` ${filterResult.style.cssClasses.join(' ')}` : '');
            // A filter-supplied background is a status mark (ogluch, przelamana
            // obrona, plugin flags). It washes the whole row the way the next-target
            // gold does, so the colours ride on the row as vars and each UI decides
            // how strong the wash and the name lift should be.
            const rowStyleAttr = markBg
                ? ` style="--mark-bg:${markBg};${markFg ? `--mark-fg:${markFg};` : ''}"`
                : '';

            // Gold key = next enemy in the attack queue (same signal the list flavor
            // paints on the number and the card flavors on the number badge).
            const keyCls =
                'obj__key' + (isPlayer ? ' you' : '') +
                (isNextQueued ? ' next-target' : '') +
                (keyClickable ? ' is-clickable' : '') +
                (showsLeaderMark(obj, ctx) ? ` ${LEADER_NUM_CLASS}` : '');
            const keyAttrs = keyClickable
                ? ` data-object-num="${num}" data-object-id="${obj.num}" title="Zaatakuj"`
                : showsLeaderMark(obj, ctx) ? ' title="Prowadzi drużynę"' : '';
            const keyLabel = filterResult.content?.numberLabel !== undefined
                ? filterResult.content.numberLabel
                : `<i>${num}</i>`;

            const nameCls =
                'obj__name' + (nameClass ? ` ${nameClass}` : '') +
                (filterResult.style?.italic ? ' is-italic' : '') +
                (nameClickable ? ' is-clickable' : '') +
                (ctx.coverMarks.has(obj.num) ? ` ${coverNameClass(obj, ctx)}` : '');
            const nameAttrs = nameClickable
                ? ` data-object-num="${num}" data-object-id="${obj.num}" data-teammate="${isTeammate ? 'true' : 'false'}" title="Zasłoń"`
                : '';
            const displayDesc = filterResult.content?.description !== undefined
                ? filterResult.content.description
                : rawDesc;
            const finalDesc =
                `${filterResult.style?.prefix || ''}${displayDesc}${filterResult.style?.suffix || ''}`;
            // Colour with no mark is plain text recolouring; with a mark the row
            // styling owns the name colour (the filter's foreground is picked for
            // contrast against its own background, which the wash doesn't paint).
            const nameStyleAttr = !markBg && markFg ? ` style="color:${markFg};"` : '';

            let hpHtml = '';
            const hpAttrs = hpClickable
                ? ` data-object-num="${num}" data-object-id="${obj.num}" data-teammate="${isTeammate ? 'true' : 'false'}" title="${isTeammate ? 'Wycofaj się' : 'Przełam'}"`
                : '';
            if (filterResult.content?.hpBar !== undefined) {
                // Custom HP markup keeps the clickable wrapper; the modifier class
                // drops the built-in gradient so the plugin's own bar is what shows.
                const hpCls = 'obj__hp obj__hp--custom' + (hasHp && !isPlayer ? ' is-clickable' : '');
                hpHtml = `<span class="${hpCls}"${hasHp && !isPlayer ? hpAttrs : ''}>${filterResult.content.hpBar}</span>`;
            } else if (hasHp) {
                const level = hpLevelOf(obj.hp); // 1..7
                const pct = Math.round((level / 7) * 100);
                const hpCls = 'obj__hp' + (hpClickable ? ' is-clickable' : '');
                const hueStyle = filterResult.style?.hpBarColor
                    ? `--hue:${filterResult.style.hpBarColor};`
                    : '';
                hpHtml = `<span class="${hpCls}" style="--hp:${pct}%;${hueStyle}"${hpAttrs}></span>`;
            }

            let atksHtml = '';
            if (attackerObjs.length > 0) {
                const chips = attackerObjs
                    .map((a: any) => `<span class="atk atk--${nearbyAllegianceOf(a, tm)}">${a.shortcut}</span>`)
                    .join('');
                atksHtml = `<span class="obj__atks" title="Atakowany przez">${chips}</span>`;
            }

            // One line: shortcut, HP bar, name (grows), attackers pushed right.
            return `<div class="${rowCls}"${rowStyleAttr} data-object-id="${obj.num}" data-object-num="${num}"><div class="obj__main"><span class="${keyCls}"${keyAttrs}>${keyLabel}</span>${hpHtml}<span class="${nameCls}"${nameAttrs}${nameStyleAttr}>${withCoverMark(obj, ctx, finalDesc)}</span>${atksHtml}</div></div>`;
        });

        return `<div class="objects-list-nearby">${rows.join('')}</div>`;
    },
};
