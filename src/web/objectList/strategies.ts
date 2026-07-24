// Object-list view strategies.
//
// Each flavor is a strategy that turns the shared RenderContext into the panel
// body's innerHTML. The shell (ObjectList) owns everything else — the dock
// window, data subscription, click / context-menu delegation, PiP, drag — and
// just picks a strategy by viewMode and delegates. The row markup below is moved
// verbatim from the old per-mode render methods (list / card / compact /
// compact-dots / raid) so behaviour is unchanged; `nearby` is the new
// forge-born "W poblizu" flavor.
//
// Click handling stays central in the shell: every flavor tags its clickable
// parts with the same `data-object-num` / `data-object-id` (+ `data-action`)
// attributes, so one delegated handler serves them all — the only per-flavor
// difference is which element carries them.

import { getColorLevel, COLOR_OBJECT } from "../colors.ts";
import { objectListFilters, type EntryContext } from "../objectListFilters.ts";
import {
    type ObjectListViewMode,
    type RenderContext,
    CARD_HP_COLORS,
    hpLevelOf,
    isAttackingObj,
    isNextQueuedObj,
    attackerObjectsOf,
} from "./context.ts";

export interface ObjectListStrategy {
    mode: ObjectListViewMode;
    /** Build the panel body innerHTML for this flavor. */
    render(ctx: RenderContext): string;
    /** When true the shell attaches its card context-menu handler to every
     *  `.objects-list-cards` container after render (card-family flavors). */
    cardContextMenu?: boolean;
}

// ── List (monospace text rows) ──────────────────────────────
// The classic "Kondycje" text view. Also reused verbatim by the PiP window
// (which always shows the list flavor), hence the exported `renderListLines`.

