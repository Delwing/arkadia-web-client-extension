import { objectListFilters, type EntryContext } from "@web/objectListFilters.ts";
import {
    CARD_HP_COLORS,
    hpLevelOf,
    isAttackingObj,
    isNextQueuedObj,
    coverNameClass,
    withCoverMark,
    isTeamLeaderObj,
    LEADER_NUM_CLASS,
    showsLeaderMark,
} from "@web/objectList/context.ts";
import type { ObjectListStrategy } from "./types.ts";

// ── Raid (WoW-style grid, team vs enemies) ──────────────────

export const raidStrategy: ObjectListStrategy = {
    mode: 'raid',
    cardContextMenu: true,
    render(ctx) {
        const { objects, tm, teamAttacking, isLeader } = ctx;

        const buildCard = (obj: any): string => {
            const num = String(obj.shortcut);
            const isPlayer = obj.shortcut === '@';
            const rawDesc = obj.desc || "";
            const isTeammate = tm?.isInTeam?.(rawDesc);
            const isAttacking = isAttackingObj(obj);
            const isNextQueued = isNextQueuedObj(obj, ctx, isPlayer);
            const isTarget = obj.avatar_target || false;

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

            const cardClasses = ['object-card', 'object-card--raid'];
            if (isPlayer) cardClasses.push('object-card--player');
            if (isTeammate && !isPlayer) cardClasses.push('object-card--teammate');
            if (isTarget && !isPlayer) cardClasses.push('object-card--target');
            if (isNextQueued) cardClasses.push('object-card--next-queued');
            if (obj.attack_target) cardClasses.push('object-card--attack-target');
            if (obj.defense_target) cardClasses.push('object-card--defense-target');
            if (filterResult.style?.cssClasses) {
                cardClasses.push(...filterResult.style.cssClasses);
            }

            const numberClasses = ['object-card__number'];
            if (isNextQueued) numberClasses.push('object-card__number--next-target');
            if (showsLeaderMark(obj, ctx)) numberClasses.push(LEADER_NUM_CLASS);

            const nameClasses = ['object-card__name'];
            const coverCls = coverNameClass(obj, ctx);
            if (coverCls) nameClasses.push(coverCls);
            if (isTarget && !isPlayer && !isTeammate) nameClasses.push('object-card__name--target');
            if (isTeammate && !isPlayer) nameClasses.push('object-card__name--teammate');
            if (isAttacking && !isPlayer && !isTeammate && !isTarget) nameClasses.push('object-card__name--attacking');
            if (isTeammate && !isPlayer && teamAttacking && !isAttacking) {
                nameClasses.push('object-card__name--teammate-not-attacking');
            }
            if (filterResult.style?.italic) {
                nameClasses.push('object-card__name--teammate-not-attacking');
            }

            let nameStyle = '';
            if (filterResult.style?.descriptionColor) {
                nameStyle += `color:${filterResult.style.descriptionColor};`;
            }
            if (filterResult.style?.descriptionBackgroundColor) {
                nameStyle += `background-color:${filterResult.style.descriptionBackgroundColor};`;
            }

            const displayDesc = filterResult.content?.description !== undefined
                ? filterResult.content.description
                : rawDesc;
            const customPrefix = filterResult.style?.prefix || "";
            const customSuffix = filterResult.style?.suffix || "";
            const finalDesc = `${customPrefix}${displayDesc}${customSuffix}`;

            let hpBarHtml = '';
            const hpBarClass = isTeammate && !isPlayer ? 'object-card__hp-bar--teammate' : 'object-card__hp-bar';
            const hpBarTitle = isTeammate && !isPlayer ? 'Wycofaj się' : 'Przełam';
            if (filterResult.content?.hpBar !== undefined) {
                hpBarHtml = `<div class="${hpBarClass} object-card__hp-bar--raid" data-object-num="${num}" data-object-id="${obj.num}" title="${hpBarTitle}">${filterResult.content.hpBar}</div>`;
            } else if (typeof obj.hp === 'number') {
                const hpLevel = hpLevelOf(obj.hp);
                const hpPercent = (hpLevel / 7) * 100;
                let hpColor = CARD_HP_COLORS[hpLevel] || '#22c55e';
                if (filterResult.style?.hpBarColor) {
                    hpColor = filterResult.style.hpBarColor;
                }
                hpBarHtml = `<div class="${hpBarClass} object-card__hp-bar--raid" data-object-num="${num}" data-object-id="${obj.num}" title="${hpBarTitle}"><div class="object-card__hp-fill" style="width: ${hpPercent}%; background-color: ${hpColor}"></div></div>`;
            } else {
                hpBarHtml = `<div class="${hpBarClass} object-card__hp-bar--raid" data-object-num="${num}" data-object-id="${obj.num}" title="${hpBarTitle}"></div>`;
            }

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

            const attackers = ctx.allObjects
                .filter((o: any) => o.attack_num === obj.num)
                .map((o: any) => `<span class="object-card__attacker">${o.shortcut}</span>`)
                .join('');
            const attackersHtml = attackers
                ? `<span class="object-card__attackers-inline">${attackers}</span>`
                : '';

            const nameStyleAttr = nameStyle ? ` style="${nameStyle}"` : '';

            return `<div class="${cardClasses.join(' ')}" data-object-id="${obj.num}" data-object-num="${num}">
                ${hpBarHtml}
                <div class="object-card__raid-content">
                    <div class="object-card__raid-row object-card__raid-row--main">
                        <span class="${numberClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="${showsLeaderMark(obj, ctx) ? 'Prowadzi drużynę' : 'Zaatakuj'}">${num}</span>
                        <span class="${nameClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zasłoń"${nameStyleAttr}>${withCoverMark(obj, ctx, finalDesc)}</span>
                    </div>
                    <div class="object-card__raid-row object-card__raid-row--attackers">
                        ${attackersHtml}
                    </div>
                </div>
                <span class="object-card__icons object-card__icons--raid">${iconsHtml}</span>
            </div>`;
        };

        // Split team (player + teammates) from enemies; player first within team section
        const teamObjects: any[] = [];
        const enemyObjects: any[] = [];
        for (const obj of objects) {
            const isPlayer = obj.shortcut === '@';
            const isTeammate = tm?.isInTeam?.(obj.desc || "");
            if (isPlayer || isTeammate) {
                teamObjects.push(obj);
            } else {
                enemyObjects.push(obj);
            }
        }
        teamObjects.sort((a: any, b: any) => {
            if (a.shortcut === '@') return -1;
            if (b.shortcut === '@') return 1;
            // The leader comes right after the player.
            if (isTeamLeaderObj(a, ctx)) return -1;
            if (isTeamLeaderObj(b, ctx)) return 1;
            return 0;
        });

        const sections: string[] = [];
        if (teamObjects.length > 0) {
            sections.push(
                `<div class="objects-list-cards objects-list-cards--raid objects-list-cards--raid-team">${teamObjects.map(buildCard).join('')}</div>`,
            );
        }
        if (enemyObjects.length > 0) {
            sections.push(
                `<div class="objects-list-cards objects-list-cards--raid objects-list-cards--raid-enemies">${enemyObjects.map(buildCard).join('')}</div>`,
            );
        }
        return `<div class="objects-list-raid-wrapper">${sections.join('')}</div>`;
    },
};
