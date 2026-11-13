// The classic "Kondycje" view: one monospace text line per object, e.g.
//   • 1 [#####--] Duzy ork      <- 2
// The pop-out window shows this view too, whatever the main window shows.

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { getColorLevel, COLOR_OBJECT } from "@web/colors.ts";
import { type RenderContext, hpLevelOf, coverNameClass, LEADER_NUM_CLASS } from "@web/objectList/context.ts";
import { entryKey, entryOf, objectData, type Entry } from "./entry.ts";
import { CoverMarked, Description, Rich } from "./markup.tsx";
import { cls, escapeHtml } from "./util.ts";

/** A piece of a line: text, plugin HTML, or an element. */
type Part = string | { html: string } | ReactNode;

/** Who may order whom: the leader's clickable dot, or `>>` once an order stands. */
function targetMark(entry: Entry, ctx: RenderContext): Part {
    const { obj } = entry;
    if (ctx.isLeader) {
        const data = objectData(entry);
        if (entry.isPlayer || entry.isTeammate) {
            // Self or teammate: defense target, command /wz
            return obj.defense_target
                ? <span className="target-dot target-dot-defense target-dot-active" {...data} style={{ color: 'greenyellow' }} title="Rozkazanie obrony celu">{'>>'}</span>
                : <span className="target-dot target-dot-defense" {...data} style={{ color: 'greenyellow' }} title="Wyznacz cel obrony">{'• '}</span>;
        }
        // Enemy: attack target, command /wa
        return obj.attack_target
            ? <span className="target-dot target-dot-attack target-dot-active" {...data} style={{ color: 'orangered' }} title="Rozkazanie ataku celu">{'>>'}</span>
            : <span className="target-dot target-dot-attack" {...data} style={{ color: 'orangered' }} title="Wyznacz cel ataku">{'• '}</span>;
    }
    // Non-leaders only see that an order stands.
    if (obj.attack_target) return <span style={{ color: 'orangered' }}>{'>>'}</span>;
    if (obj.defense_target) return <span style={{ color: 'greenyellow' }}>{'>>'}</span>;
    return "  ";
}

function numberLabel(entry: Entry, ctx: RenderContext): Part[] {
    const numberHtml = entry.filter.content?.numberLabel;
    if (numberHtml !== undefined) return [{ html: numberHtml }];
    const mark = targetMark(entry, ctx);
    if (entry.isPlayer) {
        const self = entry.leaderMark
            ? <span className={`object-num-self ${LEADER_NUM_CLASS}`} title="Prowadzisz drużynę">{entry.num}</span>
            : entry.num;
        return [mark, self];
    }
    return [mark, (
        <span
            className={cls('object-num', entry.isNextQueued && 'object-num-next-target', entry.leaderMark && LEADER_NUM_CLASS)}
            data-object-id={String(entry.obj.num)}
            data-object-num={entry.num}
            style={entry.isNextQueued ? { color: '#ffd700' } : undefined}
            title={entry.leaderMark ? "Prowadzi drużynę" : "Zaatakuj"}
        >{entry.num}</span>
    )];
}

function hpBar(entry: Entry): Part {
    const { obj, filter } = entry;
    if (filter.content?.hpBar !== undefined) return { html: filter.content.hpBar };
    if (typeof obj.hp !== "number") return "";
    const hp = hpLevelOf(obj.hp);
    const color = filter.style?.hpBarColor || COLOR_OBJECT[getColorLevel(hp, 7, false, true)];
    const content = <>[<span style={{ color }}>{"#".repeat(hp)}{"-".repeat(7 - hp)}</span>]</>;
    if (entry.isPlayer) return content;
    return entry.isTeammate
        ? <span className="object-hp-bar-teammate" {...objectData(entry)} title="Wycofaj się">{content}</span>
        : <span className="object-hp-bar" {...objectData(entry)} title="Przełam">{content}</span>;
}