export function renderListLines(ctx: RenderContext): string[] {
    const { objects, tm, descWidth, teamAttacking } = ctx;
    return objects.map((obj: any) => {
        const num = String(obj.shortcut);
        const isPlayer = obj.shortcut === '@';
        // Target indicators
        let prefix = "  ";
        const isLeader = ctx.isLeader;
        const isTeammateForDot = tm?.isInTeam?.(obj.desc || "");

        if (isLeader) {
            // Leader sees clickable indicators
            if (isPlayer || isTeammateForDot) {
                // Self or teammate - defense target (greenyellow), command /wz
                if (obj.defense_target) {
                    prefix = `<span class="target-dot target-dot-defense target-dot-active" data-object-num="${num}" data-object-id="${obj.num}" style="color:greenyellow" title="Rozkazanie obrony celu">>></span>`;
                } else {
                    prefix = `<span class="target-dot target-dot-defense" data-object-num="${num}" data-object-id="${obj.num}" style="color:greenyellow" title="Wyznacz cel obrony">&#8226; </span>`;
                }
            } else {
                // Enemy - attack target (orangered), command /wa
                if (obj.attack_target) {
                    prefix = `<span class="target-dot target-dot-attack target-dot-active" data-object-num="${num}" data-object-id="${obj.num}" style="color:orangered" title="Rozkazanie ataku celu">>></span>`;
                } else {
                    prefix = `<span class="target-dot target-dot-attack" data-object-num="${num}" data-object-id="${obj.num}" style="color:orangered" title="Wyznacz cel ataku">&#8226; </span>`;
                }
            }
        } else {
            // Non-leaders see >> when target is set (not clickable)
            if (obj.attack_target) {
                prefix = `<span style="color:orangered">>></span>`;
            } else if (obj.defense_target) {
                prefix = `<span style="color:greenyellow">>></span>`;
            }
        }
        const isNextQueued = isNextQueuedObj(obj, ctx, isPlayer);
        const numClasses = ["object-num"];
        if (isNextQueued) {
            numClasses.push("object-num-next-target");
        }
        const numStyle = isNextQueued ? " style=\"color:#ffd700\"" : "";
        let numLabel = isPlayer
            ? `${prefix}${num}`
            : `${prefix}<span class="${numClasses.join(" ")}" data-object-id="${obj.num}" data-object-num="${num}"${numStyle} title="Zaatakuj">${num}</span>`;
        const rawDesc = obj.desc || "";
        const isTeammate = tm?.isInTeam?.(rawDesc);
        const isAttacking = isAttackingObj(obj);

        // Apply filters before rendering
        const filterContext: EntryContext = {
            object: obj,
            displayNum: parseInt(num, 10),
            isTarget: obj.avatar_target || false,
            isNextTarget: isNextQueued,
            isTeammate: isTeammate || false,
            rawDescription: rawDesc,
            isAttacking,
            attackCommand: ctx.attackCommand,
        };
        const filterResult = objectListFilters.apply(filterContext);

        // Use filtered number label if provided
        if (filterResult.content?.numberLabel !== undefined) {
            numLabel = filterResult.content.numberLabel;
        }

        // Build description with filter overrides
        let descriptionColor: string | undefined;
        const descClasses = [] as string[];

        // Default color logic
        if (!isPlayer) {
            if (obj.avatar_target) {
                descriptionColor = "#ffaaaa";
            } else if (isTeammate) {
                descriptionColor = "springgreen";
                if (teamAttacking && !isAttacking) {
                    descClasses.push("team-not-attacking");
                }
            } else if (
                typeof obj.hp === "number" &&
                isAttacking
            ) {
                descriptionColor = "#b19cd9";
            }
        }

        // Apply filter color override
        if (filterResult.style?.descriptionColor) {
            descriptionColor = filterResult.style.descriptionColor;
        }

        // Apply filter italic override (via CSS class)
        if (filterResult.style?.italic) {
            descClasses.push("team-not-attacking"); // This CSS class applies italic style
        }

        // Apply filter CSS classes
        if (filterResult.style?.cssClasses) {
            descClasses.push(...filterResult.style.cssClasses);
        }

        // Use filtered description if provided
        const displayDesc = filterResult.content?.description !== undefined
            ? filterResult.content.description
            : rawDesc;

        // Build colored description
        let coloredDesc = displayDesc;
        if (!isPlayer && (descriptionColor || filterResult.style?.descriptionBackgroundColor)) {
            const classAttr = descClasses.length ? ` class="${descClasses.join(" ")}"` : "";
            let style = "";
            if (descriptionColor) {
                style += `color:${descriptionColor};`;
            }
            if (filterResult.style?.descriptionBackgroundColor) {
                style += `background-color:${filterResult.style.descriptionBackgroundColor};`;
            }
            coloredDesc = `<span${classAttr} style="${style}">${displayDesc}</span>`;
        }

        const padding = " ".repeat(Math.max(0, descWidth - rawDesc.length));
        const isTeammateStr = isTeammate ? "true" : "false";
        const desc = isPlayer
            ? `${displayDesc}${padding}`
            : `<span class="object-desc" data-object-id="${obj.num}" data-object-num="${num}" data-object-desc="${rawDesc}" data-teammate="${isTeammateStr}" title="Zaslon">${coloredDesc}</span>${padding}`;

        // Build HP bar with filter override
        let bar = "";
        if (filterResult.content?.hpBar !== undefined) {
            bar = filterResult.content.hpBar;
        } else if (typeof obj.hp === "number") {
            const hp = hpLevelOf(obj.hp);
            const colorLevel = getColorLevel(hp, 7, false, true);
            let color = COLOR_OBJECT[colorLevel];

            // Apply filter HP bar color override
            if (filterResult.style?.hpBarColor) {
                color = filterResult.style.hpBarColor;
            }

            const filled = "#".repeat(hp);
            const empty = "-".repeat(7 - hp);
            const hpBarContent = `[<span style="color:${color}">${filled}${empty}</span>]`;
            // Make HP bar clickable for enemies and teammates (not player)
            if (!isPlayer && !isTeammate) {
                bar = `<span class="object-hp-bar" data-object-num="${num}" data-object-id="${obj.num}" title="Przelam">${hpBarContent}</span>`;
            } else if (isTeammate) {
                bar = `<span class="object-hp-bar-teammate" data-object-num="${num}" data-object-id="${obj.num}" title="Wycofaj sie">${hpBarContent}</span>`;
            } else {
                bar = hpBarContent;
            }
        }

        const attackers = objects
            .filter((o: any) => o.attack_num === obj.num)
            .map((o: any) => o.shortcut);
        const arrow = attackers.length ? ` <- ${attackers.join(" ")}` : "";

        // Apply prefix and suffix from filters (only to description)
        const customPrefix = filterResult.style?.prefix || "";
        const customSuffix = filterResult.style?.suffix || "";

        return `${numLabel} ${bar} ${customPrefix}${desc}${customSuffix}${arrow}`.trimEnd();
    });
}

