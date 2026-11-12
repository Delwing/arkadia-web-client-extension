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

// ── Card ────────────────────────────────────────────────────

export const cardStrategy: ObjectListStrategy = {
    mode: 'card',
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
            const cardClasses = ['object-card'];
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

            // Build HP bar with color based on health level (0-6 scale, 7 levels)
            let hpBarFill = '';
            if (filterResult.content?.hpBar !== undefined) {
                // Use custom HP bar from filter (raw HTML)
                hpBarFill = filterResult.content.hpBar;
            } else if (typeof obj.hp === 'number') {
                const hpLevel = hpLevelOf(obj.hp);
                const hpPercent = (hpLevel / 7) * 100;
                let hpColor = CARD_HP_COLORS[hpLevel] || '#22c55e';

                // Apply filter HP bar color override
                if (filterResult.style?.hpBarColor) {
                    hpColor = filterResult.style.hpBarColor;
                }

                hpBarFill = `<div class="object-card__hp-fill" style="width: ${hpPercent}%; background-color: ${hpColor}"></div>`;
            }

            // Build action icons (only for non-player, non-teammate)
            const isLeader = ctx.isLeader;
            let iconsHtml = '';
            if (!isPlayer && !isTeammate) {
                const markAttackClass = obj.attack_target ? 'object-card__icon--mark-attack--active' : '';
                const markAttackIcon = isLeader ? `<span class="object-card__icon object-card__icon--mark-attack ${markAttackClass}" data-action="mark-attack" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel ataku"></span>` : '';
                iconsHtml = `
                    <span class="object-card__icon object-card__icon--attack" data-action="attack" data-object-num="${num}" data-object-id="${obj.num}" title="Zaatakuj"></span>
                    <span class="object-card__icon object-card__icon--guard" data-action="guard" data-object-num="${num}" data-object-id="${obj.num}" title="Zasłoń"></span>
                    <span class="object-card__icon object-card__icon--przelam" data-action="przelam" data-object-num="${num}" data-object-id="${obj.num}" title="Przełam"></span>
                    ${markAttackIcon}
                `;
            } else if (isTeammate && !isPlayer) {
                const markDefenseClass = obj.defense_target ? 'object-card__icon--mark-defense--active' : '';
                const markDefenseIcon = isLeader ? `<span class="object-card__icon object-card__icon--mark-defense ${markDefenseClass}" data-action="mark-defense" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel obrony"></span>` : '';
                iconsHtml = `
                    <span class="object-card__icon object-card__icon--guard" data-action="guard" data-object-num="${num}" data-object-id="${obj.num}" title="Zasłoń"></span>
                    ${markDefenseIcon}
                `;
            }

            // Build attackers
            const attackers = ctx.allObjects
                .filter((o: any) => o.attack_num === obj.num)
                .map((o: any) => `<span class="object-card__attacker">${o.shortcut}</span>`)
                .join('');

            // Build name element with optional style
            const nameStyleAttr = nameStyle ? ` style="${nameStyle}"` : '';

            // Simplified card structure - single container, no absolute positioning
            return `<div class="${cardClasses.join(' ')}" data-object-id="${obj.num}" data-object-num="${num}">
                <div class="object-card__row1">
                    <span class="${numberClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="${showsLeaderMark(obj, ctx) ? 'Prowadzi drużynę' : 'Zaatakuj'}">${num}</span>
                    <span class="${nameClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zasłoń"${nameStyleAttr}>${withCoverMark(obj, ctx, finalDesc)}</span>
                    <span class="object-card__icons">${iconsHtml}</span>
                </div>
                <div class="object-card__row2">
                    <span class="object-card__attackers">${attackers}</span>
                </div>
                <div class="${isTeammate && !isPlayer ? 'object-card__hp-bar--teammate' : 'object-card__hp-bar'}" data-object-num="${num}" data-object-id="${obj.num}" title="${isTeammate && !isPlayer ? 'Wycofaj się' : 'Przełam'}">${hpBarFill}</div>
            </div>`;
        });

        return `<div class="objects-list-cards">${cards.join('')}</div>`;
    },
};