/** The description, coloured by side and state unless a filter says otherwise. */
function description(entry: Entry, ctx: RenderContext): ReactNode {
    const { obj, filter } = entry;
    let color: string | undefined;
    const classes: string[] = [];
    if (!entry.isPlayer) {
        if (obj.avatar_target) {
            color = "#ffaaaa";
        } else if (entry.isTeammate) {
            color = "springgreen";
            if (ctx.teamAttacking && !entry.isAttacking) classes.push("team-not-attacking");
        } else if (typeof obj.hp === "number" && entry.isAttacking) {
            color = "#b19cd9";
        }
    }
    if (filter.style?.descriptionColor) color = filter.style.descriptionColor;
    // The italic class doubles as the filters' italic switch.
    if (filter.style?.italic) classes.push("team-not-attacking");
    if (filter.style?.cssClasses) classes.push(...filter.style.cssClasses);
    const background = filter.style?.descriptionBackgroundColor;
    const desc = <Description entry={entry} />;
    if (entry.isPlayer || (!color && !background)) return desc;
    const style: CSSProperties = {};
    if (color) style.color = color;
    if (background) style.backgroundColor = background;
    return <span className={classes.length ? classes.join(" ") : undefined} style={style}>{desc}</span>;
}

/** The text of a line's trailing parts loses its trailing spaces, as the line always has. */
function trimEnd(parts: Part[]): Part[] {
    const out = [...parts];
    while (out.length) {
        const last = out[out.length - 1];
        if (typeof last === "string") {
            const trimmed = last.trimEnd();
            if (trimmed) { out[out.length - 1] = trimmed; break; }
        } else if (isHtml(last)) {
            const trimmed = last.html.trimEnd();
            if (trimmed) { out[out.length - 1] = { html: trimmed }; break; }
        } else if (last !== null && last !== undefined && last !== false) {
            break;
        }
        out.pop();
    }
    return out;
}

function lineParts(entry: Entry, ctx: RenderContext): Part[] {
    const { obj, filter } = entry;
    const rawDesc = obj.desc || "";
    // With cover markers on, every row gets two extra columns so the shield
    // (floated over this padding) never covers the attacker arrow.
    const padding = " ".repeat(Math.max(0, ctx.descWidth - rawDesc.length) + (ctx.coverMarkers ? 2 : 0));
    const attackers = ctx.allObjects.filter((o: any) => o.attack_num === obj.num).map((o: any) => o.shortcut);
    const arrow = attackers.length ? ` <- ${attackers.join(" ")}` : "";
    const prefix = filter.style?.prefix;
    const suffix = filter.style?.suffix;
    const desc = entry.isPlayer
        ? <Description entry={entry} />
        : (
            <span
                className={cls("object-desc", coverNameClass(obj, ctx))}
                {...objectData(entry)}
                data-object-desc={rawDesc}
                data-teammate={entry.isTeammate ? "true" : "false"}
                title="Zasłoń"
            >
                <CoverMarked obj={obj} ctx={ctx}>{description(entry, ctx)}</CoverMarked>
            </span>
        );
    // The filters' suffix is HTML, so the padding and arrow around it join it as HTML.
    const tail: Part[] = suffix
        ? [{ html: `${escapeHtml(padding)}${suffix}${escapeHtml(arrow)}` }]
        : [`${padding}${arrow}`];
    return trimEnd([
        ...numberLabel(entry, ctx), " ", hpBar(entry), " ",
        prefix ? { html: prefix } : "", desc, ...tail,
    ]);
}

function isHtml(part: Part): part is { html: string } {
    return !!part && typeof part === "object" && "html" in part;
}

function renderPart(part: Part, i: number): ReactNode {
    if (isHtml(part)) return <Rich key={i} html={part.html} />;
    return <Fragment key={i}>{part}</Fragment>;
}

/** One object's line. */
export function ListLine({ obj, ctx }: { obj: any; ctx: RenderContext }) {
    return <>{lineParts(entryOf(obj, ctx), ctx).map(renderPart)}</>;
}

export function ListView({ ctx }: { ctx: RenderContext }) {
    return (
        <>
            {ctx.objects.map((obj: any, i: number) => (
                <Fragment key={entryKey(obj, i)}>
                    {i > 0 && <br />}
                    <ListLine obj={obj} ctx={ctx} />
                </Fragment>
            ))}
        </>
    );
}