const listStrategy: ObjectListStrategy = {
    mode: 'list',
    render: (ctx) => renderListLines(ctx).join("<br>"),
};

// ── Card ────────────────────────────────────────────────────

const cardStrategy: ObjectListStrategy = {
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

            // Name classes
            const nameClasses = ['object-card__name'];
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
                    <span class="object-card__icon object-card__icon--guard" data-action="guard" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"></span>
                    <span class="object-card__icon object-card__icon--przelam" data-action="przelam" data-object-num="${num}" data-object-id="${obj.num}" title="Przelam"></span>
                    ${markAttackIcon}
                `;
            } else if (isTeammate && !isPlayer) {
                const markDefenseClass = obj.defense_target ? 'object-card__icon--mark-defense--active' : '';
                const markDefenseIcon = isLeader ? `<span class="object-card__icon object-card__icon--mark-defense ${markDefenseClass}" data-action="mark-defense" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel obrony"></span>` : '';
                iconsHtml = `
                    <span class="object-card__icon object-card__icon--guard" data-action="guard" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"></span>
                    ${markDefenseIcon}
                `;
            }

            // Build attackers
            const attackers = objects
                .filter((o: any) => o.attack_num === obj.num)
                .map((o: any) => `<span class="object-card__attacker">${o.shortcut}</span>`)
                .join('');

            // Build name element with optional style
            const nameStyleAttr = nameStyle ? ` style="${nameStyle}"` : '';

            // Simplified card structure - single container, no absolute positioning
            return `<div class="${cardClasses.join(' ')}" data-object-id="${obj.num}" data-object-num="${num}">
                <div class="object-card__row1">
                    <span class="${numberClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaatakuj">${num}</span>
                    <span class="${nameClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"${nameStyleAttr}>${finalDesc}</span>
                    <span class="object-card__icons">${iconsHtml}</span>
                </div>
                <div class="object-card__row2">
                    <span class="object-card__attackers">${attackers}</span>
                </div>
                <div class="${isTeammate && !isPlayer ? 'object-card__hp-bar--teammate' : 'object-card__hp-bar'}" data-object-num="${num}" data-object-id="${obj.num}" title="${isTeammate && !isPlayer ? 'Wycofaj sie' : 'Przelam'}">${hpBarFill}</div>
            </div>`;
        });

        return `<div class="objects-list-cards">${cards.join('')}</div>`;
    },
};

// ── Compact (horizontal rows, vertical HP bar) ──────────────

