import { objectListFilters, type EntryContext } from "@web/objectListFilters.ts";
import {
    CARD_HP_COLORS,
    hpLevelOf,
    isAttackingObj,
    isNextQueuedObj,
    coverNameClass,
    withCoverMark,
    LEADER_NUM_CLASS,
    showsLeaderMark,
} from "@web/objectList/context.ts";
import type { ObjectListStrategy } from "./types.ts";

// ── Compact (horizontal rows, vertical HP bar) ──────────────

export const compactStrategy: ObjectListStrategy = {
    mode: 'compact',
    cardContextMenu: true,
    render(ctx) {
        const { objects, tm, teamAttacking } = ctx;
        const cards = objects.map((obj: any) => {
            const num = String(obj.shortcut);
            const isPlayer = obj.shortcut === '@';
            const rawDesc = obj.desc || "";
            const isTeammate = tm?.isInTeam?.(rawDesc);
            const isAttacking = isAttackingObj(obj);
            const isNextQueued = isNextQueuedObj(obj, ctx, isPlayer);
            const isTarget = obj.avatar_target || false;

            // Apply filters before rendering
            const filterContext: EntryContext = {
                object: obj,
                displayNum: parseInt(num, 10),
                isTarget,
                isNextTarget: isNextQueued,
                isTeammate: isTeammate || false,
                rawDescription: rawDesc,
                isAttacking,
                attackCommand: ctx.attackCommand,
            };
            const filterResult = objectListFilters.apply(filterContext);

            // Card classes
            const cardClasses = ['object-card', 'object-card--compact'];
            if (isPlayer) cardClasses.push('object-card--player');
            if (isTeammate && !isPlayer) cardClasses.push('object-card--teammate');
            if (isTarget && !isPlayer) cardClasses.push('object-card--target');
            if (isNextQueued) cardClasses.push('object-card--next-queued');
            if (obj.attack_target) cardClasses.push('object-card--attack-target');
            if (obj.defense_target) cardClasses.push('object-card--defense-target');

            // Apply filter CSS classes to card
            if (filterResult.style?.cssClasses) {
                cardClasses.push(...filterResult.style.cssClasses);
            }

            // Number badge classes
            const numberClasses = ['object-card__number'];
            if (isNextQueued) numberClasses.push('object-card__number--next-target');
            if (showsLeaderMark(obj, ctx)) numberClasses.push(LEADER_NUM_CLASS);

            // Name classes
            const nameClasses = ['object-card__name'];
            const coverCls = coverNameClass(obj, ctx);
            if (coverCls) nameClasses.push(coverCls);
            if (isTarget && !isPlayer && !isTeammate) nameClasses.push('object-card__name--target');
            if (isTeammate && !isPlayer) nameClasses.push('object-card__name--teammate');
            if (isAttacking && !isPlayer && !isTeammate && !isTarget) nameClasses.push('object-card__name--attacking');

            // Apply teammate not attacking italic style
            if (isTeammate && !isPlayer && teamAttacking && !isAttacking) {
                nameClasses.push('object-card__name--teammate-not-attacking');
            }

            // Apply filter italic override
            if (filterResult.style?.italic) {
                nameClasses.push('object-card__name--teammate-not-attacking');
            }

            // Build name style from filter overrides
            let nameStyle = '';
            if (filterResult.style?.descriptionColor) {
                nameStyle += `color:${filterResult.style.descriptionColor};`;
            }
            if (filterResult.style?.descriptionBackgroundColor) {
                nameStyle += `background-color:${filterResult.style.descriptionBackgroundColor};`;
            }

            // Use filtered description if provided
            const displayDesc = filterResult.content?.description !== undefined
                ? filterResult.content.description
                : rawDesc;

            // Apply prefix and suffix from filters
            const customPrefix = filterResult.style?.prefix || "";
            const customSuffix = filterResult.style?.suffix || "";
            const finalDesc = `${customPrefix}${displayDesc}${customSuffix}`;

            // Build vertical HP bar with color based on health level (0-6 scale, 7 levels)
            let hpBarHtml = '';
            if (typeof obj.hp === 'number') {
                const hpLevel = hpLevelOf(obj.hp);
                const hpPercent = (hpLevel / 7) * 100;
                let hpColor = CARD_HP_COLORS[hpLevel] || '#22c55e';

                // Apply filter HP bar color override
                if (filterResult.style?.hpBarColor) {
                    hpColor = filterResult.style.hpBarColor;
                }

                const hpBarVerticalClass = isTeammate && !isPlayer ? 'object-card__hp-bar-vertical--teammate' : 'object-card__hp-bar-vertical';
                const hpBarVerticalTitle = isTeammate && !isPlayer ? 'Wycofaj się' : 'Przełam';
                hpBarHtml = `<div class="${hpBarVerticalClass}" data-object-num="${num}" data-object-id="${obj.num}" title="${hpBarVerticalTitle}">
                    <div class="object-card__hp-fill-vertical" style="height: ${hpPercent}%; background-color: ${hpColor}"></div>
                </div>`;
            }

            // Build attackers inline with name
            const attackers = ctx.allObjects
                .filter((o: any) => o.attack_num === obj.num)
                .map((o: any) => `<span class="object-card__attacker">${o.shortcut}</span>`)
                .join('');
            const attackersHtml = attackers ? `<span class="object-card__attackers-inline">${attackers}</span>` : '';

            // Build name element with optional style
            const nameStyleAttr = nameStyle ? ` style="${nameStyle}"` : '';

            // Build target dot for leader functionality
            const isLeader = ctx.isLeader;
            let targetDotHtml = '';
            if (isLeader) {
                if (isPlayer || isTeammate) {
                    // Self or teammate - defense target (greenyellow)
                    const activeClass = obj.defense_target ? 'object-card__target-dot--active' : '';
                    targetDotHtml = `<span class="object-card__target-dot object-card__target-dot--defense ${activeClass}" data-action="mark-defense" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel obrony"></span>`;
                } else {
                    // Enemy - attack target (orangered)
                    const activeClass = obj.attack_target ? 'object-card__target-dot--active' : '';
                    targetDotHtml = `<span class="object-card__target-dot object-card__target-dot--attack ${activeClass}" data-action="mark-attack" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel ataku"></span>`;
                }
            }

            // Compact card structure - HP bar on left, target dot before number
            return `<div class="${cardClasses.join(' ')}" data-object-id="${obj.num}" data-object-num="${num}">
                ${hpBarHtml}
                <div class="object-card__compact-content">
                    ${targetDotHtml}
                    <span class="${numberClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="${showsLeaderMark(obj, ctx) ? 'Prowadzi drużynę' : 'Zaatakuj'}">${num}</span>
                    <span class="${nameClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zasłoń"${nameStyleAttr}>${withCoverMark(obj, ctx, finalDesc)}</span>
                    ${attackersHtml}
                </div>
            </div>`;
        });

        return `<div class="objects-list-cards objects-list-cards--compact">${cards.join('')}</div>`;
    },
};
