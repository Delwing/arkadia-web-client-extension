import { getColorLevel, COLOR_OBJECT } from "@web/colors.ts";
import { objectListFilters, type EntryContext } from "@web/objectListFilters.ts";
import {
    type RenderContext,
    hpLevelOf,
    isAttackingObj,
    isNextQueuedObj,
    coverNameClass,
    withCoverMark,
    LEADER_NUM_CLASS,
    showsLeaderMark,
} from "@web/objectList/context.ts";
import type { ObjectListStrategy } from "./types.ts";

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
        const hasLeaderMark = showsLeaderMark(obj, ctx);
        if (hasLeaderMark) {
            numClasses.push(LEADER_NUM_CLASS);
        }
        const numStyle = isNextQueued ? " style=\"color:#ffd700\"" : "";
        const playerNum = hasLeaderMark
            ? `<span class="object-num-self ${LEADER_NUM_CLASS}" title="Prowadzisz drużynę">${num}</span>`
            : num;
        let numLabel = isPlayer
            ? `${prefix}${playerNum}`
            : `${prefix}<span class="${numClasses.join(" ")}" data-object-id="${obj.num}" data-object-num="${num}"${numStyle} title="${hasLeaderMark ? "Prowadzi drużynę" : "Zaatakuj"}">${num}</span>`;
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

        // With cover markers on, every row gets two extra columns so the shield
        // (floated over this padding) never covers the attacker arrow.
        const padding = " ".repeat(Math.max(0, descWidth - rawDesc.length) + (ctx.coverMarkers ? 2 : 0));
        const coverCls = coverNameClass(obj, ctx);
        const isTeammateStr = isTeammate ? "true" : "false";
        const desc = isPlayer
            ? `${displayDesc}${padding}`
            : `<span class="object-desc${coverCls ? ` ${coverCls}` : ""}" data-object-id="${obj.num}" data-object-num="${num}" data-object-desc="${rawDesc}" data-teammate="${isTeammateStr}" title="Zasłoń">${withCoverMark(obj, ctx, coloredDesc)}</span>${padding}`;

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
                bar = `<span class="object-hp-bar" data-object-num="${num}" data-object-id="${obj.num}" title="Przełam">${hpBarContent}</span>`;
            } else if (isTeammate) {
                bar = `<span class="object-hp-bar-teammate" data-object-num="${num}" data-object-id="${obj.num}" title="Wycofaj się">${hpBarContent}</span>`;
            } else {
                bar = hpBarContent;
            }
        }

        const attackers = ctx.allObjects
            .filter((o: any) => o.attack_num === obj.num)
            .map((o: any) => o.shortcut);
        const arrow = attackers.length ? ` <- ${attackers.join(" ")}` : "";

        // Apply prefix and suffix from filters (only to description)
        const customPrefix = filterResult.style?.prefix || "";
        const customSuffix = filterResult.style?.suffix || "";

        return `${numLabel} ${bar} ${customPrefix}${desc}${customSuffix}${arrow}`.trimEnd();
    });
}

export const listStrategy: ObjectListStrategy = {
    mode: 'list',
    render: (ctx) => renderListLines(ctx).join("<br>"),
};