const compactStrategy: ObjectListStrategy = {
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

            // Name classes
            const nameClasses = ['object-card__name'];
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
                const hpBarVerticalTitle = isTeammate && !isPlayer ? 'Wycofaj sie' : 'Przelam';
                hpBarHtml = `<div class="${hpBarVerticalClass}" data-object-num="${num}" data-object-id="${obj.num}" title="${hpBarVerticalTitle}">
                    <div class="object-card__hp-fill-vertical" style="height: ${hpPercent}%; background-color: ${hpColor}"></div>
                </div>`;
            }

            // Build attackers inline with name
            const attackers = objects
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
                    <span class="${numberClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaatakuj">${num}</span>
                    <span class="${nameClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"${nameStyleAttr}>${finalDesc}</span>
                    ${attackersHtml}
                </div>
            </div>`;
        });

        return `<div class="objects-list-cards objects-list-cards--compact">${cards.join('')}</div>`;
    },
};

// ── Compact dots (HP as dots) ───────────────────────────────

const compactDotsStrategy: ObjectListStrategy = {
    mode: 'compact-dots',
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
            const cardClasses = ['object-card', 'object-card--compact', 'object-card--compact-dots'];
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

            // Name classes
            const nameClasses = ['object-card__name'];
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

            // Build HP dots with color based on health level (0-6 scale, 7 levels)
            let hpDotsHtml = '';
            if (typeof obj.hp === 'number') {
                const hpLevel = hpLevelOf(obj.hp);
                let hpColor = CARD_HP_COLORS[hpLevel] || '#22c55e';

                // Apply filter HP bar color override
                if (filterResult.style?.hpBarColor) {
                    hpColor = filterResult.style.hpBarColor;
                }

                // Build dots - filled dots for current HP, empty smaller gray dots for missing HP
                const dots: string[] = [];
                for (let i = 0; i < 7; i++) {
                    if (i < hpLevel) {
                        dots.push(`<span class="object-card__hp-dot object-card__hp-dot--filled" style="background-color: ${hpColor}"></span>`);
                    } else {
                        dots.push(`<span class="object-card__hp-dot object-card__hp-dot--empty"></span>`);
                    }
                }

                const hpDotsClass = isTeammate && !isPlayer ? 'object-card__hp-dots--teammate' : 'object-card__hp-dots';
                const hpDotsTitle = isTeammate && !isPlayer ? 'Wycofaj sie' : 'Przelam';
                hpDotsHtml = `<div class="${hpDotsClass}" data-object-num="${num}" data-object-id="${obj.num}" title="${hpDotsTitle}">${dots.join('')}</div>`;
            }

            // Build attackers inline with name
            const attackers = objects
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

            // Compact dots card structure - HP dots instead of vertical bar
            return `<div class="${cardClasses.join(' ')}" data-object-id="${obj.num}" data-object-num="${num}">
                <div class="object-card__compact-content">
                    ${targetDotHtml}
                    <span class="${numberClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaatakuj">${num}</span>
                    ${hpDotsHtml}
                    <span class="${nameClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"${nameStyleAttr}>${finalDesc}</span>
                    ${attackersHtml}
                </div>
            </div>`;
        });

        return `<div class="objects-list-cards objects-list-cards--compact">${cards.join('')}</div>`;
    },
};

// ── Raid (WoW-style grid, team vs enemies) ──────────────────

const raidStrategy: ObjectListStrategy = {
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

            const nameClasses = ['object-card__name'];
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
            const hpBarTitle = isTeammate && !isPlayer ? 'Wycofaj sie' : 'Przelam';
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
                    <span class="object-card__icon object-card__icon--guard" data-action="guard" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"></span>
                    <span class="object-card__icon object-card__icon--przelam" data-action="przelam" data-object-num="${num}" data-object-id="${obj.num}" title="Przelam"></span>
                    ${markAttackIcon}
                `;
            } else if (isTeammate && !isPlayer) {
                const markDefenseClass = obj.defense_target ? 'object-card__icon--mark-defense--active' : '';
                const markDefenseIcon = isLeader ? `<span class="object-card__icon object-card__icon--mark-defense ${markDefenseClass}" data-action="mark-defense" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel obrony"></span>` : '';
                iconsHtml = `
                    <span class="object-card__icon object-card__icon--guard" data-action="guard" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"></span>
                    ${markDefenseIcon}
                `;
            }

            const attackers = objects
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
                        <span class="${numberClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaatakuj">${num}</span>
                        <span class="${nameClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"${nameStyleAttr}>${finalDesc}</span>
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

// ── Nearby ("W poblizu") ────────────────────────────────────
// The forge-born flavor: a compact key/name/HP row with an attacker "fray" line
// underneath. Ported from forge-ui/components/ObjectsPanel.tsx into the shared
// panel; the shell's click delegation drives .obj__key (attack), .obj__name
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

const nearbyStrategy: ObjectListStrategy = {
    mode: 'nearby',
    render(ctx) {
        const { objects, tm } = ctx;
        const rows = objects.map((obj: any) => {
            const num = String(obj.shortcut);
            const allegiance = nearbyAllegianceOf(obj, tm);
            const isPlayer = allegiance === 'you';
            const isTeammate = allegiance === 'ally';
            const hasHp = typeof obj.hp === 'number';

            // Match the stock affordances: number attacks enemies, name guards any
            // non-player, HP bar breaks (enemy) / pulls back (teammate).
            const keyClickable = allegiance === 'enemy';
            const nameClickable = !isPlayer;
            const hpClickable = hasHp && !isPlayer;

            const nameClass = nearbyNameClass(obj, allegiance);

            // Who is attacking THIS object, colored by their side.
            const attackerObjs = attackerObjectsOf(obj, objects);
            // Left edge marks the leader's chosen targets (same as the other
            // flavors): red = marked attack target, green = marked defense target.
            const targetCls =
                (obj.attack_target ? ' obj--attack-target' : '') +
                (obj.defense_target ? ' obj--defense-target' : '');

            const keyCls =
                'obj__key' + (isPlayer ? ' you' : '') + (keyClickable ? ' is-clickable' : '');
            const keyAttrs = keyClickable
                ? ` data-object-num="${num}" data-object-id="${obj.num}" title="Zaatakuj"`
                : '';

            const nameCls =
                'obj__name' + (nameClass ? ` ${nameClass}` : '') +
                (nameClickable ? ' is-clickable' : '');
            const nameAttrs = nameClickable
                ? ` data-object-num="${num}" data-object-id="${obj.num}" data-teammate="${isTeammate ? 'true' : 'false'}" title="Zaslon"`
                : '';

            let hpHtml = '';
            if (hasHp) {
                const level = hpLevelOf(obj.hp); // 1..7
                const pct = Math.round((level / 7) * 100);
                const hpCls = 'obj__hp' + (hpClickable ? ' is-clickable' : '');
                const hpAttrs = hpClickable
                    ? ` data-object-num="${num}" data-object-id="${obj.num}" data-teammate="${isTeammate ? 'true' : 'false'}" title="${isTeammate ? 'Wycofaj sie' : 'Przelam'}"`
                    : '';
                hpHtml = `<span class="${hpCls}" style="--hp:${pct}%"${hpAttrs}></span>`;
            }

            let atksHtml = '';
            if (attackerObjs.length > 0) {
                const chips = attackerObjs
                    .map((a: any) => `<span class="atk atk--${nearbyAllegianceOf(a, tm)}">${a.shortcut}</span>`)
                    .join('');
                atksHtml = `<span class="obj__atks" title="Atakowany przez">${chips}</span>`;
            }

            // One line: shortcut, HP bar, name (grows), attackers pushed right.
            return `<div class="obj${targetCls}" data-object-id="${obj.num}" data-object-num="${num}"><div class="obj__main"><span class="${keyCls}"${keyAttrs}><i>${num}</i></span>${hpHtml}<span class="${nameCls}"${nameAttrs}>${obj.desc ?? ''}</span>${atksHtml}</div></div>`;
        });

        return `<div class="objects-list-nearby">${rows.join('')}</div>`;
    },
};

// ── Registry ────────────────────────────────────────────────

export const STRATEGIES: Record<ObjectListViewMode, ObjectListStrategy> = {
    list: listStrategy,
    card: cardStrategy,
    compact: compactStrategy,
    'compact-dots': compactDotsStrategy,
    raid: raidStrategy,
    nearby: nearbyStrategy,
};

export function getStrategy(mode: ObjectListViewMode): ObjectListStrategy {
    return STRATEGIES[mode] ?? listStrategy;
}
